"use strict";

const assert = require("node:assert/strict");
const { createTabularIpcController } = require("../dist/src/shell-electron/runtime/tabularIpcController");
const { createRuntimeSessionDatasetChannelAdapter } = require(
    "../dist/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter"
);
const { tabularIpcChannels } = require("../dist/src/core/ipc/tabularIpc");

const main = async function() {
    for (const method of ["renameColumn", "insertColumn", "removeColumn", "updateRowName",
        "insertRow", "removeRow", "sortRows", "writeVariableMetadata", "writeValueLabels", "writeDeclaredMissing"]) {
        for (const transition of ["generation", "provider", "status", "replacement"]) {
            for (const host of ["native", "browser"]) {
                if (host === "native" && transition === "replacement") {
                    continue;
                }
                let session = { providerId: "fixture", lifecycleGeneration: 1, status: "ready" };
                let current = true;
                let release;
                const held = new Promise(resolve => { release = resolve; });
                const receipt = { status: "updated", objectName: "data", message: "Actual committed receipt." };
                const runtime = {
                    getSnapshot: () => session,
                    getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
                    [method]: () => held
                };
                let mutate;
                if (host === "native") {
                    const handlers = new Map();
                    createTabularIpcController({
                        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                        runtimeSessionManager: runtime,
                        invalidateInitialDatasetPreview: () => assert.fail("Retired mutation invalidated cache"),
                        broadcastRuntimeEvents: () => assert.fail("Retired mutation broadcast events")
                    });
                    mutate = input => handlers.get(tabularIpcChannels[method])({}, input);
                } else {
                    const adapter = createRuntimeSessionDatasetChannelAdapter({
                        runtimeSessionManager: runtime,
                        isCurrentRuntime: () => current,
                        invalidateDataset: () => assert.fail("Retired mutation invalidated cache")
                    });
                    const actions = method.includes("Column") ? adapter.tabularColumns
                        : method.includes("Row") ? adapter.tabularRows : adapter;
                    mutate = actions[method];
                }
                const pending = mutate({ objectName: "data", rowIndex: 0, columnName: "x", variableName: "x" });
                if (transition === "generation") {
                    session = { ...session, lifecycleGeneration: 2 };
                } else if (transition === "provider") {
                    session = { ...session, providerId: "replacement" };
                } else if (transition === "status") {
                    session = { ...session, status: "stopped" };
                } else {
                    current = false;
                }
                release(receipt);
                assert.equal(await pending, receipt, "Retirement must preserve actual mutation receipt.");
            }
        }
    }
    console.log("Structural/metadata retirement cases passed; actual lifecycle/consumer acceptance remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
