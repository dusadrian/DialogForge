"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");

const {
    createBundledWebRRuntimeBridge
} = require("../../shared/runtime/providers/webr/webRRuntimeBridge");
const {
    webRTransportMethods
} = require("../../shared/runtime/providers/webr/webRTransportMethods");
const {
    getRuntimeProvider
} = require("../../shared/runtime/providers/runtimeProviderRegistry");
const {
    createRuntimeSessionManager
} = require("../../shared/runtime/session/runtimeSessionManager");


const createRequest = function(id, method, params) {
    return {
        id,
        method,
        params,
        createdAt: new Date().toISOString()
    };
};


void (async function() {
    class FakeShelter {
        async captureR(code) {
            assert.strictEqual(code, "print(1)");

            return {
                output: [
                    { type: "stdout", data: "[1] 1" },
                    { type: "warning", data: "test warning" }
                ]
            };
        }

        async purge() {
            return;
        }
    }

    const bridge = createBundledWebRRuntimeBridge({
        createRuntime: async function() {
            return {
                Shelter: FakeShelter,
                init: async function() {
                    return;
                },
                close: function() {
                    return;
                },
                evalRVoid: async function() {
                    return;
                },
                evalRRaw: async function() {
                    throw new Error("raw conversion failed");
                },
                evalRString: async function(code) {
                    assert.ok(code.includes(".DialogForgeValue"));

                    return "converted";
                }
            };
        }
    });

    assert.ok(bridge);
    await bridge.start();

    const visible = await bridge.sendRequest(createRequest(
        "visible-1",
        webRTransportMethods.visibleCommand,
        {
            request: {
                kind: "commands.visible",
                text: "print(1)",
                source: "test",
                createdAt: new Date().toISOString()
            }
        }
    ));

    assert.strictEqual(visible.status, "ok");
    assert.deepStrictEqual(
        visible.value.transcriptEvents.map((event) => event.type),
        ["submitted", "output", "output", "completed"]
    );
    assert.strictEqual(visible.value.transcriptEvents[1].streamName, "stdout");
    assert.strictEqual(visible.value.transcriptEvents[2].streamName, "stderr");

    const invisible = await bridge.sendRequest(createRequest(
        "query-1",
        webRTransportMethods.invisibleQuery,
        {
            request: {
                query: "1 + 1",
                source: "test"
            }
        }
    ));

    assert.strictEqual(invisible.status, "ok");
    assert.strictEqual(invisible.value.value, "converted");

    const manager = createRuntimeSessionManager(getRuntimeProvider("webr", {
        transportEndpoint: "/runtime/webr/",
        transportConnectProbe: async function() {
            return {
                ok: true,
                message: "Ready from test probe."
            };
        }
    }));

    const started = await manager.start();

    assert.strictEqual(started.status, "ready");
    assert.strictEqual(started.connection, "connected");
    assert.strictEqual(started.transport.state, "connected");

    const stopped = await manager.stop();

    assert.strictEqual(stopped.status, "stopped");
    assert.strictEqual(stopped.connection, "disconnected");

    console.log("WebR transcript mapping, value conversion, and readiness verified.");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
