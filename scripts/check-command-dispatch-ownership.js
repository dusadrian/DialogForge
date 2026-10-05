"use strict";

const assert = require("node:assert/strict");
const { createRVisibleCommandExecutor } = require("../dist/src/runtime/providers/r/controllers/rVisibleCommandExecutor");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");

const main = async function() {
    const started = [];
    const finished = [];
    let dispatch;
    let release;
    let currentClient;
    const client = {
        execute: function(request, options) {
            dispatch = options.onDispatched;
            return new Promise((resolve) => {
                release = () => resolve({ ok: true, events: [{
                    type: "completion", state: "idle", parent_id: request.params.parentId,
                    workspaceReconciliation: "unchanged"
                }] });
            });
        }
    };
    currentClient = client;
    let sequence = 0;
    const executor = createRVisibleCommandExecutor({
        getClient: () => currentClient,
        createRequestId: () => `dispatch-${++sequence}`,
        onExecutionStarted: (_request, parentId) => started.push(parentId),
        onExecutionFinished: (parentId) => finished.push(parentId)
    });
    const request = createVisibleCommandRequest({ text: "probe()", source: "dispatch-fixture" });
    const first = executor.executeVisibleCommand(request, { providerId: "r", status: "ready" });
    assert.deepEqual(started, []);
    dispatch();
    assert.equal(started.length, 1);
    release();
    await first;
    assert.deepEqual(finished, started);

    const retired = executor.executeVisibleCommand(request, { providerId: "r", status: "ready" });
    dispatch();
    currentClient = null;
    release();
    await retired;
    assert.equal(finished.length, 1, "Retired responses cannot finish a replacement activity");
    console.log("Activity ownership: acquired at dispatch, retired cleanup suppressed.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
