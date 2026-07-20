"use strict";

const assert = require("node:assert/strict");
const {
    createBrowserLiveScriptTransport
} = require("../../dist/src/shell-web/browserLiveScriptTransport");
const {
    createLiveScriptIpcController
} = require("../../dist/src/shell-electron/collaboration/liveScriptIpcController");
const {
    liveScriptIpcChannels
} = require("../../dist/src/script-editor/collaboration/liveScriptIpc");


const verifyBrowserPolicy = async function() {
    const controller = createBrowserLiveScriptTransport({
        enabled: false,
        moduleUrl: "/must-not-load.mjs",
        rendezvousUrl: "https://rendezvous.example.test",
        browserJoinUrl: "https://classroom.example.test/",
        publish() {}
    });
    const capability = await controller.capability();

    assert.equal(capability.available, false);
    assert.equal(capability.canHost, false);
    assert.equal(capability.canJoin, false);
    assert.equal(capability.browserJoinUrl, "https://classroom.example.test/");
    assert.match(capability.message, /disabled by deployment policy/);
    assert.equal((await controller.host("session_1234567890abcdef")).ok, false);
    assert.equal((await controller.join({})).ok, false);
};


const verifyElectronPolicy = async function() {
    const handlers = new Map();
    let capabilityCalls = 0;
    const transport = {
        endpointId: "",
        capability: async () => {
            capabilityCalls += 1;
            return { available: true, endpointId: "unexpected", message: "" };
        },
        host: async () => "{}",
        join: async () => {},
        send: async () => {},
        closeSession: async () => {},
        shutdown: async () => {},
        closeAllSessions: async () => {},
        disconnectPeer: async () => {},
        onFrame: () => ({ dispose() {} }),
        onState: () => ({ dispose() {} })
    };

    createLiveScriptIpcController({
        enabled: false,
        ipcMain: {
            handle(channel, handler) {
                handlers.set(channel, handler);
            }
        },
        transport,
        publish() {}
    });

    const capability = await handlers.get(liveScriptIpcChannels.capability)();
    assert.equal(capability.available, false);
    assert.equal(capability.canHost, false);
    assert.equal(capability.canJoin, false);
    assert.equal(capabilityCalls, 0);
    const host = await handlers.get(liveScriptIpcChannels.host)(null, {
        sessionId: "session_1234567890abcdef"
    });
    assert.equal(host.ok, false);
    assert.match(host.message, /disabled by deployment policy/);
};


const run = async function() {
    await verifyBrowserPolicy();
    await verifyElectronPolicy();
    process.stdout.write("live-script host deployment policy: ok\n");
};


run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
