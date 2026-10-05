"use strict";

const assert = require("node:assert/strict");
const {
    createRuntimeControlRequestSizeLimit,
    encodeRuntimeControlRequest,
    encodeRuntimeControlOutputCapture
} = require("../dist/src/runtime/providers/r/protocol/runtimeControlRequestEncoding");

for (const host of ["r", "webr"]) {
    const limit = createRuntimeControlRequestSizeLimit(512);
    assert.doesNotThrow(() => limit.check("x".repeat(512)), host);
    assert.throws(() => limit.check("x".repeat(513)), /request-too-large/);
    assert.doesNotThrow(() => limit.check("😀".repeat(128)));
    assert.throws(() => limit.check("😀".repeat(129)), /request-too-large/);
    const request = { id: "request", method: "execute_input", params: { code: "before", columns: ["x"] } };
    const encoded = encodeRuntimeControlRequest(request);
    request.params.code = "after";
    request.params.columns[0] = "y";
    const decorated = JSON.parse(encodeRuntimeControlOutputCapture(encoded, {
        outputCaptureName: "capture.bin", outputCaptureSession: "session"
    }));
    assert.equal(decodeURIComponent(decorated.code), "before");
    assert.equal(decodeURIComponent(decorated.columns), "x");
    assert.equal(decodeURIComponent(decorated.outputCaptureName), "capture.bin");
    assert.equal(decodeURIComponent(decorated.outputCaptureSession), "session");
}
for (const limit of [0, 511, 16777217, 1.5, Infinity]) {
    assert.throws(() => createRuntimeControlRequestSizeLimit(limit), /payload limit/);
}
console.log("Shared request-size and immutable capture decoration cases passed; adapter acceptance remains open.");
