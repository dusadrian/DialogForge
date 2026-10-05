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
