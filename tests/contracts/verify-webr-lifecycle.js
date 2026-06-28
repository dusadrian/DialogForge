"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");

const {
    getRuntimeProvider
} = require("../../shared/runtime/providers/runtimeProviderRegistry");


void (async function() {
    const missingWorker = getRuntimeProvider("webr");
    const missingWorkerConnect = await missingWorker.transportController.connect();

    assert.strictEqual(missingWorkerConnect.state, "failed");
    assert.match(missingWorkerConnect.message, /asset base URL is not configured/);

    const missingProbe = getRuntimeProvider("webr", {
        transportEndpoint: "/runtime/webr-worker.js"
    });
    const missingProbeConnect = await missingProbe.transportController.connect();

    assert.strictEqual(missingProbeConnect.state, "failed");
    assert.match(missingProbeConnect.message, /bootstrap probe is not configured/);

    let probeRequest = null;
    const connectedProvider = getRuntimeProvider("webr", {
        transportEndpoint: "/runtime/webr-worker.js",
        transportConnectProbe: async function(request) {
            probeRequest = request;

            return {
                ok: true,
                message: "Started test WebR worker."
            };
        }
    });
    const initial = connectedProvider.createSession();

    assert.strictEqual(initial.transport.state, "disconnected");
    assert.strictEqual(initial.transport.kind, "worker");
    assert.strictEqual(initial.transport.endpoint, "/runtime/webr-worker.js");
    assert.strictEqual(initial.transport.authentication.required, false);
    assert.strictEqual(initial.transport.authentication.kind, "none");

    const connected = await connectedProvider.transportController.connect();

    assert.strictEqual(connected.state, "connected");
    assert.strictEqual(probeRequest.providerId, "webr");
    assert.strictEqual(probeRequest.kind, "worker");
    assert.strictEqual(probeRequest.endpoint, "/runtime/webr-worker.js");
    assert.strictEqual(probeRequest.authentication.required, false);
    assert.strictEqual(probeRequest.credential, undefined);

    const requestResult = await connectedProvider.transportController.sendRequest({
        id: "webr-request-1",
        method: "workspace.list",
        params: {},
        createdAt: new Date().toISOString()
    });

    assert.strictEqual(requestResult.status, "error");
    assert.match(requestResult.message, /request routing is not implemented/);

    const disconnected = await connectedProvider.transportController.disconnect();

    assert.strictEqual(disconnected.state, "disconnected");

    const unreachableProvider = getRuntimeProvider("webr", {
        transportEndpoint: "/runtime/webr-worker.js",
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
    assert.strictEqual(unreachable.message, "WebR worker script is unreachable.");

    const configurationProvider = getRuntimeProvider("webr", {
        transportEndpoint: "/runtime/webr-worker.js",
        transportConnectProbe: async function() {
            return {
                ok: false,
                message: "",
                failureKind: "configuration"
            };
        }
    });
    const configuration = await configurationProvider.transportController.connect();

    assert.strictEqual(configuration.state, "failed");
    assert.strictEqual(configuration.message, "WebR worker bootstrap is not configured correctly.");

    console.log("WebR lifecycle contract verified.");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
