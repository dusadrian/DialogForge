"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRuntimeControlRequestAdmission } = require("../dist/src/runtime/providers/r/protocol/runtimeControlRequestAdmission");

for (const host of ["r", "webr"]) {
    const admission = createRuntimeControlRequestAdmission(1);
    assert.equal(admission.admit({ id: "", method: "execute_input" }), "runtime-session-invalid-or-duplicate-request", host);
    assert.equal(admission.admit({ id: "bad", method: null }), "runtime-session-invalid-or-duplicate-request");
    assert.equal(admission.admit({ id: "active", method: "execute_input" }), null);
    assert.equal(admission.admit({ id: "active", method: "workspace.snapshot" }), "runtime-session-invalid-or-duplicate-request");
    assert.equal(admission.admit({ id: "queued", method: "workspace.snapshot" }), "runtime-session-request-capacity");
    assert.equal(admission.admit({ id: "reply", method: "reply_prompt" }), null, "A full ordinary lane must leave room for its prompt answer.");
    assert.equal(admission.admit({ id: "another-reply", method: "reply_prompt" }), "runtime-session-request-capacity");
    admission.release("queued");
    assert.equal(admission.admit({ id: "queued", method: "workspace.snapshot" }), "runtime-session-request-capacity");
    admission.release("reply");
    assert.equal(admission.admit({ id: "another-reply", method: "reply_prompt" }), null);
    admission.release("active");
    assert.equal(admission.admit({ id: "queued", method: "workspace.snapshot" }), null);
    admission.retire();
    admission.release("queued");
    assert.equal(admission.admit({ id: "replacement", method: "workspace.snapshot" }), "runtime-session-detached");
    assert.equal(createRuntimeControlRequestAdmission(1).admit({ id: "replacement", method: "workspace.snapshot" }), null);
}

for (const limit of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createRuntimeControlRequestAdmission(limit), /positive safe integer/);
}

for (const relativePath of [
    "src/runtime/providers/r/protocol/runtimeControlClient.ts",
    "src/runtime/providers/webr/webRSharedRuntimeControl.ts"
]) {
    const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
    assert.ok(source.includes("createRuntimeControlRequestAdmission("));
    assert.equal(source.includes("new Set<string>()"), false, "Request sets belong to the shared admission file.");
}

console.log("Shared request admission cases passed; physical prompt/drain acceptance remains open.");
