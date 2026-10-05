"use strict";
const assert = require("node:assert/strict");
const { createRWorkspaceController } = require("../dist/src/runtime/providers/r/controllers/rWorkspaceController");

const empty = {
    added: [], updated: [], removed: [], objectCount: 0,
    datasets: { added: [], removed: [], changed: [], copied: [] },
    workspaceRevision: { session: "fixture-session", sequence: 1 }, updatedAt: 0
};
const variable = { access_key: "data", display_name: "data", display_type: "data.frame" };
const malformed = [
    undefined, null, "not-json", "null", "[]", {}, [],
    { ...empty, added: undefined }, { ...empty, updated: {} },
    { ...empty, removed: [null] }, { ...empty, added: [{}] },
    { ...empty, updated: [null] }, { ...empty, objectCount: undefined },
    { ...empty, objectCount: "0" }, { ...empty, objectCount: -1 },
    { ...empty, objectCount: 0.5 }, { ...empty, workspaceRevision: undefined },
    { ...empty, workspaceRevision: { session: "", sequence: 1 } },
    { ...empty, workspaceRevision: { session: "fixture-session", sequence: "1" } },
    { ...empty, datasets: undefined },
    { ...empty, datasets: { ...empty.datasets, added: [null] } },
    { ...empty, datasets: { ...empty.datasets, changed: [{}] } },
    { ...empty, datasets: { ...empty.datasets, copied: [{}] } },
    { ...empty, objectCount: 1, added: [{ ...variable, name: " " }] },
    { ...empty, objectCount: 1, updated: [{ ...variable, name: {} }] }
];
const main = async function() {
    for (const host of ["r", "webr"]) {
        for (const body of malformed) {
            let calls = 0;
            let reply = body;
            const client = {
                getWorkspaceEpoch: () => 1,
                execute: async request => {
                    calls++;
                    assert.equal(request.method, "workspace.update");
                    return { id: "reconciliation-fixture", method: request.method, ok: true, result: reply };
                }
            };
            const controller = createRWorkspaceController({ getClient: () => client,
                createRequestId: () => "reconciliation-fixture" });
            await assert.rejects(controller.commitWorkspaceMutation(), error => {
                assert.equal(error.message, "Workspace refresh response is invalid.");
                assert.equal(error.cause.responseError, "invalid-workspace-update");
                assert.ok(!("result" in error.cause));
                return true;
            }, host + ": malformed checked delta cannot become an empty successful reconciliation.");
            assert.equal(calls, 1, "A malformed reply must not trigger automatic retry/replay.");
            reply = empty;
            const recovered = await controller.commitWorkspaceMutation();
            assert.equal(calls, 2, "The failed pending refresh must release its owner for an explicit next check.");
            assert.deepEqual(recovered.workspaceRevision, empty.workspaceRevision);
        }
        for (const body of [empty, { ...empty, objectCount: 1, added: [variable] },
            { ...empty, objectCount: 1, added: [{ name: "data", access_key: {}, display_name: {} }] },
            JSON.stringify(empty)]) {
            const client = { execute: async () => ({ id: "fixture", method: "workspace.update", ok: true, result: body }) };
            const controller = createRWorkspaceController({ getClient: () => client, createRequestId: () => "fixture" });
            const result = await controller.commitWorkspaceMutation();
            assert.deepEqual(result.workspaceRevision, empty.workspaceRevision);
            assert.equal(result.added.length, typeof body === "object" ? body.added.length : 0);
        }
    }
    console.log("SAME R controller rejects malformed reconciliation replies; genuine receipts and explicit recovery pass.");
};
main().catch(error => { console.error(error); process.exitCode = 1; });
