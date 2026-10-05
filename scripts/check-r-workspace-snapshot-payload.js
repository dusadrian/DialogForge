"use strict";
const assert = require("node:assert/strict");
const { createRWorkspaceController } = require("../dist/src/runtime/providers/r/controllers/rWorkspaceController");

const empty = { variables: [], dataframe: {}, objectCount: 0,
    workspaceRevision: { session: "fixture-session", sequence: 1 } };
const variable = { access_key: "data", display_name: "data", display_type: "data.frame", has_viewer: true };
const malformed = [
    undefined, null, "not-json", "null", "[]", {}, [],
    { ...empty, variables: undefined }, { ...empty, variables: {} },
    { ...empty, objectCount: undefined }, { ...empty, objectCount: "0" },
    { ...empty, objectCount: -1 }, { ...empty, objectCount: 0.5 },
    { ...empty, objectCount: 1 }, { ...empty, variables: [variable] },
    { ...empty, workspaceRevision: undefined },
    { ...empty, workspaceRevision: { session: "", sequence: 1 } },
    { ...empty, workspaceRevision: { session: "fixture-session", sequence: "1" } },
    { ...empty, workspaceRevision: { session: "fixture-session", sequence: 0 } },
    { ...empty, workspaceRevision: { session: "fixture-session", sequence: Number.MAX_SAFE_INTEGER + 1 } },
    { ...empty, objectCount: 1, variables: [null] },
    { ...empty, objectCount: 1, variables: [{}] },
    { ...empty, objectCount: 1, variables: [{ access_key: {} }] },
    { ...empty, objectCount: 1, variables: [{ ...variable, name: " " }] },
    { ...empty, objectCount: 1, variables: [{ ...variable, name: {} }] }
];
const main = async function() {
    for (const host of ["r", "webr"]) {
        for (const body of [...malformed, empty, { ...empty, objectCount: 1, variables: [variable] },
            { ...empty, objectCount: 1, variables: [{ name: "data", access_key: {}, display_name: {} }],
                dataframe: { data: { colnames: ["x"], rowCount: 2 } } },
            JSON.stringify(empty)]) {
            const client = { execute: async () => ({ id: "snapshot-fixture", method: "workspace.snapshot",
                ok: true, result: body }), detach() {} };
            const controller = createRWorkspaceController({ getClient: () => client, createRequestId: () => "snapshot-fixture" });
            if (malformed.includes(body)) {
                await assert.rejects(controller.readWorkspaceSnapshot({ providerId: host, status: "ready" }), error => {
                    assert.equal(error.message, "Workspace snapshot response is invalid.");
                    assert.equal(error.cause.responseError, "invalid-workspace-snapshot");
                    assert.ok(!("result" in error.cause), "Returned workspace data must not leak into diagnostic cause.");
                    return true;
                }, "Malformed checked reply cannot become an authoritative empty workspace.");
            }
            else {
                const snapshot = await controller.readWorkspaceSnapshot({ providerId: host, status: "ready" });
                assert.equal(snapshot.status, "ready");
                assert.equal(snapshot.objects.length, typeof body === "object" ? body.variables.length : 0);
                assert.deepEqual(snapshot.workspaceRevision, empty.workspaceRevision);
                if (typeof body === "object" && body.variables[0]?.name === "data") {
                    assert.equal(snapshot.objects[0].name, "data");
                    assert.deepEqual(snapshot.objects[0].columns, ["x"]);
                    assert.equal(snapshot.objects[0].rows, 2,
                        "Snapshot metadata lookup must use the same selected object name.");
                }
            }
        }
    }
    console.log("SAME R controller rejects malformed snapshots and accepts checked empty/populated replies.");
};
main().catch(error => { console.error(error); process.exitCode = 1; });
