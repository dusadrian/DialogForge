"use strict";

const assert = require("node:assert/strict");
const { createRuntimeSessionManager } = require("../dist/src/runtime/session/runtimeSessionManager");
const { createWorkspaceObject } = require("../dist/src/runtime/workspace/workspaceProtocol");

const checkBatchSessionReplacement = async function(restart) {
    let release;
    const writes = [];
    const manager = createRuntimeSessionManager({
        manifest: { id: "batch-lifecycle", capabilities: ["tabular.write"] },
        createSession: () => ({ providerId: "batch-lifecycle", status: "not-started" }),
        tabularController: {
            writeCell: async function(request) {
                writes.push(request);
                if (writes.length === 1) {
                    return new Promise((resolve) => { release = resolve; });
                }
                return { ...request, status: "updated" };
            }
        }
    });
    await manager.start();
    const requests = [0, 1, 2].map((rowIndex) => ({
        objectName: "probe", rowIndex, columnName: "value", value: rowIndex + 10
    }));
    const pending = manager.writeCells(requests);
    assert.equal(writes.length, 1, "First edit must be in flight before replacement");
    await manager.stop();
    if (restart) {
        await manager.start();
    }
    release({ ...requests[0], status: "updated", workspaceReconciliation: "unchanged" });
    const result = await pending;
    assert.equal(writes.length, 1, "Remaining edits must never reach the replacement session");
    assert.equal(result.status, "partial");
    assert.equal(result.updated, 1);
    assert.equal(result.failed, 2);
    assert.equal(result.results.length, requests.length);
    assert.equal(result.results[0].status, "updated", "Keep the already-dispatched edit's outcome");
    for (let index = 1; index < requests.length; index += 1) {
        assert.equal(result.results[index].status, "unavailable");
        assert.equal(result.results[index].rowIndex, requests[index].rowIndex);
        assert.match(result.results[index].message, /not attempted/);
        assert.equal(result.results[index].workspaceUpdate, null);
    }
    await manager.stop();
};

const main = async function() {
    await checkBatchSessionReplacement(true);
    await checkBatchSessionReplacement(false);
    const table = createWorkspaceObject({ name: "probe", kind: "table", capabilities: ["tabular.read"] });
    let session = "first";
    let responses = [];
    let release;
    let mutationCalls = 0;
    let commitCalls = 0;
    const delta = (sequence, sessionId = session) => ({
        added: [], updated: [table], removed: [],
        workspaceRevision: { session: sessionId, sequence },
        datasets: { added: [], removed: [], changed: [], copied: [] }, objectCount: 1
    });
    const response = (update) => ({
        status: "updated", providerId: "replay", objectName: "probe", rowIndex: 0,
        columnName: "value", value: 42, workspaceUpdate: update, workspaceReconciliation: "updated"
    });
    const takeResponse = async function() {
        const next = responses.shift();
        return next === "delayed"
            ? new Promise((resolve) => { release = resolve; }) : next;
    };
    const manager = createRuntimeSessionManager({
        manifest: { id: "replay", capabilities: ["tabular.read", "tabular.write"] },
        createSession: () => ({ providerId: "replay", status: "not-started" }),
        workspaceController: {
            listWorkspaceObjects: async () => [table],
            readWorkspaceSnapshot: async () => ({
                status: "ready", providerId: "replay", objects: [table],
                workspaceRevision: { session, sequence: 5 }
            }),
            commitWorkspaceMutation: async () => { commitCalls += 1; return delta(20); }
        },
        tabularController: {
            writeCell: async () => { mutationCalls += 1; return takeResponse(); }
        },
        extensionController: {
            executeRuntimeMethod: takeResponse
        }
    });
    const cell = { objectName: "probe", rowIndex: 0, columnName: "value", value: 42 };
    await manager.start();
    await manager.listWorkspaceObjects();
    await manager.setActiveDataset("probe");

    for (const update of [delta(4), delta(5), delta(99, "foreign")]) {
        responses = [response(update)];
        const result = await manager.writeCell(cell);
        assert.equal(result.status, "updated");
        assert.equal(result.value, 42);
        assert.equal(result.workspaceUpdate, null, "Rejected cell delta must not leave the manager");
    }
    responses = [response(delta(6)), response(delta(4))];
    const batch = await manager.writeCells([cell, cell]);
    assert.equal(batch.results[0].workspaceUpdate.workspaceRevision.sequence, 6);
    assert.equal(batch.results[1].workspaceUpdate, null, "Sanitize rejected nested batch deltas");
    assert.equal(commitCalls, 0, "Rejected receipts must not trigger a second reconciliation");
    assert.equal(mutationCalls, 5, "Never repeat a mutation because its effects were rejected");

    responses = ["delayed"];
    const retiredBatch = manager.writeCells([cell]);
    await manager.stop();
    session = "second";
    await manager.start();
    await manager.listWorkspaceObjects();
    release(response(delta(7, "first")));
    const retired = await retiredBatch;
    assert.equal(retired.results[0].status, "updated");
    assert.equal(retired.results[0].workspaceUpdate, null);
    assert.equal(retired.results[0].workspaceReconciliation, "not_checked");

    for (const update of [delta(4), delta(5), delta(99, "first")]) {
        responses = [{ status: "ready", value: "operation completed", workspaceUpdate: update }];
        const result = await manager.executeRuntimeMethod({ method: "fixture" });
        assert.equal(result.status, "ready");
        assert.equal(result.value, "operation completed");
        assert.equal(result.workspaceUpdate, undefined, "Rejected extension delta must not leave the manager");
    }
    responses = ["delayed"];
    const retiredExtension = manager.executeRuntimeMethod({ method: "fixture" });
    await manager.stop();
    session = "third";
    await manager.start();
    await manager.listWorkspaceObjects();
    // An unversioned result proves the lifecycle check, independently of receipts.
    release({ status: "ready", value: "old outcome", workspaceUpdate: { ...delta(6), workspaceRevision: undefined } });
    assert.equal((await retiredExtension).workspaceUpdate, undefined);
    const empty = { ...delta(6), updated: [] };
    responses = [{ status: "ready", value: "checked empty", workspaceUpdate: empty }];
    assert.deepEqual((await manager.executeRuntimeMethod({ method: "fixture" })).workspaceUpdate, empty);
    assert.equal(manager.getWorkspaceSnapshot().workspaceRevision.sequence, 6);
    assert.equal(manager.getWorkspaceSnapshot().workspaceRevision.session, "third");
    assert.deepEqual(manager.getWorkspaceSnapshot().objects.map((entry) => entry.name), ["probe"]);
    await manager.stop();
    console.log("Mutation/extension replay: rejected and retired effects suppressed, nested batches sanitized, outcomes retained, checked-empty extension receipt accepted, no repeated writes/commits.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
