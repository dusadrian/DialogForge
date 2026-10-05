"use strict";

const assert = require("node:assert/strict");
const { createRuntimeControlRequestPreparation } = require("../dist/src/runtime/providers/r/protocol/runtimeControlRequestPreparation");
const { createRuntimeControlRequestAdmission } = require("../dist/src/runtime/providers/r/protocol/runtimeControlRequestAdmission");
const { createRuntimeControlRequestSizeLimit } = require("../dist/src/runtime/providers/r/protocol/runtimeControlRequestEncoding");

for (const host of ["native", "webr"]) {
    const admission = createRuntimeControlRequestAdmission(1);
    const fixtureRequestBytes = 2048;
    const observed = [];
    let decorationError;
    const preparation = createRuntimeControlRequestPreparation({
        admission,
        sizeLimit: createRuntimeControlRequestSizeLimit(fixtureRequestBytes),
        diagnostics: { prepare(request) { observed.push(request); return request; } },
        connectionToken: host === "native" ? "fixture-token" : undefined,
        decorateRequest(request) {
            if (decorationError) {
                throw decorationError;
            }
            return host === "native" ? { ...request, transportNonce: "fixture:1" } : request;
        }
    });
    const request = { id: "first", method: "workspace.snapshot", params: { code: "original" } };
    const accepted = preparation.prepare(request);
    assert.equal(accepted.accepted, true, host);
    assert.ok(new TextEncoder().encode(accepted.encodedRequest).byteLength <= fixtureRequestBytes,
        "The ordinary encoded request must fit the fixture payload limit.");
    assert.notEqual(accepted.request, request);
    assert.notEqual(accepted.request.params, request.params);
    request.params.code = "changed";
    assert.equal(accepted.request.params.code, "original");
    assert.equal(preparation.getWorkspaceEpoch(), 0);
    assert.equal(preparation.prepare(request).response.error,
        "runtime-session-invalid-or-duplicate-request");
    assert.equal(preparation.prepare({ id: "full", method: "evaluate_code" }).response.error,
        "runtime-session-request-capacity");
    const reply = preparation.prepare({ id: "answer", method: "reply_prompt" });
    assert.equal(reply.accepted, true);
    assert.equal(preparation.getWorkspaceEpoch(), 1);
    admission.release("answer");
    admission.release("first");
    const oversized = preparation.prepare({
        id: "large", method: "evaluate_code", params: { code: "x".repeat(1000) }
    });
    assert.equal(oversized.accepted, false);
    assert.equal(oversized.response.error, "runtime-session-request-too-large");
    assert.equal(preparation.getWorkspaceEpoch(), 1);
    const reused = preparation.prepare({ id: "large", method: "workspace.update" });
    assert.equal(reused.accepted, true, "Rejected encoding must release admission.");
    admission.release("large");
    decorationError = new Error("runtime-session-request-sequence-exhausted");
    assert.equal(preparation.prepare({ id: "exhausted", method: "evaluate_code" })
        .response.error, decorationError.message);
    decorationError = new Error("unexpected adapter error");
    assert.equal(preparation.prepare({ id: "exhausted", method: "evaluate_code" })
        .response.error, "runtime-session-request-encoding-failed");
    assert.equal(preparation.getWorkspaceEpoch(), 1);
    preparation.retireWorkspaceEpoch();
    assert.equal(preparation.getWorkspaceEpoch(), 2);
    admission.retire();
    assert.equal(preparation.prepare({ id: "retired", method: "evaluate_code" })
        .response.error, "runtime-session-detached");
    assert.equal(observed.length, 4);
}

console.log("Shared runtime request preparation cases passed.");
