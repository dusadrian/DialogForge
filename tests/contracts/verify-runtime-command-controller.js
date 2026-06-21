"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createTranscriptEvent } = require("../../shared/runtime/commands/commandProtocol");
const { createVisibleCommandRequest } = require("../../shared/runtime/commands/commandProtocol");
const { createRuntimeSessionManager } = require("../../shared/runtime/session/runtimeSessionManager");
const provider = {
    manifest: {
        id: "command-stub",
        label: "Command Stub",
        language: "stub",
        status: "test",
        capabilities: [
            "commands.visible"
        ]
    },
    createSession: function () {
        return {
            providerId: "command-stub",
            status: "not-started",
            connection: "stub",
            message: "Command stub is not started."
        };
    },
    commandController: {
        executeVisibleCommand: async function (request, snapshot) {
            assert.strictEqual(snapshot.status, "ready");
            assert.strictEqual(snapshot.providerId, "command-stub");
            return [
                createTranscriptEvent("submitted", request),
                createTranscriptEvent("output", request, {
                    message: `provider:${request.text}`
                }),
                createTranscriptEvent("completed", request)
            ];
        }
    }
};
const verifyCommandControllerDelegation = async function () {
    const manager = createRuntimeSessionManager(provider);
    await manager.start();
    const events = await manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "2 + 2",
        source: "contract-test"
    }));
    assert.deepStrictEqual(events.map((event) => {
        return event.type;
    }), ["submitted", "output", "completed"]);
    assert.strictEqual(events[1].message, "provider:2 + 2");
};
verifyCommandControllerDelegation()
    .then(() => {
    console.log("Runtime command controller contract verified.");
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
