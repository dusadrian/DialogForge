"use strict";

const assert = require("node:assert/strict");
const { createRVisibleCommandExecutor } = require("../dist/src/runtime/providers/r/controllers/rVisibleCommandExecutor");
const { createRuntimeCommandOperationController } = require("../dist/src/runtime/commands/runtimeCommandOperationController");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");

const session = { providerId: "r", status: "ready" };
const request = createVisibleCommandRequest({ text: "probe <- 2", source: "transport-fixture" });

const main = async function() {
    for (const dispatched of [false, true]) {
        let forwarded = 0;
        const client = {
            execute: async function(_request, options) {
                if (dispatched) {
                    options.onDispatched();
                }
                return {
                    ok: false, transportFailure: true,
                    error: "runtime-session-socket-closed",
                    events: dispatched ? [
                        { type: "stream", parent_id: "activity", text: "partial output" },
                        { type: "execution_phase", parent_id: "activity", phase: "evaluated", outcome: "success" },
                        { type: "workspace_update", parent_id: "activity", update: { removed: ["probe"] } }
                    ] : []
                };
            }
        };
        const executor = createRVisibleCommandExecutor({
            getClient: () => client,
            createRequestId: () => "activity",
            onRuntimeControlEvents: () => { forwarded += 1; }
        });
        const result = await executor.executeVisibleCommand(request, session);
        assert.equal(result.executionDisposition, dispatched ? "session_lost" : "not_started");
        assert.equal(result.workspaceReconciliation, dispatched ? "failed" : "not_checked");
        assert.equal(result.workspaceUpdate, null);
        assert.equal(result.evaluationOutcome, dispatched ? "success" : undefined);
        assert.equal(forwarded, 0, "Failed transport cannot forward workspace effects");
        assert.equal(result.transcriptEvents.at(-1).type, dispatched ? "failed" : "rejected");
        if (dispatched) {
            assert.equal(result.transcriptEvents[0].message, "partial output");
        }

        let refreshes = 0;
        let stale = 0;
        const operation = createRuntimeCommandOperationController({
            commandExecutionController: { executeVisibleCommand: async () => result },
            getSnapshot: () => session,
            completeVisibleCommand: async () => { refreshes += 1; return null; },
            invalidateWorkspace: () => { stale += 1; },
            applyWorkspaceUpdate: () => { throw new Error("Unexpected effects"); },
            recordRuntimeEvent: () => {}
        });
        await operation.executeVisibleCommand(request);
        assert.equal(refreshes, 0, "Transport failure cannot schedule command recovery/replay");
        assert.equal(stale, dispatched ? 1 : 0);
    }
    const client = { execute: async () => ({ ok: false, error: "ordinary R rejection" }) };
    const result = await createRVisibleCommandExecutor({
        getClient: () => client, createRequestId: () => "activity"
    }).executeVisibleCommand(request, session);
    assert.equal(result.executionDisposition, undefined, "R rejection is not connection loss");
    const localClient = {
        execute: async () => ({
            ok: false, requestRejected: true, error: "runtime-session-request-capacity"
        })
    };
    const local = await createRVisibleCommandExecutor({
        getClient: () => localClient, createRequestId: () => "activity"
    }).executeVisibleCommand(request, session);
    assert.equal(local.executionDisposition, "not_started");
    assert.equal(local.workspaceReconciliation, "not_checked");
    assert.equal(local.evaluationOutcome, undefined);
    assert.equal(local.transcriptEvents.at(-1).type, "rejected");
    console.log("Command transport outcomes: pre-dispatch rejection, uncertain execution, retained evidence.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
