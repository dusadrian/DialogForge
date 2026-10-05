"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { runOwnedRuntimeStartupStage } = require("../dist/src/runtime/session/runtimeStartupStage");
const { createRuntimeOperationQueue } = require("../dist/src/runtime/session/runtimeOperationQueue");
const { startBrowserWebRRuntime } = require("../dist/src/runtime/providers/webr/webRBrowserStartup");

const main = async function() {
    for (const host of ["r", "webr"]) {
        let dispatched = false;
        await assert.rejects(runOwnedRuntimeStartupStage({
            isCurrent: () => false,
            run: async function() { dispatched = true; }
        }), /retired before dispatch/);
        assert.equal(dispatched, false);

        for (const retire of [false, true]) {
            let current = true;
            let finish;
            const pending = new Promise((resolve) => { finish = resolve; });
            const resource = { id: `${host}-allocated` };
            const discarded = [];
            const startup = runOwnedRuntimeStartupStage({
                isCurrent: () => current,
                run: () => pending,
                discard: (value) => { discarded.push(value); }
            });
            const completion = retire
                ? assert.rejects(startup, /retired before completion/) : startup;
            current = !retire;
            finish(resource);
            const result = await completion;
            if (!retire) {
                assert.equal(result, resource);
            }
            assert.deepEqual(discarded, retire ? [resource] : []);
        }
    }

    const queue = createRuntimeOperationQueue();
    assert.equal(queue.isRetired(), false);
    queue.retire();
    assert.equal(queue.isRetired(), true, "Startup must see retirement before shell state is cleared.");

    // A split library's second image is still part of startup. Neither the
    // console nor its first command may become the package readiness barrier.
    let releaseLibrary;
    let libraryStarted;
    let startupReady = false;
    const libraryGate = new Promise((resolve) => { releaseLibrary = resolve; });
    const mounting = new Promise((resolve) => { libraryStarted = resolve; });
    class StartupLibraryWebR {
        constructor() { this.FS = { mkdir: async () => {} }; }
        async init() {}
        async flush() { return []; }
        async evalRVoid() {}
        async close() {}
    }
    const preparedStartup = startBrowserWebRRuntime({
        workingDirectoryPath: "/fixture", setStatus: () => {},
        importWebRModule: async () => ({ WebR: StartupLibraryWebR }),
        mountPackageLibrary: async function() {
            libraryStarted();
            await libraryGate;
        }
    }).then(() => { startupReady = true; });
    await mounting;
    assert.equal(startupReady, false, "Startup waits for the entire shipped library.");
    releaseLibrary();
    await preparedStartup;
    assert.equal(startupReady, true);

    const shell = fs.readFileSync(path.join(__dirname, "../src/shell-web/pages/shell.js"), "utf8");
    assert.match(shell, /\[manifest, manifest\?\.deferred\]/,
        "Both split images must be prepared by the startup path.");
    assert.doesNotMatch(shell, /deferredPackageLibraries|schedulePrefetch|async prepareRequest\(/,
        "Commands must not perform first-use library preparation.");
    assert.doesNotMatch(shell, /fetchHelperArchive:/,
        "The shell must use the shared loader's pinned helper, not a second versioned URL.");
    const readyPosition = shell.indexOf('setRuntimeStatus("WebR ready")');
    for (const preparation of [
        "run: () => dialogPreparation",
        "run: () => prewarmWebRGraphicsCapture(runtime)"
    ]) {
        const position = shell.indexOf(preparation);
        assert.ok(position >= 0 && readyPosition > position,
            "Startup preparation must finish before the ready status.");
    }
    assert.ok(
        shell.indexOf("const dialogPreparation =")
            < shell.indexOf("run: () => startBrowserWebRRuntime({"),
        "Dialog resources start loading alongside worker initialization."
    );

    // Exercise the actual shell preparation function: independent frames must
    // start together, but neither an unfinished control nor a failure may be
    // mistaken for readiness.
    const preparationSource = shell.slice(
        shell.indexOf("const prepareBrowserDialogs ="),
        shell.indexOf("const openDialog =")
    );
    const createPreparation = new Function(
        "state", "prepareBrowserDialog",
        `${preparationSource}\nreturn prepareBrowserDialogs;`
    );
    for (const failControls of [false, true]) {
        const started = [];
        const release = [];
        let finished = false;
        const prepare = createPreparation({ composition: {
            sharedDialogs: [{ id: "shared" }],
            productDialogs: [{ id: "product" }]
        } }, async function(dialog) {
            started.push(dialog.id);
            return {
                frameReady: Promise.resolve(),
                controlsReady: new Promise((resolve, reject) => {
                    release.push({ resolve, reject });
                })
            };
        });
        const pending = prepare().then(() => { finished = true; });
        const completion = failControls
            ? assert.rejects(pending, /controls failed/) : pending;
        await Promise.resolve();
        assert.deepEqual(started, ["shared", "product"]);
        release[1].resolve();
        await Promise.resolve();
        assert.equal(finished, false, "All dialog controls remain part of the barrier.");
        if (failControls) {
            release[0].reject(new Error("controls failed"));
        } else {
            release[0].resolve();
        }
        await completion;
        assert.equal(finished, !failControls);
    }

    for (const failure of ["init", "mount", "working-directory", "shim", "none"]) {
        const closed = [];
        const commands = [];
        let allocated;
        class FixtureWebR {
            constructor() {
                allocated = this;
                this.FS = { mkdir: async () => {} };
            }
            async init() {
                if (failure === "init") {
                    throw new Error("init failed");
                }
            }
            async flush() { return []; }
            async evalRVoid(command) {
                commands.push(command);
                if (failure === "working-directory" && command.includes("setwd")) {
                    throw new Error("working directory failed");
                }
                if (failure === "shim" && command.includes("shim_install")) {
                    throw new Error("shim failed");
                }
            }
            async close() { closed.push(this); }
            async destroy() { throw new Error("Object destruction is not worker shutdown."); }
        }
        const startup = startBrowserWebRRuntime({
            workingDirectoryPath: "/fixture", setStatus: () => {},
            importWebRModule: async () => ({ WebR: FixtureWebR }),
            mountPackageLibrary: async function() {
                if (failure === "mount") {
                    throw new Error("mount failed");
                }
            }
        });
        if (failure === "none") {
            assert.equal(await startup, allocated);
            assert.deepEqual(closed, [], "Accepted startup retains its worker.");
            assert.ok(commands.some((command) => command.includes("shim_install")));
        } else {
            await assert.rejects(startup, /failed/);
            assert.deepEqual(closed, [allocated], "Failed physical initialization closes only its allocated worker.");
        }
    }

    for (const relativePath of [
        "src/runtime/providers/r/session/runtimeProcessHost.ts",
        "src/shell-web/pages/shell.js"
    ]) {
        const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
        assert.match(source, /runOwnedRuntimeStartupStage(?:<RRuntimeLaunchPlan>)?\(/);
    }
    console.log("Shared startup stage cases passed; actual host cancellation acceptance remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
