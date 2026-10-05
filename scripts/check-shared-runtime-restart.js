"use strict";

const assert = require("node:assert/strict");
const { createRuntimeRestartController } = require("../dist/src/runtime/session/runtimeRestartController");
const { createWebRRuntimeRestartAdapter } = require("../dist/src/runtime/providers/webr/webRRuntimeRestartAdapter");

const fixture = function(mode, browser, recovery = {}) {
    const events = [];
    const published = [];
    const exports = [];
    let snapshot = { providerId: browser ? "webr" : "r", status: "ready", lifecycleGeneration: 1 };
    let files = new Map();
    let savedPath = "";
    const runtime = { FS: {
        readFile: async function(filePath) {
            const bytes = files.get(filePath);
            if (mode === "save-file-retired") {
                currentManager = { ...manager };
            }
            return bytes;
        },
        writeFile: async function(filePath, bytes) {
            if (mode === "restore-file-throw") {
                throw new Error("Synthetic worker file write failure.");
            }
            files.set(filePath, bytes);
            if (mode === "restore-file-retired") {
                currentManager = { ...manager };
            }
        }
    } };
    const manager = {
        getSnapshot: () => snapshot,
        executeRuntimeMethod: async function(request) {
            events.push(request.method);
            if (request.method === "runtime.save_workspace_file") {
                savedPath = request.params.path;
                if (mode === "save-failure") {
                    return { status: "failed" };
                }
                files.set(savedPath, new Uint8Array([1, 2, 3]));
                if (mode === "save-retired") {
                    snapshot = { ...snapshot, lifecycleGeneration: snapshot.lifecycleGeneration + 1 };
                }
            }
            if (mode === "load-retired" && request.method === "runtime.load_workspace_file") {
                snapshot = { ...snapshot, lifecycleGeneration: snapshot.lifecycleGeneration + 1 };
            }
            if (request.method === "runtime.load_workspace_file") {
                if (mode === "load-throw-retired") {
                    snapshot = { ...snapshot, lifecycleGeneration: snapshot.lifecycleGeneration + 1 };
                    throw new Error("Synthetic retired restore failure.");
                }
                if (mode === "load-throw") {
                    throw new Error("Synthetic restore failure.");
                }
            }
            return { status: mode === "load-failure" && request.method === "runtime.load_workspace_file"
                ? "failed" : "ready" };
        },
        stop: async function() {
            events.push("stop");
            if (mode === "stop-superseded") {
                return { ...snapshot, status: "ready" };
            }
            if (browser) {
                files = new Map();
            }
            snapshot = { ...snapshot, status: "stopped", lifecycleGeneration: snapshot.lifecycleGeneration + 1 };
            return snapshot;
        },
        start: async function() {
            events.push("start");
            const failed = mode === "start-failure" || mode === "start-throw";
            snapshot = { ...snapshot,
                status: failed ? "failed" : mode === "start-not-ready" ? "starting" : "ready",
                message: failed ? "Synthetic startup failure." : "Runtime startup state.",
                lifecycleGeneration: snapshot.lifecycleGeneration + 1 };
            if (mode === "start-throw-retired") {
                currentManager = { ...manager };
                throw new Error("Synthetic superseded startup.");
            }
            if (mode === "start-throw") {
                throw new Error("Synthetic startup failure.");
            }
            return snapshot;
        }
    };
    let currentManager = manager;
    const downloadSavedWorkspace = async function(fileName, bytes) {
        exports.push({ fileName, bytes: new Uint8Array(bytes) });
        if (recovery.failExport) {
            throw new Error("Synthetic recovery export failure.");
        }
        if (recovery.retireDuringExport) {
            currentManager = { ...manager };
        }
        // A physical download consumer cannot mutate the retained recovery snapshot.
        bytes[0] = 99;
    };
    const callbacks = {
        canPersistWorkspaceNow: () => mode !== "persistence-busy",
        invalidateDatasetPreview() { events.push("invalidate"); },
        setRuntimeSession(value) { published.push(value); },
        sendRuntimeSession(value) { published.push(value); },
        refreshWorkspace: async function() {
            events.push("refresh");
            if (mode === "refresh-retired") {
                snapshot = { ...snapshot, lifecycleGeneration: snapshot.lifecycleGeneration + 1 };
            }
        },
        captureWorkspaceBaseline: async () => { events.push("baseline"); }
    };
    const controller = browser
        ? createWebRRuntimeRestartAdapter({
            ...callbacks,
            getRuntime: () => runtime,
            getRuntimeSessionManager: () => currentManager,
            readRuntimeSnapshot: manager.getSnapshot,
            downloadSavedWorkspace,
            stopRuntime: manager.stop,
            startRuntime: manager.start
        })
        : createRuntimeRestartController({
            ...callbacks,
            runtimeSessionManager: manager,
            getRuntimeOwner: () => currentManager,
            createWorkspacePath: () => "/fixture.RData",
            exportSavedWorkspace: recovery.exportNative
                ? async function(filePath) {
                    const fileName = filePath.slice(filePath.lastIndexOf("/") + 1);
                    await downloadSavedWorkspace(fileName, new Uint8Array(files.get(filePath)));
                    return fileName;
                }
                : undefined,
            removeWorkspaceFile: (filePath) => { files.delete(filePath); }
        });
    return { controller, events, published, exports, savedPath: () => savedPath,
        readNativeSavedWorkspace: () => files.get(savedPath) };
};

