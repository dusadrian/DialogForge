"use strict";

const assert = require("node:assert/strict");
const { createRuntimeSessionDatasetChannelAdapter } = require(
    "../dist/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter"
);
const { createTabularIpcController } = require(
    "../dist/src/shell-electron/runtime/tabularIpcController"
);
const { tabularIpcChannels } = require("../dist/src/core/ipc/tabularIpc");
const { createCellUpdateResult, createCellUpdateBatchResult } = require(
    "../dist/src/runtime/tabular-data/tabularProtocol"
);

const checkRetirementBetweenTargets = async function() {
    for (const host of ["native", "browser"]) {
        let session = { providerId: "fixture", lifecycleGeneration: 1, status: "ready" };
        let firstStarted;
        let releaseFirst;
        const started = new Promise(resolve => { firstStarted = resolve; });
        const held = new Promise(resolve => { releaseFirst = resolve; });
        const targets = [];
        const receipt = { status: "updated", updated: 2, results: [
            { status: "updated", objectName: "a" }, { status: "updated", objectName: "b" }
        ] };
        const runtime = {
            getSnapshot: () => session,
            getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
            writeCells: async () => receipt
        };
        let write;
        if (host === "native") {
            const handlers = new Map();
            createTabularIpcController({
                ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                runtimeSessionManager: runtime,
                sendCellUpdate: () => {},
                invalidateInitialDatasetPreview: name => {
                    targets.push(name);
                    session = { ...session, lifecycleGeneration: 2 };
                    firstStarted();
                },
                broadcastRuntimeEvents: () => assert.fail("Retired batch must not broadcast")
            });
            write = input => handlers.get(tabularIpcChannels.writeCells)({}, input);
        } else {
            write = createRuntimeSessionDatasetChannelAdapter({
                runtimeSessionManager: runtime,
                invalidateDataset: async name => {
                    targets.push(name);
                    firstStarted();
                    await held;
                }
            }).writeCells;
        }
        const pending = write([{ objectName: "a", rowIndex: 0, columnName: "x", value: 1 }]);
        await started;
        session = { ...session, lifecycleGeneration: 2 };
        releaseFirst();
        assert.equal(await pending, receipt);
        assert.deepEqual(targets, ["a"], "Later targets must retain original batch ownership.");
    }
};

const main = async function() {
    await checkRetirementBetweenTargets();
    for (const scenario of ["updated", "partial", "failed", "empty", "throws"]) {
        const outputs = [];
        for (const host of ["native", "browser"]) {
            const requests = [];
            const effects = [];
            const failure = Error("fixture batch rejected");
            let receipt;
            const runtime = {
                getSnapshot: () => ({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" }),
                getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
                async writeCells(inputs) {
                    requests.push(inputs);
                    if (scenario === "throws") {
                        throw failure;
                    }
                    const results = inputs.map((input, index) => ({
                        ...createCellUpdateResult({
                            ...input,
                            objectName: input.objectName || "active",
                            status: scenario === "failed" || (scenario === "partial" && index === 1)
                                ? "failed" : "updated"
                        }),
                        updatedAt: "2026-10-02T00:00:00.000Z"
                    }));
                    const updated = results.filter(result => result.status === "updated").length;
                    receipt = createCellUpdateBatchResult({
                        status: updated === results.length ? "updated" : "partial",
                        providerId: "fixture",
                        objectName: "active",
                        results,
                        updated,
                        failed: results.length - updated,
                        message: "Keep the runtime message.",
                        updatedAt: "2026-10-02T00:00:00.000Z"
                    });
                    receipt.updatedAt = "2026-10-02T00:00:00.000Z";
                    return receipt;
                }
            };
            let writeCells;
            if (host === "native") {
                const handlers = new Map();
                createTabularIpcController({
                    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                    runtimeSessionManager: runtime,
                    sendCellUpdate: result => effects.push(["receipt", result]),
                    invalidateInitialDatasetPreview: name => effects.push(["preview", name]),
                    broadcastRuntimeEvents: async () => effects.push(["broadcast"])
                });
                writeCells = inputs => handlers.get(tabularIpcChannels.writeCells)({}, inputs);
            } else {
                writeCells = createRuntimeSessionDatasetChannelAdapter({
                    runtimeSessionManager: runtime,
                    publishCellUpdate: result => effects.push(["receipt", result]),
                    invalidateDataset: async (name, effect) => effects.push(["invalidate", name, effect])
                }).writeCells;
            }

            const inputs = scenario === "empty" ? [] : [
                { objectName: "", rowIndex: 0, columnName: "x", value: 43,
                    uiCommandVisibility: "visible", visibleCommandText: "visible edit" },
                { objectName: "other", rowIndex: 1, columnName: "x", value: 44 },
                { objectName: "", rowIndex: 2, columnName: "x", value: 45 }
            ];
            let result;
            if (scenario === "throws") {
                await assert.rejects(writeCells(inputs), error => error === failure);
                assert.deepEqual(effects, []);
            } else {
                result = await writeCells(inputs);
                assert.equal(result, receipt, "Return the exact runtime receipt, including failure detail.");
                const names = scenario === "updated" ? ["active", "other"]
                    : scenario === "partial" ? ["active"] : [];
                if (host === "native") {
                    assert.deepEqual(effects, [
                        ["receipt", receipt],
                        ...names.map(name => ["preview", name]),
                        ...(names.length ? [["broadcast"]] : [])
                    ]);
                } else {
                    assert.deepEqual(effects, [
                        ["receipt", receipt],
                        ...names.map(name => ["invalidate", name, {
                            previewChanged: true,
                            variableMetadataChanged: false,
                            variableMetadataPatched: false,
                            warmVariableMetadata: true
                        }])
                    ]);
                }
            }

            if (inputs.length) {
                assert.deepEqual(requests[0].map(request => request.rowIndex), [0, 1, 2]);
                assert.equal(requests[0][0].uiCommandVisibility, "visible");
                assert.equal(requests[0][0].visibleCommandText, "visible edit");
            }
            outputs.push({ requests, result });
        }
        assert.deepEqual(outputs[0], outputs[1], "Both adapters execute the SAME batch action.");
    }
    console.log("Shared batch adapter cases passed; actual paired-host paste acceptance remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
