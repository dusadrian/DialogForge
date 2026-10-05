"use strict";

const assert = require("node:assert/strict");
const { createRuntimeSessionDatasetChannelAdapter } = require(
    "../dist/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter"
);
const { createDatasetViewerMutationIpcController } = require(
    "../dist/src/shell-electron/dataset-editor/datasetViewerMutationIpcController"
);
const { datasetEditorIpcChannels } = require("../dist/src/dataset-editor/datasetEditorIpc");

const checkColumnAction = async function(method) {
    for (const status of ["updated", "failed", "throws"]) {
        for (const visibility of ["hidden", "visible"]) {
            const outputs = [];
            for (const host of ["native", "browser"]) {
                const requests = [];
                const effects = [];
                const failure = Error("fixture rename failed");
                const runtime = {
                    getSnapshot: () => ({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" }),
                    getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
                    [method === "updateColumnName" ? "renameColumn" : method]: async request => {
                        requests.push(request);
                        if (status === "throws") {
                            throw failure;
                        }
                        return { ...request, status,
                            columnName: method === "insertColumn" ? request.newName : request.columnName,
                            columnIndex: 2, columnCount: 4 };
                    }
                };
                let rename;
                if (host === "native") {
                    const handlers = new Map();
                    createDatasetViewerMutationIpcController({
                        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                        runtimeSessionManager: runtime,
                        uiCommandVisibility: () => visibility,
                        invalidateInitialDatasetPreview: name => effects.push(["preview", name]),
                        sendDatasetEditorChanges: changes => effects.push(["changes", changes]),
                        sendWorkspaceSnapshot: async (snapshot, options) => {
                            assert.deepEqual(snapshot, runtime.getWorkspaceSnapshot());
                            effects.push(["workspace", options]);
                            return true;
                        },
                        broadcastRuntimeEvents: async options => effects.push(["broadcast", options])
                    });
                    rename = payload => handlers.get(datasetEditorIpcChannels[method])({}, payload);
                } else {
                    rename = createRuntimeSessionDatasetChannelAdapter({
                        runtimeSessionManager: runtime,
                        uiCommandVisibility: () => visibility,
                        invalidateDataset: async (name, effect) => effects.push(["invalidate", name, effect])
                    })[method];
                }
                const payload = { name: "data", column: "old", nextName: "new", position: "after" };
                let result;
                if (status === "throws") {
                    await assert.rejects(rename(payload), error => error === failure);
                } else {
                    result = await rename(payload);
                    const expected = {
                        updateColumnName: { column: "old", name: "new" },
                        insertColumn: { name: "data", column: "old", nextName: "new",
                            columnIndex: 2, columnCount: 4, position: "after" },
                        removeColumn: { column: "old", columnCount: 4 }
                    };
                    assert.deepEqual(result, status === "updated" ? expected[method] : null);
                }
                assert.equal(requests[0].uiCommandVisibility, visibility);
                if (status !== "updated") {
                    assert.deepEqual(effects, []);
                } else if (host === "native") {
                    const changes = {
                        updateColumnName: { name: "data", kind: "dataset_column_renamed", columns: ["old", "new"] },
                        insertColumn: { name: "data", kind: "dataset_columns_changed", columns: ["new"],
                            columnIndex: 2, columnCount: 4, schemaChanged: true },
                        removeColumn: { name: "data", kind: "dataset_column_removed", columns: ["old"], columnCount: 4 }
                    };
                    assert.deepEqual(effects, [
                        ["preview", "data"],
                        ["changes", [changes[method]]],
                        ["workspace", { warmActiveDataset: false, refreshProductDialogs: true }],
                        ["broadcast", { sendDatasetChanges: false }]
                    ]);
                } else {
                    assert.deepEqual(effects, [["invalidate", "data", {
                        previewChanged: true, variableMetadataChanged: true, variableMetadataPatched: false,
                        warmVariableMetadata: true
                    }]]);
                }
                outputs.push({ requests, result });
            }
            assert.deepEqual(outputs[0], outputs[1], "Both adapters use the SAME column action.");
        }
    }
};

const main = async function() {
    for (const method of ["updateColumnName", "insertColumn", "removeColumn"]) {
        await checkColumnAction(method);
    }
    console.log("Shared column mutation cases passed; rendered native/WebR acceptance remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
