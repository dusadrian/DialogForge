"use strict";

const assert = require("node:assert/strict");
const { createDatasetViewerMutationIpcController } = require(
    "../dist/src/shell-electron/dataset-editor/datasetViewerMutationIpcController"
);
const { createRuntimeSessionDatasetChannelAdapter } = require(
    "../dist/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter"
);
const { datasetEditorIpcChannels } = require("../dist/src/dataset-editor/datasetEditorIpc");

const main = async function() {
    for (const method of ["updateCell", "updateColumnName", "updateRowName", "insertRow",
        "removeRow", "insertColumn", "removeColumn", "sortRows", "updateVariable"]) {
        for (const transition of ["generation", "status", "replacement", "patch-restart"]) {
            if (transition === "patch-restart" && method !== "updateVariable") {
                continue;
            }
            for (const host of ["native", "browser"]) {
                if (host === "native" && transition === "replacement") {
                    continue;
                }
                let session = { providerId: "fixture", lifecycleGeneration: 1, status: "ready" };
                let current = true;
                let release;
                const held = new Promise(resolve => { release = resolve; });
                const runtimeMethod = method === "updateCell" ? "writeCell"
                    : method === "updateColumnName" ? "renameColumn"
                    : method === "updateVariable" ? "executeRuntimeMethod" : method;
                const runtime = {
                    getSnapshot: () => session,
                    getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
                    [runtimeMethod]: () => held
                };
                let patches = 0;
                const patch = () => {
                    patches += 1;
                    assert.equal(transition, "patch-restart", "Retired metadata must not patch caches");
                    session = { ...session, lifecycleGeneration: 2 };
                };
                let mutate;
                if (host === "native") {
                    const handlers = new Map();
                    createDatasetViewerMutationIpcController({
                        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                        runtimeSessionManager: runtime,
                        uiCommandVisibility: () => "hidden",
                        patchVariableMetadata: patch,
                        invalidateInitialDatasetPreview: () => assert.fail("Retired mutation invalidated cache"),
                        sendDatasetEditorChanges: () => assert.fail("Retired mutation published changes"),
                        sendWorkspaceSnapshot: () => assert.fail("Retired mutation published workspace"),
                        broadcastRuntimeEvents: () => assert.fail("Retired mutation broadcast events")
                    });
                    mutate = input => handlers.get(datasetEditorIpcChannels[method])({}, input);
                } else {
                    mutate = createRuntimeSessionDatasetChannelAdapter({
                        runtimeSessionManager: runtime,
                        isCurrentRuntime: () => current,
                        patchVariableMetadata: patch,
                        invalidateDataset: () => assert.fail("Retired mutation invalidated cache")
                    })[method];
                }
                const pending = mutate({ name: "data", row: 1, column: "x", variableName: "x", value: 43 });
                if (transition === "generation") {
                    session = { ...session, lifecycleGeneration: 2 };
                } else if (transition === "status") {
                    session = { ...session, status: "stopped" };
                } else if (transition === "replacement") {
                    current = false;
                }
                release(method === "updateVariable" ? { status: "ready", value: { name: "x" } }
                    : { status: "updated", objectName: "data", rowIndex: 0, columnName: "x" });
                assert.equal(await pending, null, "Retired mutation must not return a successful viewer projection.");
                assert.equal(patches, transition === "patch-restart" ? 1 : 0);
            }
        }
    }
    console.log("Viewer retirement cases passed; actual downstream/rendered acceptance remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
