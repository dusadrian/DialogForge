"use strict";

const assert = require("node:assert/strict");
const { createTabularIpcController } = require("../dist/src/shell-electron/runtime/tabularIpcController");
const { createRuntimeSessionDatasetChannelAdapter } = require(
    "../dist/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter"
);
const { tabularIpcChannels } = require("../dist/src/core/ipc/tabularIpc");

const main = async function() {
    for (const method of ["writeCell", "writeCells"]) {
        for (const transition of ["generation", "provider", "status", "replacement", "publication-restart"]) {
            for (const host of ["native", "browser"]) {
                if (host === "native" && transition === "replacement") {
                    continue;
                }
                let session = { providerId: "fixture", lifecycleGeneration: 1, status: "ready" };
                let current = true;
                let release;
                const held = new Promise(resolve => { release = resolve; });
                const effects = [];
                const receipt = { status: "updated", objectName: "data", updated: 1,
                    results: [{ status: "updated", objectName: "data" }], message: "Actual committed receipt." };
                const runtime = {
                    getSnapshot: () => session,
                    getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
                    [method]: () => held
                };
                const publish = value => {
                    effects.push(["receipt", value]);
                    if (transition === "publication-restart") {
                        session = { ...session, lifecycleGeneration: 2 };
                    }
                };
                let write;
                if (host === "native") {
                    const handlers = new Map();
                    createTabularIpcController({
                        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                        runtimeSessionManager: runtime,
                        sendCellUpdate: publish,
                        invalidateInitialDatasetPreview: () => assert.fail("Retired mutation invalidated cache"),
                        broadcastRuntimeEvents: () => assert.fail("Retired mutation broadcast events")
                    });
                    write = input => handlers.get(tabularIpcChannels[method])({}, input);
                } else {
                    write = createRuntimeSessionDatasetChannelAdapter({
                        runtimeSessionManager: runtime,
                        isCurrentRuntime: () => current,
                        publishCellUpdate: publish,
                        invalidateDataset: () => assert.fail("Retired mutation invalidated cache")
                    })[method];
                }
                const input = { objectName: "data", rowIndex: 0, columnName: "x", value: 43 };
                const pending = write(method === "writeCells" ? [input] : input);
                if (transition === "generation") {
                    session = { ...session, lifecycleGeneration: 2 };
                } else if (transition === "provider") {
                    session = { ...session, providerId: "replacement" };
                } else if (transition === "status") {
                    session = { ...session, status: "stopped" };
                } else if (transition === "replacement") {
                    current = false;
                }
                release(receipt);
                assert.equal(await pending, receipt, "Retirement must not rewrite actual committed outcomes.");
                assert.deepEqual(effects, transition === "publication-restart" ? [["receipt", receipt]] : []);
            }
        }
    }
    console.log("Cell publication retirement cases passed; real consumer/lifecycle acceptance remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
