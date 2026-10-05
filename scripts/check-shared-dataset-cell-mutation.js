"use strict";

const assert = require("node:assert/strict");
const { createRuntimeSessionDatasetChannelAdapter } = require(
    "../dist/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter"
);
const { createDatasetViewerMutationIpcController } = require(
    "../dist/src/shell-electron/dataset-editor/datasetViewerMutationIpcController"
);
const { createCellUpdateResult } = require("../dist/src/runtime/tabular-data/tabularProtocol");
const { datasetEditorIpcChannels } = require("../dist/src/dataset-editor/datasetEditorIpc");
const { createDatasetEditorSettings } = require("../dist/src/dataset-editor/datasetEditorSettings");

const checkChangingVisibility = async function() {
    for (const host of ["native", "browser"]) {
        let settings = {};
        const editorSettings = createDatasetEditorSettings({
            readSettings: () => settings,
            writeSettings: value => { settings = value; }
        });
        const requests = [];
        const runtime = {
                    getSnapshot: () => ({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" }),
                    getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
            async writeCell(request) {
                requests.push(request);
                return createCellUpdateResult({ ...request, status: "failed" });
            }
        };
        let updateCell;
        if (host === "native") {
            const handlers = new Map();
            createDatasetViewerMutationIpcController({
                ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                runtimeSessionManager: runtime,
                uiCommandVisibility: editorSettings.uiCommandVisibility,
                invalidateInitialDatasetPreview: () => assert.fail("Failed write invalidated preview"),
                patchVariableMetadata: () => assert.fail("Failed write patched metadata"),
                sendDatasetEditorChanges: () => assert.fail("Failed write published changes"),
                sendWorkspaceSnapshot: () => assert.fail("Failed write published workspace"),
                broadcastRuntimeEvents: () => assert.fail("Failed write broadcast events")
            });
            updateCell = payload => handlers.get(datasetEditorIpcChannels.updateCell)({}, payload);
        } else {
            updateCell = createRuntimeSessionDatasetChannelAdapter({
                runtimeSessionManager: runtime,
                uiCommandVisibility: editorSettings.uiCommandVisibility,
                invalidateDataset: () => assert.fail("Failed write invalidated dataset")
            }).updateCell;
        }

        for (const value of [undefined, "visible", "hidden", "invalid", "visible"]) {
            settings = { uiActionCommandVisibility: value };
            await updateCell({ name: "data", row: 1, column: "x", value: 43 });
        }

        assert.deepEqual(requests.map(request => request.uiCommandVisibility), [
            "hidden", "visible", "hidden", "hidden", "visible"
        ], "The SAME settings getter must be read at dispatch, not captured at adapter creation.");
    }
};

const main = async function() {
    await checkChangingVisibility();
    for (const status of ["updated", "failed", "throws"]) {
        for (const visibility of ["hidden", "visible"]) {
            const outputs = [];
            for (const host of ["native", "browser"]) {
                const requests = [];
                const effects = [];
                const failure = Error("fixture runtime failed");
                const runtime = {
                    getSnapshot: () => ({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" }),
                    getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
                    async writeCell(request) {
                        requests.push(request);
                        if (status === "throws") {
                            throw failure;
                        }
                        return createCellUpdateResult({
                            ...request, status, cell: {
                                display: "43", raw: "43", declaredMissing: visibility === "visible"
                            }
                        });
                    }
                };
                let updateCell;
                if (host === "native") {
                    const handlers = new Map();
                    createDatasetViewerMutationIpcController({
                        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                        runtimeSessionManager: runtime,
                        uiCommandVisibility: () => visibility,
                        invalidateInitialDatasetPreview: name => effects.push(["preview", name]),
                        patchVariableMetadata: () => assert.fail("Cell update must not patch metadata"),
                        sendDatasetEditorChanges: changes => effects.push(["changes", changes]),
                        sendWorkspaceSnapshot: async (snapshot, options) => {
                            assert.deepEqual(snapshot, runtime.getWorkspaceSnapshot());
                            effects.push(["workspace", options]);
                            return true;
                        },
                        broadcastRuntimeEvents: async options => effects.push(["broadcast", options])
                    });
                    updateCell = payload => handlers.get(datasetEditorIpcChannels.updateCell)({}, payload);
                } else {
                    updateCell = createRuntimeSessionDatasetChannelAdapter({
                        runtimeSessionManager: runtime,
                        uiCommandVisibility: () => visibility,
                        invalidateDataset: async (name, effect, changes) => {
                            assert.deepEqual(changes, [{
                                name: "data", kind: "dataset_cells_changed",
                                rows: [2], columns: ["x"]
                            }]);
                            effects.push(["invalidate", name, effect]);
                        }
                    }).updateCell;
                }
                let result;
                if (status === "throws") {
                    await assert.rejects(updateCell({ name: "data", row: 2, column: "x", value: 43 }),
                        error => error === failure);
                } else {
                    result = await updateCell({ name: "data", row: 2, column: "x", value: 43 });
                    assert.deepEqual(result, status === "updated" ? {
                        display: "43", raw: "43", declaredMissing: visibility === "visible"
                    } : null);
                }
                assert.equal(requests[0].rowIndex, 1);
                assert.equal(requests[0].uiCommandVisibility, visibility);
                if (status !== "updated") {
                    assert.deepEqual(effects, [], "Failed writes must not publish success effects.");
                } else if (host === "native") {
                    assert.deepEqual(effects, [
                        ["preview", "data"],
                        ["changes", [{ name: "data", kind: "dataset_cells_changed", rows: [2], columns: ["x"] }]],
                        ["workspace", { warmActiveDataset: false, refreshProductDialogs: false }],
                        ["broadcast", { sendDatasetChanges: false }]
                    ]);
                } else {
                    assert.deepEqual(effects, [["invalidate", "data", {
                        previewChanged: true, variableMetadataChanged: false, variableMetadataPatched: false,
                        warmVariableMetadata: true
                    }]]);
                }
                outputs.push({ requests, result });
            }
            assert.deepEqual(outputs[0], outputs[1], "Both adapters use the SAME cell action.");
        }
    }
    console.log("Shared cell mutation adapter cases passed; rendered native/WebR acceptance remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
