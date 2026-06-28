"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");

const {
    getRuntimeProvider
} = require("../../shared/runtime/providers/runtimeProviderRegistry");
const {
    createReservedRuntimeTransport
} = require("../../shared/runtime/transport/reservedRuntimeTransport");


const localR = getRuntimeProvider("r");
const localSession = localR.createSession();

assert.strictEqual(localSession.providerId, "r");
assert.strictEqual(localSession.transport, undefined);
assert.strictEqual(localR.transportController, undefined);

const serverR = getRuntimeProvider("server-r");
const serverSession = serverR.createSession();

assert.ok(serverR.transportController);
assert.strictEqual(serverSession.transport.providerId, "server-r");
assert.strictEqual(serverSession.transport.kind, "remote-session");
assert.strictEqual(serverSession.transport.state, "disconnected");
assert.strictEqual(serverSession.status, "not-started");

const webR = getRuntimeProvider("webr");
const webSession = webR.createSession();

assert.ok(webR.transportController);
assert.strictEqual(webSession.transport.providerId, "webr");
assert.strictEqual(webSession.transport.kind, "worker");
assert.strictEqual(webSession.transport.state, "disconnected");
assert.strictEqual(webSession.status, "not-started");

void (async function() {
    const reserved = createReservedRuntimeTransport({
        providerId: "reserved-test",
        kind: "remote-session",
        message: "Reserved test transport."
    });
    const initial = reserved.getSnapshot();

    assert.strictEqual(initial.state, "disconnected");
    assert.strictEqual(initial.kind, "remote-session");

    const failed = await reserved.connect();

    assert.strictEqual(failed.state, "failed");

    const response = await reserved.sendRequest({
        id: "request-1",
        method: "runtime.ping",
        params: {},
        createdAt: new Date().toISOString()
    });

    assert.strictEqual(response.status, "error");
    assert.strictEqual(response.id, "request-1");

    const disconnected = await reserved.disconnect();

    assert.strictEqual(disconnected.state, "disconnected");

    console.log("Runtime transport contract verified.");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
