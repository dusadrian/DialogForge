"use strict";

const assert = require("node:assert/strict");
const { createRuntimeCommandOperationController } = require("../dist/src/runtime/commands/runtimeCommandOperationController");
const { createRuntimeSessionManager } = require("../dist/src/runtime/session/runtimeSessionManager");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");

const main = async function() {
    for (const providerId of ["r", "webr"]) {
        for (const disposition of ["session_lost", "not_started"]) {
            const result = { executionDisposition: disposition, transcriptEvents: [],
                evaluationOutcome: disposition === "session_lost" ? "success" : undefined,
                workspaceUpdate: null, workspaceReconciliation: "not_checked" };
            let refreshes = 0;
            let publications = 0;
            const operation = createRuntimeCommandOperationController({
                commandExecutionController: { executeVisibleCommand: async () => result },
                getSnapshot: () => ({ providerId, status: "ready" }),
                getWorkspaceGeneration: () => 1,
                completeVisibleCommand: async () => {
                    refreshes++;
                    return { added: ["foreign"], updated: [], removed: [],
                        datasets: { added: [], removed: [], changed: [], copied: [] } };
                },
                applyWorkspaceUpdate: () => { publications++; return true; },
                invalidateWorkspace() {}, recordRuntimeEvent() {}
            });
            const received = await operation.executeVisibleCommand(createVisibleCommandRequest({ text: "scoped()" }));
            assert.equal(refreshes, 0, disposition + ": Explicit non-completion must not start fallback workspace recovery.");
            assert.equal(publications, 0);
            assert.equal(received.executionDisposition, disposition);
            assert.equal(received.workspaceUpdate, null);
            assert.equal(received.evaluationOutcome, result.evaluationOutcome,
                "Known R outcome is not rewritten by failed delivery.");

            let reads = 0;
            let evaluations = 0;
            let commandResult = result;
            const manager = createRuntimeSessionManager({
                manifest: { id: providerId, capabilities: ["commands.visible", "workspace.objects"] },
                createSession: () => ({ providerId, status: "ready", connection: "connected" }),
                commandController: { executeVisibleCommand: async () => {
                    evaluations++;
                    return commandResult;
                } },
                extensionController: { executeRuntimeMethod: async request => ({
                    providerId, method: request.method, status: "failed", workspaceReconciliation: "failed"
                }) },
                workspaceController: { listWorkspaceObjects: async () => [], readWorkspaceSnapshot: async () => {
                    reads++;
                    return { providerId, status: "ready", objects: [],
                        workspaceRevision: { session: "scoped-session", sequence: reads } };
                } }
            });
            await manager.executeRuntimeMethod({ method: "scoped.failed-reconciliation", params: {} });
            const settled = await manager.executeVisibleCommandWithEffects(createVisibleCommandRequest({ text: "scoped()" }));
            assert.equal(reads, 0, disposition + ": Session wrapper must not replace lost/unsent disposition with recovered completion.");
            assert.equal(settled.executionDisposition, disposition);
            assert.equal(settled.workspaceUpdate, null);
            assert.equal(evaluations, 1, "Explicit loss/unsent result must come from the tested provider.");
            commandResult = { transcriptEvents: [{ type: "completed" }], evaluationOutcome: "success",
                workspaceUpdate: null, workspaceReconciliation: "not_checked" };
            const recovered = await manager.executeVisibleCommandWithEffects(createVisibleCommandRequest({ text: "fresh()" }));
            assert.equal(recovered.executionDisposition, "completed");
            assert.equal(recovered.evaluationOutcome, "success");
            assert.ok(reads > 0, "The following genuine evaluated command may still recover a missing baseline.");
            assert.equal(evaluations, 2, "Only the explicitly requested fresh command executes.");
            await manager.stop();
        }
    }
    console.log("Common command/session owners preserve explicit loss/unsent status without workspace recovery or effects.");
};
main().catch(error => { console.error(error); process.exitCode = 1; });
