"use strict";

const assert = require("node:assert/strict");
const { createRuntimeSessionDatasetChannelAdapter } = require(
    "../dist/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter"
);
const { createDatasetViewerMutationIpcController } = require(
    "../dist/src/shell-electron/dataset-editor/datasetViewerMutationIpcController"
);
const { datasetEditorIpcChannels } = require("../dist/src/dataset-editor/datasetEditorIpc");

const main = async function() {
    for (const method of ["updateRowName", "insertRow", "removeRow", "sortRows"]) {
        for (const status of ["updated", "failed", "throws"]) {
            const outputs = [];
            for (const host of ["native", "browser"]) {
                const requests = [];
                const effects = [];
                const cacheEffects = [];
                const failure = Error("fixture row mutation failed");
                const runtime = {
                    getSnapshot: () => ({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" }),
                    getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
                    [method]: async request => {
                        requests.push(request);
                        if (status === "throws") {
                            throw failure;
                        }
                        return { ...request, status, rowCount: 5, command: "fixture-sort" };
                    }
                };
                let mutate;
                if (host === "native") {
                    const handlers = new Map();
                    createDatasetViewerMutationIpcController({
                        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                        runtimeSessionManager: runtime,
                        uiCommandVisibility: () => "visible",
                        invalidateInitialDatasetPreview: (name, effect) => {
                            effects.push(["preview", name]);
                            cacheEffects.push([name, effect]);
                        },
                        sendDatasetEditorChanges: changes => effects.push(["changes", changes]),
                        sendWorkspaceSnapshot: async (snapshot, options) => {
                            assert.deepEqual(snapshot, runtime.getWorkspaceSnapshot());
                            effects.push(["workspace", options]);
                            return true;
                        },
                        broadcastRuntimeEvents: async options => effects.push(["broadcast", options])
                    });
                    mutate = payload => handlers.get(datasetEditorIpcChannels[method])({}, payload);
                } else {
                    mutate = createRuntimeSessionDatasetChannelAdapter({
                        runtimeSessionManager: runtime,
                        uiCommandVisibility: () => "visible",
                        invalidateDataset: async (name, effect) => {
                            effects.push(["invalidate", name, effect]);
                            cacheEffects.push([name, effect]);
                        }
                    })[method];
                }
                const payload = { name: "data", row: 2, nextName: "row-new", position: "after",
                    column: "x", decreasing: true, naLast: false, emptyLast: false };
                let result;
                if (status === "throws") {
                    await assert.rejects(mutate(payload), error => error === failure);
                } else {
                    result = await mutate(payload);
                    if (status === "failed") {
                        assert.equal(result, null);
                    }
                }
                assert.equal(requests[0].uiCommandVisibility, "visible");
                if (method === "sortRows") {
                    assert.equal(requests[0].direction, "descending");
                    assert.equal(requests[0].naLast, false);
                    assert.equal(requests[0].emptyLast, false);
                } else {
                    assert.equal(requests[0].rowIndex, 1);
                }
                if (status !== "updated") {
                    assert.deepEqual(effects, []);
                } else if (host === "browser") {
                    assert.deepEqual(effects, [["invalidate", "data", {
                        previewChanged: true,
                        variableMetadataChanged: method === "insertRow" || method === "removeRow",
                        variableMetadataPatched: false, warmVariableMetadata: true
                    }]]);
                } else {
                    const change = { name: "data", kind: "dataset_rows_changed" };
                    if (method !== "sortRows") {
                        change.rows = [2];
                    }
                    if (method !== "updateRowName") {
                        change.rowCount = 5;
                    }
                    if (method === "insertRow" || method === "removeRow") {
                        change.schemaChanged = true;
                    }
                    assert.deepEqual(effects, [
                        ["preview", "data"],
                        ["changes", [change]],
                        ["workspace", { warmActiveDataset: false,
                            refreshProductDialogs: method === "insertRow" || method === "removeRow" }],
                        ["broadcast", { sendDatasetChanges: false }]
                    ]);
                }
                outputs.push({ requests, result, cacheEffects });
            }
            assert.deepEqual(outputs[0], outputs[1], "Both adapters use the SAME row actions.");
        }
    }
    console.log("Shared row mutation cases passed; rendered native/WebR acceptance remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
