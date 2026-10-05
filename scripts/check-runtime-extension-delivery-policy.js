"use strict";

const assert = require("node:assert/strict");
const { createRuntimeInterruptResult } = require("../dist/src/runtime/extensions/runtimeInterruptResult");
const { createRuntimeExtensionExecutionController } = require("../dist/src/runtime/extensions/runtimeExtensionExecutionController");
const { createRExtensionController } = require("../dist/src/runtime/providers/r/controllers/rExtensionController");

const main = async function() {
    for (const providerId of ["r", "webr"]) {
        const snapshot = { providerId, status: "ready", connection: "fixture" };
        for (const [accepted, status] of [[true, "ready"], [false, "failed"], [null, "unavailable"]]) {
            const result = createRuntimeInterruptResult(snapshot, accepted);
            assert.equal(result.status, status);
            assert.equal(result.providerId, providerId);
            assert.equal(result.value, accepted);
        }
        const controller = createRuntimeExtensionExecutionController({
            executeRuntimeMethod: async () => ({ status: "ready", providerId, value: { ok: false } })
        });
        const reply = await controller.execute({ method: "reply_prompt", params: {} }, snapshot);
        assert.equal(reply.status, "failed", "Rejected input is not accepted delivery.");
    }

    const browser = createRExtensionController({
        getClient: () => null, createRequestId: prefix => prefix,
        interrupt: () => null,
        interruptUnavailableMessage: "WebR interrupt is not available in this browser runtime."
    });
    const result = await browser.executeRuntimeMethod(
        { method: "runtime.interrupt", params: {} },
        { providerId: "webr-current", status: "ready", connection: "fixture" }
    );
    assert.equal(result.status, "unavailable");
    assert.equal(result.providerId, "webr-current", "Use the actual session, not a fixed ready snapshot.");
    console.log("Shared extension delivery policy cases passed.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
