"use strict";

const assert = require("node:assert/strict");
const { createRVisibleCommandExecutor } = require("../dist/src/runtime/providers/r/controllers/rVisibleCommandExecutor");
const { createProviderRuntimeEvent } = require("../dist/src/runtime/providers/r/protocol/runtimeControlEvents");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");

const parentId = "command-workspace-fixture";
const revision = { session: "command-workspace", sequence: 2 };
const empty = { added: [], updated: [], removed: [], objectCount: 1,
    datasets: { added: [], removed: [], changed: [], copied: [] }, workspaceRevision: revision };

const main = async function() {
    for (const providerId of ["r", "webr"]) {
        const snapshot = { providerId, status: "ready", lifecycleGeneration: 1 };
        for (const outcome of ["success", "error", "interrupted"]) {
            for (const update of [{ removed: ["prepared"] }, null, "not-json",
                { ...empty, workspaceRevision: undefined }, { ...empty, removed: [null] },
                { ...empty, datasets: {} }, { ...empty, updated: [{}] },
                { ...empty, added: [{ name: " ", access_key: "prepared" }] },
                { ...empty, updated: [{ name: {}, access_key: "prepared" }] }]) {
                let calls = 0;
                const event = { type: "workspace_update", parent_id: parentId, update };
                const events = [event,
                    { type: "execution_phase", parent_id: parentId, phase: "evaluated", outcome },
                    { type: "completion", parent_id: parentId, state: "idle", workspaceReconciliation: "changed" }];
                const executor = createRVisibleCommandExecutor({
                    getClient: () => client, createRequestId: () => parentId
                });
                const client = { execute: async () => { calls++; return { ok: true, events }; } };
                const result = await executor.executeVisibleCommand(
                    createVisibleCommandRequest({ text: "probe()", source: providerId }), snapshot);
                assert.equal(result.evaluationOutcome, outcome);
                assert.equal(result.workspaceUpdate, null, "Malformed command effects must not be normalized and applied.");
                assert.equal(result.workspaceReconciliation, "failed");
                assert.equal(calls, 1, "Never replay evaluation because a workspace event failed.");
                assert.equal(createProviderRuntimeEvent(event, snapshot), null,
                    "Malformed workspace effects must not leak through the separate runtime-event channel.");
            }
        }
        for (const update of [empty, { ...empty, removed: ["prepared"], objectCount: 0 }]) {
            const event = { type: "workspace_update", parent_id: parentId, update };
            assert.equal(createProviderRuntimeEvent(event, snapshot).type, "workspace.update");
        }
        for (const receipt of [undefined, { session: "", sequence: 2 }, { session: "command-workspace", sequence: "2" }]) {
            const client = { execute: async () => ({ ok: true, events: [
                { type: "completion", parent_id: parentId, state: "idle", workspaceReconciliation: "unchanged",
                    workspaceRevision: receipt, workspaceObjectCount: 1 }
            ] }) };
            const result = await createRVisibleCommandExecutor({ getClient: () => client,
                createRequestId: () => parentId }).executeVisibleCommand(
                createVisibleCommandRequest({ text: "1", source: providerId }), snapshot);
            assert.equal(result.workspaceUpdate, null);
            assert.equal(result.workspaceReconciliation, "failed", "Unchanged still requires its checked receipt.");
        }
        for (const count of [undefined, null, "1", -1, 0.5]) {
            const client = { execute: async () => ({ ok: true, events: [
                { type: "completion", parent_id: parentId, state: "idle", workspaceReconciliation: "unchanged",
                    workspaceRevision: revision, workspaceObjectCount: count }
            ] }) };
            const result = await createRVisibleCommandExecutor({ getClient: () => client,
                createRequestId: () => parentId }).executeVisibleCommand(
                createVisibleCommandRequest({ text: "1", source: providerId }), snapshot);
            assert.equal(result.workspaceUpdate, null);
            assert.equal(result.workspaceReconciliation, "failed");
        }
        for (const mode of ["checked-unchanged", "missing-changed", "mixed-invalid"]) {
            const events = mode === "mixed-invalid" ? [
                { type: "workspace_update", parent_id: parentId, update: empty },
                { type: "workspace_update", parent_id: parentId, update: { removed: ["prepared"] } }
            ] : [];
            events.push({ type: "completion", parent_id: parentId, state: "idle",
                workspaceReconciliation: mode === "checked-unchanged" ? "unchanged" : "changed",
                workspaceRevision: revision, workspaceObjectCount: 1 });
            const client = { execute: async () => ({ ok: true, events }) };
            const result = await createRVisibleCommandExecutor({ getClient: () => client,
                createRequestId: () => parentId }).executeVisibleCommand(
                createVisibleCommandRequest({ text: "1", source: providerId }), snapshot);
            assert.equal(result.workspaceReconciliation, mode === "checked-unchanged" ? "unchanged" : "failed");
            assert.equal(Boolean(result.workspaceUpdate), mode === "checked-unchanged");
        }
    }
    console.log("SAME command and event-channel receipt validation rejects malformed effects without rewriting evaluation or replaying it.");
};
main().catch(error => { console.error(error); process.exitCode = 1; });
