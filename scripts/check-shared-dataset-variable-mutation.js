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
    const metadata = { name: "x", label: "new label", measure: "ordinal" };
    for (const disposition of ["ready", "failed", "missing-value", "empty-name"]) {
        const outputs = [];
        for (const host of ["native", "browser"]) {
            const requests = [];
            const effects = [];
            const runtime = {
                    getSnapshot: () => ({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" }),
                    getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
                async executeRuntimeMethod(request) {
                    requests.push(request);
                    return { status: disposition === "failed" ? "failed" : "ready",
                        value: disposition === "missing-value" ? null : metadata,
                        message: "fixture patch failure" };
                }
            };
            const patch = (name, variable, value) => effects.push(["patch", name, variable, value]);
            let mutate;
            if (host === "native") {
                const handlers = new Map();
                createDatasetViewerMutationIpcController({
                    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                    runtimeSessionManager: runtime,
                    uiCommandVisibility: () => "hidden",
                    patchVariableMetadata: patch,
                    invalidateInitialDatasetPreview: (name, effect) => effects.push(["invalidate", name, effect]),
                    sendDatasetEditorChanges: changes => effects.push(["changes", changes]),
                    sendWorkspaceSnapshot: async (snapshot, options) => {
                        assert.deepEqual(snapshot, runtime.getWorkspaceSnapshot());
                        effects.push(["workspace", options]);
                        return true;
                    },
                    broadcastRuntimeEvents: async options => effects.push(["broadcast", options])
                });
                mutate = payload => handlers.get(datasetEditorIpcChannels.updateVariable)({}, payload);
            } else {
                mutate = createRuntimeSessionDatasetChannelAdapter({
                    runtimeSessionManager: runtime, patchVariableMetadata: patch,
                    invalidateDataset: async (name, effect) => effects.push(["invalidate", name, effect])
                }).updateVariable;
            }
            const payload = { name: disposition === "empty-name" ? "" : " data ",
                variableName: " x ", label: "new label", measure: "ordinal", decimals: 0 };
            let result;
            if (disposition === "failed" || disposition === "missing-value") {
                await assert.rejects(mutate(payload), /fixture patch failure/);
            } else {
                result = await mutate(payload);
                assert.equal(result, disposition === "ready" ? metadata : null);
            }
            if (disposition !== "ready") {
                assert.deepEqual(effects, [], "Rejected metadata must not patch or notify success.");
            } else {
                assert.deepEqual(effects[0], ["patch", "data", "x", metadata]);
                assert.equal(requests[0].method, "workspace.dataset_update_variable");
                assert.equal(requests[0].params.decimals, 0);
                if (host === "native") {
                    assert.deepEqual(effects.slice(1), [
                        ["invalidate", "data", {
                            previewChanged: true, variableMetadataChanged: true,
                            variableMetadataPatched: true, warmVariableMetadata: true
                        }],
                        ["changes", [{ name: "data", kind: "dataset_variable_meta_changed", columns: ["x"] }]],
                        ["workspace", { warmActiveDataset: false, refreshProductDialogs: true }],
                        ["broadcast", { sendDatasetChanges: false }]
                    ]);
                } else {
                    assert.deepEqual(effects.slice(1), [["invalidate", "data", {
                        previewChanged: true, variableMetadataChanged: true, variableMetadataPatched: true,
                        warmVariableMetadata: true
                    }]]);
                }
            }
            if (disposition === "empty-name") {
                assert.deepEqual(requests, []);
            }
            outputs.push({ requests, result });
        }
        assert.deepEqual(outputs[0], outputs[1], "Both adapters use the SAME variable action.");
    }
    console.log("Shared variable mutation cases passed; rendered native/WebR acceptance remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