const main = async function() {
    for (const browser of [false, true]) {
        const blocked = fixture("persistence-busy", browser);
        await assert.rejects(blocked.controller.restart("restore", "fixture"),
            /Finish the current runtime operation or input/);
        assert.deepEqual(blocked.events, [],
            "Persistence rejection must not enqueue a save, interrupt, stop or refresh.");
        await blocked.controller.restart("clean", "fixture");
        assert.ok(blocked.events.includes("stop"),
            "A physical persistence restriction must not block a requested clean restart.");
        for (const mode of ["success", "save-failure", "load-failure", "load-throw", "start-failure", "start-not-ready"]) {
            const test = fixture(mode, browser);
            if (mode === "save-failure") {
                await assert.rejects(test.controller.restart("restore", "fixture"));
                assert.equal(test.events.includes("stop"), false, "Failed save cannot discard the running session.");
                assert.deepEqual(test.exports, [], "Failed saves cannot export an incomplete workspace.");
                continue;
            }
            const result = await test.controller.restart("restore", "fixture");
            assert.equal(result.workspaceRestored, mode === "success");
            assert.equal(test.events.indexOf("runtime.save_workspace_file") < test.events.indexOf("stop"), true);
            assert.equal(test.events.indexOf("stop") < test.events.indexOf("start"), true);
            assert.equal(test.exports.length, browser && mode !== "success" ? 1 : 0,
                "Only saved workspaces left unrestored need a recovery download.");
            if (test.exports.length) {
                assert.deepEqual(test.exports[0].bytes, new Uint8Array([1, 2, 3]));
                assert.ok(result.workspaceRestoreMessage.includes(
                    `A recovery download was requested as ${test.exports[0].fileName}.`
                ));
            }
            if (mode === "start-failure" || mode === "start-not-ready") {
                assert.equal(test.events.includes("runtime.load_workspace_file"), false);
                assert.equal(test.events.includes("refresh"), false);
                assert.equal(test.events.includes("baseline"), false);
                assert.ok(result.workspaceRestoreMessage.includes("Runtime restart did not complete."));
                assert.ok(result.workspaceRestoreMessage.includes(test.savedPath()));
                assert.ok(result.workspaceRestoreMessage.includes(result.message));
            }
            if (browser) {
                const retained = test.controller.readSavedWorkspace(test.savedPath());
                assert.deepEqual(retained, mode === "success" ? null : new Uint8Array([1, 2, 3]));
            }
            else {
                assert.deepEqual(test.readNativeSavedWorkspace(),
                    mode === "success" ? undefined : new Uint8Array([1, 2, 3]));
            }
            if (mode === "load-failure" || mode === "load-throw") {
                assert.equal(result.status, "ready");
                assert.ok(result.workspaceRestoreMessage.includes(test.savedPath()));
                assert.ok(test.events.includes("refresh"));
                assert.ok(test.events.includes("baseline"));
            }
        }
        for (const mode of ["start-throw", "start-throw-retired"]) {
            const failed = fixture(mode, browser);
            await assert.rejects(failed.controller.restart("restore", "fixture"), function(error) {
                return error.message.includes("Runtime restart did not complete.")
                    && error.message.includes("Synthetic")
                    && error.message.includes(failed.savedPath());
            });
            assert.deepEqual(failed.published, [], "Thrown startup cannot publish a replacement session.");
            assert.equal(failed.events.includes("runtime.load_workspace_file"), false);
            assert.equal(failed.events.includes("refresh"), false);
            assert.equal(failed.events.includes("baseline"), false);
            const retained = browser
                ? failed.controller.readSavedWorkspace(failed.savedPath())
                : failed.readNativeSavedWorkspace();
            assert.deepEqual(retained, new Uint8Array([1, 2, 3]));
        }
        const cleanFailure = fixture("start-throw", browser);
        await assert.rejects(cleanFailure.controller.restart("clean", "fixture"), function(error) {
            return error.message === "Synthetic startup failure.";
        });
        assert.deepEqual(cleanFailure.exports, [], "Clean restart has no saved workspace to export.");
        for (const mode of ["start-failure", "load-failure", "stop-superseded", "start-throw"]) {
            const failedExport = fixture(mode, browser, { failExport: true, exportNative: true });
            let recoveryMessage;
            if (mode === "stop-superseded" || mode === "start-throw") {
                await assert.rejects(failedExport.controller.restart("restore", "fixture"), function(error) {
                    recoveryMessage = error.message;
                    return /Runtime did not stop|Synthetic startup failure/.test(recoveryMessage);
                });
            }
            else {
                const result = await failedExport.controller.restart("restore", "fixture");
                recoveryMessage = result.workspaceRestoreMessage;
            }
            assert.ok(recoveryMessage.includes("Recovery export failed: Synthetic recovery export failure."));
            assert.ok(recoveryMessage.includes(failedExport.savedPath()));
            assert.equal(failedExport.exports.length, 1);
            const retained = browser
                ? failedExport.controller.readSavedWorkspace(failedExport.savedPath())
                : failedExport.readNativeSavedWorkspace();
            assert.deepEqual(retained, new Uint8Array([1, 2, 3]),
                "Export failure must not discard or modify saved data.");
        }
        for (const mode of ["start-failure", "load-failure"]) {
            const retiredExport = fixture(mode, browser, { retireDuringExport: true, exportNative: true });
            await assert.rejects(retiredExport.controller.restart("restore", "fixture"), /Runtime session changed/);
            assert.deepEqual(retiredExport.published, [], "Export cannot publish a retired session.");
            assert.equal(retiredExport.events.includes("refresh"), false);
            assert.equal(retiredExport.exports.length, 1);
        }
        const concurrent = fixture("success", browser);
        const first = concurrent.controller.restart("restore", "first");
        const repeated = concurrent.controller.restart("restore", "second");
        assert.equal(first, repeated, "The common owner shares same-action work.");
        await assert.rejects(concurrent.controller.restart("clean", "conflict"), /different runtime restart/);
        await first;
        assert.equal(concurrent.events.filter((event) => event === "stop").length, 1);
        assert.equal(concurrent.events.filter((event) => event === "start").length, 1);
        await concurrent.controller.restart("clean", "later");
        assert.equal(concurrent.events.filter((event) => event === "start").length, 2);

        for (const mode of ["save-retired", "load-retired", "load-throw-retired", "refresh-retired", "stop-superseded"]) {
            const retired = fixture(mode, browser);
            await assert.rejects(retired.controller.restart("restore", "retired"), /Runtime session changed|Runtime did not stop/);
            if (mode === "save-retired") {
                assert.equal(retired.events.includes("stop"), false);
            }
            if (mode === "stop-superseded") {
                assert.equal(retired.events.includes("start"), false);
            }
            assert.equal(retired.events.includes("baseline"), false);
            if (browser && mode !== "save-retired") {
                assert.deepEqual(retired.controller.readSavedWorkspace(retired.savedPath()), new Uint8Array([1, 2, 3]));
            }
        }
        if (browser) {
            const writeFailure = fixture("restore-file-throw", true);
            const result = await writeFailure.controller.restart("restore", "fixture");
            assert.equal(result.workspaceRestored, false);
            assert.ok(result.workspaceRestoreMessage.includes(writeFailure.savedPath()));
            assert.deepEqual(writeFailure.controller.readSavedWorkspace(writeFailure.savedPath()),
                new Uint8Array([1, 2, 3]));
            assert.equal(writeFailure.events.includes("runtime.load_workspace_file"), false);
            for (const mode of ["save-file-retired", "restore-file-retired"]) {
                const retired = fixture(mode, browser);
                await assert.rejects(retired.controller.restart("restore", "retired"), /Runtime session changed/);
                assert.deepEqual(retired.controller.readSavedWorkspace(retired.savedPath()), new Uint8Array([1, 2, 3]));
                assert.equal(retired.events.includes("runtime.load_workspace_file"), false);
            }
        }
    }
    console.log("Shared restart source cases passed; actual host restart acceptance remains separate.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
