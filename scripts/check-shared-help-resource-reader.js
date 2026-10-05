"use strict";

const assert = require("node:assert/strict");
const { createRHelpPageReader } = require("../dist/src/runtime/help/rHelpPageReader");
const { decodeRHelpResourcePacket, rHelpResourceMaxBytes } = require("../dist/src/runtime/help/rHelpResourceProtocol");
const { createRHelpPageProxy } = require("../dist/src/runtime/providers/r/help/rHelpPageProxy");
const { createWebRHelpPageReader } = require("../dist/src/runtime/providers/webr/webRHelpDocument");

const main = async function() {
    const url = "http://localhost/doc/html/Rlogo.png";
    const bytes = Uint8Array.from([0, 255, 13, 10, 128]);
    const packet = (status = 200, body = bytes, headers = []) => JSON.stringify({
        status, contentType: "image/png", headers, body: Buffer.from(body).toString("hex")
    });
    const native = createRHelpPageProxy({
        rewriteUrl: async (value) => value,
        resourceClient: {
            loadBuffer: async (target) => ({
                ok: true, status: 200, url: target, contentType: "image/png", body: bytes
            })
        }
    });
    const worker = createWebRHelpPageReader("http://localhost", async () => packet());
    assert.deepEqual(await native.fetchResource(url), await worker.fetchResource(url));
    assert.deepEqual((await worker.fetchResource(url)).body, bytes);
    assert.equal((await worker.fetchResource("https://external.example/doc/html/logo.png")).status, 404);

    const emptyNative = createRHelpPageProxy({
        rewriteUrl: async value => value,
        resourceClient: {
            loadBuffer: async target => ({
                ok: true, status: 200, url: target,
                contentType: "image/png", body: new Uint8Array()
            })
        }
    });
    const emptyWorker = createWebRHelpPageReader("http://localhost", async () => packet(200, new Uint8Array()));
    const rejectedImage = await emptyNative.fetchResource(url);
    assert.deepEqual(await emptyWorker.fetchResource(url), rejectedImage,
        "Both adapters use the same empty-image rejection.");
    assert.equal(rejectedImage.ok, false);
    assert.equal(rejectedImage.error, "help-resource-empty-image");
    assert.equal(rejectedImage.body, undefined);
    assert.doesNotThrow(() => decodeRHelpResourcePacket(packet(404, new Uint8Array()), url),
        "An empty unsuccessful response is not an accepted image.");
    const emptyCss = JSON.parse(packet(200, new Uint8Array()));
    emptyCss.contentType = "text/css";
    assert.equal(decodeRHelpResourcePacket(JSON.stringify(emptyCss), url).ok, true,
        "Valid empty non-image resources remain permitted.");

    for (const invalid of ["0", "gg", "000", 0, null]) {
        const value = JSON.parse(packet());
        value.body = invalid;
        assert.throws(() => decodeRHelpResourcePacket(JSON.stringify(value), url), /invalid-help-resource/);
    }
    assert.throws(() => decodeRHelpResourcePacket(packet(199), url), /invalid-help-resource/);
    assert.throws(() => decodeRHelpResourcePacket(packet(200, bytes, ["Location: /ok\r\nX: bad"]), url), /invalid-help-resource/);

    for (const host of ["native", "worker"]) {
        let reads = 0;
        const reader = createRHelpPageReader({
            resolveUrl: (value) => new URL(value).origin === "http://localhost" ? value : "",
            loadText: async () => { throw new Error("Binary resources must not use text decoding."); },
            loadBuffer: async (target) => {
                reads += 1;
                return host === "worker"
                    ? decodeRHelpResourcePacket(reads === 1
                        ? packet(302, new Uint8Array(), ["Location: Rlogo.png"])
                        : packet(), target)
                    : { ok: reads !== 1, status: reads === 1 ? 302 : 200,
                        url: target, contentType: "image/png", body: reads === 1 ? new Uint8Array() : bytes,
                        headers: reads === 1 ? ["Location: Rlogo.png"] : [] };
            }
        });
        assert.equal((await reader.fetchResource("http://localhost/doc/html/redirect.png")).url, url);
        assert.equal(reads, 2);
        const oversized = createRHelpPageReader({
            resolveUrl: (value) => value,
            loadText: async () => { throw new Error("unused"); },
            loadBuffer: async () => ({ ok: true, status: 200, url, contentType: "image/png",
                body: new Uint8Array(rHelpResourceMaxBytes + 1) })
        });
        assert.equal((await oversized.fetchResource(url)).error, "help-resource-too-large");
        const loop = createRHelpPageReader({
            resolveUrl: (value) => value,
            loadText: async (target) => ({ ok: false, status: 302, url: target,
                contentType: "text/html", text: "", headers: ["Location: " + target] })
        });
        assert.equal((await loop.fetchPage(url)).error, "help-resource-redirect-loop");

        for (const kind of ["page", "resource"]) {
            let current = true;
            let releaseRead;
            let dispatched;
            const dispatchedRead = new Promise((resolve) => { dispatched = resolve; });
            const pendingRead = new Promise((resolve) => { releaseRead = resolve; });
            const reader = createRHelpPageReader({
                resolveUrl: (value) => value,
                isCurrent: () => current,
                loadText: async () => { dispatched(); return pendingRead; },
                loadBuffer: async () => { dispatched(); return pendingRead; }
            });
            const pending = kind === "page" ? reader.fetchPage(url) : reader.fetchResource(url);
            await dispatchedRead;
            current = false;
            releaseRead({ ok: true, status: 200, url, contentType: "image/png", body: bytes, text: "obsolete" });
            const retired = await pending;
            assert.equal(retired.status, 410);
            assert.equal(retired.error, "help-resource-retired");
            assert.equal(retired.body, undefined);
            assert.equal(retired.text, undefined);
            assert.equal((await reader.fetchResource(url)).status, 410);
        }

        let generation = 0;
        for (const kind of ["page", "resource"]) {
            let lateGeneration = 1;
            const throwLate = async function() {
                lateGeneration++;
                throw Error("Old transport failure");
            };
            const lateReader = createRHelpPageReader({
                resolveUrl: value => value,
                captureOwner: function() {
                    const captured = lateGeneration;
                    return () => captured === lateGeneration;
                },
                loadText: throwLate, loadBuffer: throwLate
            });
            const lateFailure = kind === "page"
                ? await lateReader.fetchPage(url) : await lateReader.fetchResource(url);
            assert.equal(lateFailure.status, 410,
                "Retirement takes precedence over an obsolete transport exception.");
            assert.equal(lateFailure.error, "help-resource-retired");
            assert.equal(lateFailure.body, undefined);
            assert.equal(lateFailure.text, undefined);
        }
        const cold = createRHelpPageReader({
            resolveUrl: async (value) => { generation += 1; return value; },
            captureOwner: function() {
                const owner = generation;
                return () => generation === owner;
            },
            loadText: async (target) => ({ ok: true, status: 200, url: target, contentType: "text/html", text: "ready" })
        });
        assert.equal((await cold.fetchPage(url)).text, "ready", "Cold help startup precedes resource-owner capture.");

        for (const kind of ["page", "resource"]) {
            for (const retired of [false, true]) {
                let redirectGeneration = 1;
                let resolutions = 0;
                let loads = 0;
                const redirectReader = createRHelpPageReader({
                    resolveUrl: async function(value) {
                        resolutions++;
                        if (resolutions > 1) {
                            if (retired) {
                                redirectGeneration++;
                            }
                            throw Error("Redirect resolution failed");
                        }
                        return value;
                    },
                    captureOwner: function() {
                        const captured = redirectGeneration;
                        return () => captured === redirectGeneration;
                    },
                    loadText: async function(target) {
                        loads++;
                        return { ok: false, status: 302, url: target,
                            contentType: "text/html", text: "", headers: ["Location: /redirect"] };
                    },
                    loadBuffer: async function(target) {
                        loads++;
                        return { ok: false, status: 302, url: target,
                            contentType: "image/png", body: new Uint8Array(), headers: ["Location: /redirect"] };
                    }
                });
                const failed = kind === "page"
                    ? await redirectReader.fetchPage(url) : await redirectReader.fetchResource(url);
                assert.equal(failed.status, retired ? 410 : 500,
                    "Redirect errors retain the original response owner.");
                assert.equal(failed.error, retired ? "help-resource-retired" : "Redirect resolution failed");
                assert.equal(failed.body, undefined);
                assert.equal(failed.text, undefined);
                assert.equal(loads, 1, "Failed redirect resolution must not load another resource.");
            }
        }
    }
    console.log("Shared help resource cases passed; real worker assets and rendered parity remain open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
