"use strict";

const assert = require("node:assert/strict");
const { createTabularIpcController } = require("../dist/src/shell-electron/runtime/tabularIpcController");
const { createRuntimeSessionDatasetChannelAdapter } = require(
    "../dist/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter"
);
const { tabularIpcChannels } = require("../dist/src/core/ipc/tabularIpc");

const main = async function() {
    for (const method of ["renameColumn", "insertColumn", "removeColumn"]) {
        for (const status of ["updated", "failed", "unavailable", "throws"]) {
            const outputs = [];
            for (const host of ["native", "browser"]) {
                const requests = [];
                const cacheEffects = [];
                const publications = [];
                const failure = Error("fixture column exception");
                const receipt = { status, objectName: "data", columnName: "new",
                    columnIndex: 0, columnCount: 4, message: "Preserve runtime detail." };
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
                let mutate;
                if (host === "native") {
                    const handlers = new Map();
                    createTabularIpcController({
                        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                        runtimeSessionManager: runtime,
                        invalidateInitialDatasetPreview: (name, effect) => cacheEffects.push([name, effect]),
                        broadcastRuntimeEvents: async () => publications.push("broadcast")
                    });
                    mutate = input => handlers.get(tabularIpcChannels[method])({}, input);
                } else {
                    mutate = createRuntimeSessionDatasetChannelAdapter({
                        runtimeSessionManager: runtime,
                        invalidateDataset: async (name, effect) => cacheEffects.push([name, effect])
                    }).tabularColumns[method];
                }
                const input = { objectName: "data", columnName: "new", referenceColumn: "old",
                    fromName: "old", toName: "new", position: "after", value: 0,
                    uiCommandVisibility: "visible", visibleCommandText: "column edit" };
                let result;
                if (status === "throws") {
                    await assert.rejects(mutate(input), error => error === failure);
                } else {
                    result = await mutate(input);
                    assert.equal(result, receipt);
                }
                assert.equal(requests[0].uiCommandVisibility, "visible");
                assert.equal(requests[0].visibleCommandText, "column edit");
                assert.deepEqual(cacheEffects, status === "updated" ? [["data", {
                    previewChanged: true, variableMetadataChanged: true,
                    variableMetadataPatched: false, warmVariableMetadata: true
                }]] : []);
                if (host === "native") {
                    assert.deepEqual(publications, status === "updated" ? ["broadcast"] : []);
                }
                outputs.push({ requests, result, cacheEffects });
            }
            assert.deepEqual(outputs[0], outputs[1]);
        }
    }
    console.log("Shared generic column cases passed; actual preload/rendered acceptance remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
