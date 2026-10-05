"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRuntimeControlEventRetention, RuntimeControlEventRetentionError } =
    require("../dist/src/runtime/providers/r/protocol/runtimeControlEventRetention");

for (const host of ["r", "webr"]) {
    const event = { type: "stream", text: "ş😀" };
    const bytes = new TextEncoder().encode(JSON.stringify(event)).byteLength;
    const retention = createRuntimeControlEventRetention({ maxRetainedEvents: 2, maxRetainedEventBytes: bytes * 2 });
    assert.equal(retention.check([event]), bytes, host);
    assert.equal(retention.check([event], 1, bytes), bytes * 2);
    assert.throws(() => retention.check([event], 2, bytes), /event-retention-limit/);
    assert.throws(() => retention.check([event], 2, bytes), RuntimeControlEventRetentionError);
    assert.throws(() => retention.check([event], 1, bytes + 1), /event-retention-limit/);
    assert.throws(() => retention.check([event, event, event]), /event-retention-limit/);
    assert.throws(() => retention.check([undefined]), /invalid-event-encoding/);
    assert.throws(() => retention.check([undefined]), RuntimeControlEventRetentionError);
    const cyclic = {};
    cyclic.self = cyclic;
    assert.throws(() => retention.check([cyclic]), /invalid-event-encoding/);
}
for (const limit of [0, -1, 1.5, Infinity]) {
    assert.throws(() => createRuntimeControlEventRetention({ maxRetainedEvents: limit }), /positive safe integers/);
    assert.throws(() => createRuntimeControlEventRetention({ maxRetainedEventBytes: limit }), /positive safe integers/);
}
for (const relativePath of [
    "src/runtime/providers/r/protocol/runtimeControlClient.ts",
    "src/runtime/providers/webr/webRSharedRuntimeControl.ts"
]) {
    const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
    assert.ok(source.includes("createRuntimeControlEventRetention(options)"));
}
console.log("Shared event retention cases passed; physical host acceptance remains open.");
