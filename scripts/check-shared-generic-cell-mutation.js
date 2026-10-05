"use strict";

const assert = require("node:assert/strict");
const { createTabularIpcController } = require("../dist/src/shell-electron/runtime/tabularIpcController");
const { createRuntimeSessionDatasetChannelAdapter } = require(
    "../dist/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter"
);
const { tabularIpcChannels } = require("../dist/src/core/ipc/tabularIpc");

const main = async function() {
    for (const status of ["updated", "failed", "unavailable", "throws"]) {
        const outputs = [];
        for (const host of ["native", "browser"]) {
            const requests = [];
            const cacheEffects = [];
            const publications = [];
            const failure = Error("fixture cell exception");
            const receipt = { status, objectName: "data", message: "Keep runtime detail." };
            const runtime = {
                getSnapshot: () => ({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" }),
                getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
                async writeCell(request) {
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
                    sendCellUpdate: value => publications.push(["receipt", value]),
                    invalidateInitialDatasetPreview: (name, effect) => cacheEffects.push([name, effect]),
                    broadcastRuntimeEvents: async () => publications.push(["broadcast"])
                });
                write = input => handlers.get(tabularIpcChannels.writeCell)({}, input);
            } else {
                write = createRuntimeSessionDatasetChannelAdapter({
                    runtimeSessionManager: runtime,
                    publishCellUpdate: value => publications.push(["receipt", value]),
                    invalidateDataset: async (name, effect) => cacheEffects.push([name, effect])
                }).writeCell;
            }
            const input = { objectName: "data", rowIndex: 0, columnName: "x", value: 0,
                uiCommandVisibility: "visible", visibleCommandText: "first cell" };
            let result;
            if (status === "throws") {
                await assert.rejects(write(input), error => error === failure);
            } else {
                result = await write(input);
                assert.equal(result, receipt);
            }
            assert.deepEqual(requests, [input]);
            assert.deepEqual(cacheEffects, status === "updated" ? [["data", {
                previewChanged: true, variableMetadataChanged: false,
                variableMetadataPatched: false, warmVariableMetadata: true
            }]] : []);
            assert.deepEqual(publications, status === "throws" ? [] : [
                ["receipt", receipt], ...(status === "updated" && host === "native" ? [["broadcast"]] : [])
            ]);
            outputs.push({ requests, result, cacheEffects });
        }
        assert.deepEqual(outputs[0], outputs[1]);
    }
    console.log("Shared generic cell cases passed; browser preload/rendered acceptance remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
