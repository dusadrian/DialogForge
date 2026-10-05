"use strict";
const assert = require("node:assert/strict");
const { createRWorkspaceController } = require("../dist/src/runtime/providers/r/controllers/rWorkspaceController");

const main = async function() {
    for (const host of ["r", "webr"]) {
        for (const method of ["workspace.snapshot", "workspace.update"]) {
            for (const outcome of ["runtime-failure", "transport-failure", "rejected-request", "completion-failure",
                "retired-success", "retired-failure", "current-exception"]) {
                let current;
                let release;
                const original = Error("Physical workspace query exception");
                const reply = new Promise((resolve, reject) => { release = { resolve, reject }; });
                const client = {
                    execute: request => {
                        assert.equal(request.method, method);
                        return reply;
                    },
                    detach() {}
                };
                current = client;
                const controller = createRWorkspaceController({
                    getClient: () => current, createRequestId: prefix => prefix + "-fixture"
                });
                const pending = method === "workspace.snapshot"
                    ? controller.readWorkspaceSnapshot({ providerId: host, status: "ready" })
                    : controller.commitWorkspaceMutation();
                const observed = pending.then(() => null, error => error);
                if (outcome.startsWith("retired")) current = { ...client };
                const response = { id: "private-fixture-id", method,
                    ok: outcome === "retired-success",
                    error: outcome === "retired-success" ? undefined : "workspace-fixture-failure",
                    result: { privateDatasetValue: "must-not-be-copied-into-diagnostics" },
                    transportFailure: outcome === "transport-failure",
                    requestRejected: outcome === "rejected-request",
                    completionFailure: outcome === "completion-failure" };
                if (outcome === "current-exception") release.reject(original);
                else release.resolve(response);
                const error = await observed;
                if (outcome === "current-exception") {
                    assert.equal(error, original, "Existing thrown physical errors retain identity.");
                    continue;
                }
                assert.equal(error.message, method === "workspace.snapshot"
                    ? "Workspace snapshot is unavailable."
                    : "Workspace refresh did not complete in the current session.");
                assert.deepEqual(error.cause, {
                    method, responseId: response.id, responseError: response.error,
                    clientRetired: outcome.startsWith("retired"),
                    transportFailure: response.transportFailure,
                    requestRejected: response.requestRejected,
                    completionFailure: response.completionFailure
                }, host + ": current/retired transport/protocol/runtime failures must stay distinguishable");
                assert.ok(!JSON.stringify(error.cause).includes("privateDatasetValue"),
                    "Diagnostic cause must not contain returned workspace data.");
            }
        }
    }
    console.log("SAME workspace controller failure diagnostics passed; physical restart diagnosis remains separate.");
};
main().catch(error => { console.error(error); process.exitCode = 1; });
