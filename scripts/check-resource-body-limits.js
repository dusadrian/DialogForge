"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { createResourceBodyCollector } = require("../dist/src/core/host/resourceBodyCollector");
const { createBrowserResourceClient } = require("../dist/src/core/host/browserResourceClient");
const { createNodeResourceClient } = require("../dist/src/core/host/nodeResourceClient");
const { createRHelpPageReader } = require("../dist/src/runtime/help/rHelpPageReader");


const main = async function() {
    for (const limit of [-1, NaN, Infinity, 1.5]) {
        assert.throws(() => createResourceBodyCollector(limit), /invalid-resource-body-limit/);
    }
    const collector = createResourceBodyCollector(4);
    collector.append(Uint8Array.of(0, 255));
    collector.append(Uint8Array.of(13, 10));
    assert.deepEqual(collector.finish(), Uint8Array.of(0, 255, 13, 10));
    const overflow = createResourceBodyCollector(3);
    overflow.append(Uint8Array.of(1, 2));
    assert.throws(() => overflow.append(Uint8Array.of(3, 4)), /resource-body-too-large/);
    assert.throws(() => overflow.finish(), /resource-body-too-large/);
    assert.equal(createResourceBodyCollector(0).finish().byteLength, 0);

    const originalFetch = global.fetch;
    let cancelled = false;
    global.fetch = async () => new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(Uint8Array.of(1, 2));
            controller.enqueue(Uint8Array.of(3, 4));
        },
        cancel() { cancelled = true; }
    }));
    try {
        await assert.rejects(createBrowserResourceClient().loadBuffer("https://example.invalid/resource",
            { maxBodyBytes: 3 }), /resource-body-too-large/);
        assert.equal(cancelled, true, "Overflow must cancel the physical browser reader.");
        global.fetch = async () => new Response(Uint8Array.of(0, 255, 13, 10));
        assert.deepEqual((await createBrowserResourceClient().loadBuffer("https://example.invalid/resource",
            { maxBodyBytes: 4 })).body, Uint8Array.of(0, 255, 13, 10));
        global.fetch = async () => new Response("abc");
        assert.equal((await createBrowserResourceClient().loadText("https://example.invalid/resource",
            { maxBodyBytes: 3 })).text, "abc");
    } finally {
        global.fetch = originalFetch;
    }

    const server = http.createServer((request, response) => {
        if (request.url === "/abort") {
            response.writeHead(200, { "Content-Length": "4", "Connection": "close" });
            response.end(Buffer.from([0, 255]));
            return;
        }
        response.writeHead(200, { "Content-Type": "application/octet-stream" });
        response.write(Buffer.from([0, 255]));
        response.end(Buffer.from([13, 10]));
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    try {
        const url = `http://127.0.0.1:${server.address().port}/resource`;
        const client = createNodeResourceClient();
        assert.deepEqual((await client.loadBuffer(url, { maxBodyBytes: 4 })).body,
            Uint8Array.of(0, 255, 13, 10));
        await assert.rejects(client.loadBuffer(url, { maxBodyBytes: 3 }), /resource-body-too-large/);
        await assert.rejects(client.loadBuffer(url.replace("/resource", "/abort"),
            { maxBodyBytes: 4 }), /resource-body-aborted|aborted|socket hangup/);
        const help = createRHelpPageReader({
            resolveUrl: (value) => value,
            loadText: (value) => client.loadText(value, { maxBodyBytes: 3 }),
            loadBuffer: (value) => client.loadBuffer(value, { maxBodyBytes: 3 })
        });
        assert.equal((await help.fetchResource(url)).error, "help-resource-too-large");
        assert.equal((await help.fetchPage(url)).error, "help-resource-too-large");
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
    console.log("Shared resource byte limits passed through browser and native HTTP adapters.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
