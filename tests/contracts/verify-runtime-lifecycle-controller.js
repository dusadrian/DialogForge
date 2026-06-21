"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createRuntimeSessionManager } = require("../../shared/runtime/session/runtimeSessionManager");
const provider = {
    manifest: {
        id: "stub",
        label: "Stub",
        language: "stub",
        status: "test",
        capabilities: []
    },
    createSession: function () {
        return {
            providerId: "stub",
            status: "not-started",
            connection: "controlled",
            message: "Stub runtime is not started."
        };
    },
    lifecycleController: {
        start: async function (snapshot) {
            assert.strictEqual(snapshot.status, "starting");
            return {
                providerId: snapshot.providerId,
                status: "ready",
                connection: snapshot.connection,
                message: "Stub runtime lifecycle controller started the session."
            };
        },
        stop: async function (snapshot) {
            assert.strictEqual(snapshot.status, "ready");
            return {
                providerId: snapshot.providerId,
                status: "stopped",
                connection: snapshot.connection,
                message: "Stub runtime lifecycle controller stopped the session."
            };
        }
    }
};
const verifyLifecycleControllerDelegation = async function () {
    const manager = createRuntimeSessionManager(provider);
    const started = await manager.start();
    assert.deepStrictEqual(started, {
        providerId: "stub",
        status: "ready",
        connection: "controlled",
        message: "Stub runtime lifecycle controller started the session."
    });
    const stopped = await manager.stop();
    assert.deepStrictEqual(stopped, {
        providerId: "stub",
        status: "stopped",
        connection: "controlled",
        message: "Stub runtime lifecycle controller stopped the session."
    });
};
verifyLifecycleControllerDelegation()
    .then(() => {
    console.log("Runtime lifecycle controller contract verified.");
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
