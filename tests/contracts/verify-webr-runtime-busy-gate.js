"use strict";

const assert = require("node:assert/strict");
const { createBrowserWebRSession } = require("../../src/runtime/providers/webr/webRBrowserSession");
const { createRuntimeExtensionMethodRequest } = require("../../src/runtime/extensions/runtimeExtensionProtocol");

void (async function() {
    const calls = [];
    const session = createBrowserWebRSession({
        runtimeControlClient: {
            execute: async function(request) {
                calls.push(request);
                return { id: request.id, method: request.method, ok: true, result: true };
            },
            detach() {}
        },
        visibleCommands: { readConsoleOutputWidth: () => 80, recordTranscriptEvents() {} },
        runRuntimeOperation: (action) => action(),
        workspaceChanged: async () => {}
    });
    const manager = session.runtimeSessionManager;
    await manager.start();
    const reply = await manager.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
        method: "reply_prompt", params: { parentId: "activity", promptId: "prompt", reply: "" },
        source: "contract-test"
    }));
    assert.equal(reply.status, "ready");
    assert.equal(calls.at(-1).method, "reply_prompt");
    assert.equal(calls.at(-1).params.promptId, "prompt");
    const count = calls.length;
    const interrupt = await manager.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
        method: "runtime.interrupt", params: {}, source: "contract-test"
    }));
    assert.equal(interrupt.status, "unavailable");
    assert.equal(calls.length, count, "Unsupported host interrupt must not enter R request execution");
    console.log("Browser session uses the shared reply controller and retains host Interrupt capability.");
})().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
