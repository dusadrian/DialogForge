"use strict";

const assert = require("node:assert/strict");
const { createRuntimeSessionPublication } = require("../dist/src/runtime/events/runtimeEventDelivery");
const { createRuntimeRestartController } = require("../dist/src/runtime/session/runtimeRestartController");
const { createWebRRuntimeRestartAdapter } = require("../dist/src/runtime/providers/webr/webRRuntimeRestartAdapter");
const { createDatasetEditorSessionController } = require("../dist/src/dataset-editor/renderer/datasetEditorSessionController");

const replay = async function(browser, failure) {
    let snapshot = { providerId: browser ? "webr" : "r", lifecycleGeneration: 1, status: "ready" };
    let rows = [1, 2, 3];
    let workspaceLoaded = false;
    let releaseLoad;
    let loadStarted;
    const loadGate = new Promise(resolve => { releaseLoad = resolve; });
    const started = new Promise(resolve => { loadStarted = resolve; });
    const refreshes = [];
    const updates = [];
    const published = [];
    const editor = createDatasetEditorSessionController({
        invalidatePending() {},
        getDatasetName: () => "retained",
        refreshDataset: async () => { refreshes.push({ rows: [...rows], workspaceLoaded }); }
    });
    await editor.initialize(async () => snapshot);
    const publication = createRuntimeSessionPublication({
        publishSession: value => {
            published.push(value);
            updates.push(editor.update(value));
        }
    });
    const manager = {
        getSnapshot: () => snapshot,
        executeRuntimeMethod: async request => {
            if (request.method === "runtime.save_workspace_file" && failure === "save") {
                return { status: "failed" };
            }
            if (request.method === "runtime.load_workspace_file") {
                loadStarted();
                await loadGate;
                if (failure === "load") {
                    return { status: "failed" };
                }
                if (failure === "load-throw") {
                    throw new Error("Synthetic workspace restore failure.");
                }
                rows = ["alpha", "beta"];
                workspaceLoaded = true;
            }
            return { status: "ready" };
        },
        stop: async () => {
            rows = [];
            snapshot = { ...snapshot, lifecycleGeneration: 2, status: "stopped" };
            publication.publish(snapshot);
            return snapshot;
        },
        start: async () => {
            snapshot = { ...snapshot, lifecycleGeneration: 3, status: "ready" };
            publication.publish(snapshot);
            if (failure === "start") {
                throw new Error("Synthetic startup failure after early ready.");
            }
            return snapshot;
        }
    };
    const callbacks = {
        deferRuntimeSessionReady: publication.deferReady,
        invalidateDatasetPreview() {},
        setRuntimeSession() {},
        sendRuntimeSession: value => publication.publish(value),
        refreshWorkspace: async () => {},
        captureWorkspaceBaseline: async () => {}
    };
    const controller = browser
        ? createWebRRuntimeRestartAdapter({
            ...callbacks,
            getRuntime: () => ({ FS: {
                readFile: async () => new Uint8Array([1]),
                writeFile: async () => {}
            } }),
            getRuntimeSessionManager: () => manager,
            readRuntimeSnapshot: manager.getSnapshot,
            stopRuntime: manager.stop,
            startRuntime: manager.start
        })
        : createRuntimeRestartController({
            ...callbacks,
            runtimeSessionManager: manager,
            createWorkspacePath: () => "/fixture.RData",
            removeWorkspaceFile() {}
        });
    const pending = controller.restart("restore", "fixture");
    if (failure === "save" || failure === "start") {
        await assert.rejects(pending);
        assert.equal(published.some(value => value.status === "ready"), false,
            "Thrown restart must not replay its held ready snapshot.");
        assert.equal(publication.publish(snapshot), true,
            "Failure must release its hold for subsequent current publications.");
        await Promise.all(updates);
        return;
    }

    await started;
    await Promise.all(updates);
    assert.deepEqual(refreshes, [], "Retained editor must not read an empty pre-Restore runtime.");
    assert.equal(published.some(value => value.status === "ready"), false);
    releaseLoad();
    const result = await pending;
    await Promise.all(updates);
    const restored = failure !== "load" && failure !== "load-throw";
    assert.equal(result.workspaceRestored, restored);
    assert.equal(published.at(-1), result, "Final Restore fields cannot be replaced with a bare ready snapshot.");
    assert.deepEqual(refreshes, [{ rows: restored ? ["alpha", "beta"] : [], workspaceLoaded: restored }]);
    if (!restored) {
        assert.ok(result.workspaceRestoreMessage.includes("could not be restored"),
            "Failed Restore must preserve the recovery warning in the published result.");
    }
    publication.publish(result);
    await Promise.all(updates);
    assert.equal(refreshes.length, 1, "Duplicate ready after Restore must not reread the editor.");
};

const main = async function() {
    for (const browser of [false, true]) {
        for (const failure of [null, "save", "start", "load", "load-throw"]) {
            await replay(browser, failure);
        }
    }
    console.log("Shared restart publication defers early ready, refreshes restored data once, and releases failure holds.");
};

main().catch(error => { console.error(error); process.exitCode = 1; });
