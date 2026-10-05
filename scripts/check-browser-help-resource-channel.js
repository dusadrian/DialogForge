"use strict";

const assert = require("node:assert/strict");
const { MessageChannel } = require("node:worker_threads");
const { createBrowserHelpResourceChannel } = require("../dist/src/shell-web/browserHelpResourceChannel");


const main = async function() {
    const listeners = new Set();
    const registrations = [];
    const worker = {
        postMessage(data, ports) {
            registrations.push(data);
            ports[0].postMessage({ ok: true });
            ports[0].close();
        }
    };
    const container = {
        controller: worker,
        addEventListener: (_name, listener) => listeners.add(listener),
        removeEventListener: (_name, listener) => listeners.delete(listener)
    };
    let reads = 0;
    let releaseRead;
    let readStarted;
    const started = new Promise((resolve) => { readStarted = resolve; });
    const channel = createBrowserHelpResourceChannel({
        serviceWorker: container,
        origin: "https://dialogforge.example",
        reader: {
            fetchResource: async (url) => {
                reads += 1;
                readStarted();
                return new Promise((resolve) => {
                    releaseRead = () => resolve({
                        ok: true, status: 200, url, contentType: "image/png",
                        body: Uint8Array.of(0, 255)
                    });
                });
            }
        }
    });
    const base = await channel.register();
    const owner = base.slice(base.lastIndexOf("/") + 1);
    assert.match(owner, /^[0-9a-f]{32}$/);
    assert.equal(registrations[0].owner, owner);

    const wrongPeer = new MessageChannel();
    for (const listener of listeners) {
        listener({ source: {}, data: { id: "dialogforge-help-resource", owner }, ports: [wrongPeer.port2] });
    }
    assert.equal(reads, 0, "An unrelated service worker must not trigger a runtime read.");
    wrongPeer.port1.close();
    wrongPeer.port2.close();

    const replyChannel = new MessageChannel();
    const result = new Promise((resolve) => {
        replyChannel.port1.onmessage = (event) => {
            replyChannel.port1.close();
            resolve(event.data);
        };
    });
    for (const listener of listeners) {
        listener({
            source: worker,
            data: { id: "dialogforge-help-resource", owner, url: "https://dialogforge.example/doc/html/Rlogo.png" },
            ports: [replyChannel.port2]
        });
    }
    await started;
    container.controller = { postMessage() {} };
    releaseRead();
    assert.deepEqual(await result, { error: "help-resource-retired", status: 410 },
        "A replacement browser connection must not accept its predecessor's pending bytes.");
    channel.close();
    channel.close();
    assert.equal(listeners.size, 0);
    assert.equal(registrations.filter((entry) => entry.id === "dialogforge-help-unregister").length, 1);
    await assert.rejects(channel.register(), /help-resource-channel-unavailable/);
    console.log("Browser help channel owner/peer retirement cases passed; rendered acceptance remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
