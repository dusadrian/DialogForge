"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");

const {
    getRuntimeProvider
} = require("../../shared/runtime/providers/runtimeProviderRegistry");


void (async function() {
    const missingEndpoint = getRuntimeProvider("server-r");
    const missingEndpointConnect = await missingEndpoint.transportController.connect();

    assert.strictEqual(missingEndpointConnect.state, "failed");
    assert.match(missingEndpointConnect.message, /endpoint is not configured/);

    const missingProbe = getRuntimeProvider("server-r", {
        transportEndpoint: "https://r.example.test/session"
    });
    const missingProbeConnect = await missingProbe.transportController.connect();

    assert.strictEqual(missingProbeConnect.state, "failed");
    assert.match(missingProbeConnect.message, /probe is not configured/);

    const missingCredential = getRuntimeProvider("server-r", {
        transportEndpoint: "https://r.example.test/session",
        transportAuthPolicy: {
            required: true,
            kind: "bearer",
            source: "deployment"
        },
        transportConnectProbe: async function() {
            return {
                ok: true,
                message: "Should not connect without credentials."
            };
        }
    });
    const missingCredentialConnect = await missingCredential.transportController.connect();

    assert.strictEqual(missingCredentialConnect.state, "failed");
    assert.match(missingCredentialConnect.message, /credentials are not configured/);

    let probeRequest = null;
    const connectedProvider = getRuntimeProvider("server-r", {
        transportEndpoint: "https://r.example.test/session",
        transportAuthPolicy: {
            required: true,
            kind: "bearer",
            source: "deployment"
        },
        transportCredential: {
            kind: "bearer",
            token: "test-token",
            source: "host"
        },
        transportConnectProbe: async function(request) {
            probeRequest = request;

            return {
                ok: true,
                message: "Connected to test Server R session.",
                sessionId: "session-1"
            };
        }
    });
    const initial = connectedProvider.createSession();

    assert.strictEqual(initial.transport.state, "disconnected");
    assert.strictEqual(initial.transport.endpoint, "https://r.example.test/session");
    assert.strictEqual(initial.transport.authentication.required, true);
    assert.strictEqual(initial.transport.authentication.credentialProvided, true);

    const connected = await connectedProvider.transportController.connect();

    assert.strictEqual(connected.state, "connected");
    assert.strictEqual(probeRequest.providerId, "server-r");
    assert.strictEqual(probeRequest.kind, "remote-session");
    assert.strictEqual(probeRequest.endpoint, "https://r.example.test/session");
    assert.strictEqual(probeRequest.authentication.required, true);
    assert.strictEqual(probeRequest.authentication.credentialProvided, true);
    assert.strictEqual(probeRequest.credential.token, "test-token");

    const requestResult = await connectedProvider.transportController.sendRequest({
        id: "server-request-1",
        method: "workspace.list",
        params: {},
        createdAt: new Date().toISOString()
    });

    assert.strictEqual(requestResult.status, "error");
    assert.match(requestResult.message, /request routing is not implemented/);

    const disconnected = await connectedProvider.transportController.disconnect();

    assert.strictEqual(disconnected.state, "disconnected");

    const failingProvider = getRuntimeProvider("server-r", {
        transportEndpoint: "https://r.example.test/session",
        transportConnectProbe: async function() {
            return {
                ok: false,
                message: "",
                failureKind: "authentication-rejected"
            };
        }
    });
    const failed = await failingProvider.transportController.connect();

    assert.strictEqual(failed.state, "failed");
    assert.strictEqual(failed.message, "Server R authentication was rejected.");

    const unreachableProvider = getRuntimeProvider("server-r", {
        transportEndpoint: "https://r.example.test/session",
        transportConnectProbe: async function() {
            return {
                ok: false,
                message: "",
                failureKind: "unreachable"
            };
        }
    });
    const unreachable = await unreachableProvider.transportController.connect();

    assert.strictEqual(unreachable.state, "failed");
    assert.strictEqual(unreachable.message, "Server R endpoint is unreachable.");

    console.log("Server R lifecycle contract verified.");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
