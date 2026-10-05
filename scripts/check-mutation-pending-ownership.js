"use strict";

const assert = require("node:assert/strict");
const { createRuntimeSessionManager } = require("../dist/src/runtime/session/runtimeSessionManager");

const object = { name: "probe", kind: "dataframe", detail: "1 row", capabilities: ["tabular.read"] };
const cell = { objectName: "probe", rowIndex: 1, columnName: "value", value: 2 };
const settleUntil = async function(condition) {
    for (let attempt = 0; attempt < 30 && !condition(); attempt += 1) {
        await Promise.resolve();
    }
    assert.ok(condition(), "Expected operation phase was not reached");
};

const main = async function() {
    const writes = [];
    const commits = [];
    let metadataRelease;
    let metadataReads = 0;
    let sequence = 1;
    const manager = createRuntimeSessionManager({
        manifest: { id: "fixture", capabilities: ["tabular.variableMetadata", "tabular.valueLabels.write"] },
        createSession: () => ({ providerId: "fixture", status: "not-started", connection: "fixture", message: "Ready" }),
        workspaceController: {
            listWorkspaceObjects: async () => [object],
            commitWorkspaceMutation: () => new Promise((resolve) => commits.push(resolve))
        },
        tabularController: {
            writeCell: () => new Promise((resolve, reject) => writes.push({ resolve, reject })),
            readVariableMetadata: () => {
                metadataReads += 1;
                return new Promise((resolve) => { metadataRelease = resolve; });
            },
            writeValueLabels: () => new Promise((resolve, reject) => writes.push({ resolve, reject }))
        }
    });
    const receipt = () => ({
        added: [], updated: [], removed: [],
        workspaceRevision: { session: "fixture", sequence: ++sequence }
    });
    await manager.start();
    await manager.listWorkspaceObjects();
    const first = manager.writeCell(cell);
    assert.equal(manager.getWorkspaceSnapshot().freshness, "pending");
    assert.equal((await manager.readVariableMetadata("probe")).status, "unavailable");
    assert.equal(metadataReads, 0);
    writes[0].resolve({ status: "updated" });
    await settleUntil(() => commits.length === 1);
    assert.equal(manager.getWorkspaceSnapshot().freshness, "pending", "Pending includes reconciliation, not just the write");
    commits[0](receipt());
    await first;
    assert.equal(manager.getWorkspaceSnapshot().freshness, "fresh");

    const overlapOne = manager.writeCell(cell);
    const overlapTwo = manager.writeCell(cell);
    writes[1].resolve({ status: "updated", workspaceReconciliation: "unchanged" });
    await overlapOne;
    assert.equal(manager.getWorkspaceSnapshot().freshness, "pending");
    writes[2].resolve({ status: "updated", workspaceReconciliation: "unchanged" });
    await overlapTwo;
    assert.equal(manager.getWorkspaceSnapshot().freshness, "fresh");

    const label = manager.writeValueLabels({ objectName: "probe", variableName: "value", labels: [] });
    assert.equal(manager.getWorkspaceSnapshot().freshness, "fresh", "Metadata validation precedes pending acquisition");
    metadataRelease({ status: "ready", variables: [{ name: "value" }] });
    await settleUntil(() => writes.length === 4);
    assert.equal(manager.getWorkspaceSnapshot().freshness, "pending");
    writes[3].resolve({ status: "updated", workspaceReconciliation: "unchanged" });
    await label;
    assert.equal(manager.getWorkspaceSnapshot().freshness, "fresh");

    const rejectedLabel = manager.writeValueLabels({
        objectName: "probe", variableName: "absent", labels: []
    });
    metadataRelease({ status: "ready", variables: [{ name: "value" }] });
    assert.equal((await rejectedLabel).status, "invalid-variable");
    assert.equal(writes.length, 4);
    assert.equal(commits.length, 1, "Preflight rejection cannot trigger mutation reconciliation");
    assert.equal(manager.getWorkspaceSnapshot().freshness, "fresh");

    const thrown = manager.writeCell(cell);
    writes[4].reject(new Error("Lost mutation response"));
    await assert.rejects(thrown, /Lost mutation response/);
    assert.equal(manager.getWorkspaceSnapshot().freshness, "stale");
    await manager.listWorkspaceObjects();

    const failedRefresh = manager.writeCell(cell);
    writes[5].resolve({ status: "updated" });
    await settleUntil(() => commits.length === 2);
    commits[1](null);
    assert.equal((await failedRefresh).workspaceReconciliation, "failed");
    assert.equal(manager.getWorkspaceSnapshot().freshness, "stale");
    await manager.listWorkspaceObjects();

    const retired = manager.writeCell(cell);
    await manager.stop();
    await manager.start();
    await manager.listWorkspaceObjects();
    const replacement = manager.writeCell(cell);
    writes[6].resolve({ status: "updated", workspaceUpdate: receipt() });
    assert.equal((await retired).workspaceUpdate, null);
    assert.equal(manager.getWorkspaceSnapshot().freshness, "pending", "Retired finally cannot release the replacement owner");
    writes[7].resolve({ status: "updated", workspaceReconciliation: "unchanged" });
    await replacement;
    assert.equal(manager.getWorkspaceSnapshot().freshness, "fresh");
    console.log("Mutation ownership: pending write/reconciliation, validation, overlap, failures and retirement.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
