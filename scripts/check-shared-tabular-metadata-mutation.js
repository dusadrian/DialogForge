"use strict";

const assert = require("node:assert/strict");
const { createTabularIpcController } = require("../dist/src/shell-electron/runtime/tabularIpcController");
const { createRuntimeSessionDatasetChannelAdapter } = require(
    "../dist/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter"
);
const { tabularIpcChannels } = require("../dist/src/core/ipc/tabularIpc");

const main = async function() {
    const methods = ["writeVariableMetadata", "writeValueLabels", "writeDeclaredMissing"];
    for (const method of methods) {
        for (const status of ["updated", "failed", "unavailable", "throws"]) {
            const outputs = [];
            for (const host of ["native", "browser"]) {
                const requests = [];
                const effects = [];
                const failure = Error("fixture metadata exception");
                const receipt = {
                    status, objectName: "data", providerId: "fixture",
                    message: "Preserve failure detail.",
                    workspaceReconciliation: { status: "failed", message: "fixture reconciliation" },
                    updatedAt: "2026-10-02T00:00:00.000Z"
                };
                const runtime = {
                    getSnapshot: () => ({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" }),
                    getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
                    async [method](request) {
                        requests.push(request);
                        if (status === "throws") {
                            throw failure;
                        }
                        return receipt;
                    }
                };
                let write;
                if (host === "native") {
                    const handlers = new Map();
                    createTabularIpcController({
                        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                        runtimeSessionManager: runtime,
                        invalidateInitialDatasetPreview: name => effects.push(["preview", name]),
                        broadcastRuntimeEvents: async () => effects.push(["broadcast"])
                    });
                    write = input => handlers.get(tabularIpcChannels[method])({}, input);
                } else {
                    write = createRuntimeSessionDatasetChannelAdapter({
                        runtimeSessionManager: runtime,
                        invalidateDataset: async (name, effect) => effects.push(["invalidate", name, effect])
                    })[method];
                }
                const input = {
                    objectName: "data", variableName: "x", metadataKey: "label", value: "Δ label",
                    labels: [{ value: 0, label: "zero" }], values: [0, 99],
                    uiCommandVisibility: "visible", visibleCommandText: "metadata edit"
                };
                let result;
                if (status === "throws") {
                    await assert.rejects(write(input), error => error === failure);
                } else {
                    result = await write(input);
                    assert.equal(result, receipt);
                }
                assert.equal(requests[0].uiCommandVisibility, "visible");
                assert.equal(requests[0].visibleCommandText, "metadata edit");
                if (method === "writeVariableMetadata") {
                    assert.equal(requests[0].value, "Δ label");
                } else if (method === "writeValueLabels") {
                    assert.deepEqual(requests[0].labels, input.labels);
                } else {
                    assert.deepEqual(requests[0].values, input.values);
                }
                assert.deepEqual(effects, status !== "updated" ? [] : host === "native"
                    ? [["preview", "data"], ["broadcast"]]
                    : [["invalidate", "data", {
                        previewChanged: true, variableMetadataChanged: true, variableMetadataPatched: false,
                        warmVariableMetadata: true
                    }]]);
                outputs.push({ requests, result });
            }
            assert.deepEqual(outputs[0], outputs[1]);
        }
    }
    console.log("Shared metadata adapter cases passed; actual paired-host acceptance remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
