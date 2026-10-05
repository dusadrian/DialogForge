"use strict";

const assert = require("node:assert/strict");
const { createRHelpPageReader } = require("../dist/src/runtime/help/rHelpPageReader");
const { createRHelpPageProxy } = require("../dist/src/runtime/providers/r/help/rHelpPageProxy");
const { fetchWebRHelpPageByUrl, fetchWebRHelpHttpdPath, fetchWebRHelpHomeDocument } = require("../dist/src/runtime/providers/webr/webRHelpDocument");
const { buildWebRHelpResourceCommand } = require("../dist/src/runtime/providers/webr/webRHelpResourceTransport");
const { prepareRHelpDocumentWithoutResources } = require("../dist/src/runtime/help/rHelpDocument");

const main = async function() {
    const html = '\r\n<main><link rel="stylesheet" href="/doc/html/R.css">'
        + '<script src="/doc/html/probe.js"></script><img class="toplogo" src="/doc/html/Rlogo.svg">'
        + '<h1>Names</h1><p>Help text</p></main>\r\n';
    const packet = (body, contentType = "text/html; charset=utf-8", status = 200) => JSON.stringify({
        status, contentType, headers: [], body: Buffer.from(body).toString("hex")
    });
    const url = "http://localhost/library/base/html/names.html";
    const native = createRHelpPageProxy({
        rewriteUrl: async (value) => value,
        resourceClient: {
            loadText: async (target) => ({ ok: true, status: 200, url: target,
                text: html, contentType: "text/html; charset=utf-8" })
        }
    });
    assert.deepEqual(await native.fetchPage(` ${url} `),
        await fetchWebRHelpPageByUrl(` ${url} `, "http://localhost", async () => packet(html)));
    assert.equal((await fetchWebRHelpPageByUrl(url, "http://localhost", async () => packet(html))).text,
        html, "The worker reader must retain the same HTML/assets as native R.");
    assert.equal(prepareRHelpDocumentWithoutResources(html),
        "\r\n<main><h1>Names</h1><p>Help text</p></main>\r\n");
    const css = "\r\nbody { color: black; }\r\n";
    const resource = await fetchWebRHelpHttpdPath("/doc/html/R.css", async (command) => {
        assert.ok(command.includes('readBin(.connection, "raw"'), "Worker file delivery preserves binary bytes.");
        assert.equal(command.includes("readLines("), false);
        return packet(css, "text/css");
    });
    assert.equal(resource, css, "Transport must not trim R help resources.");
    const queried = await fetchWebRHelpPageByUrl(`${url}?topic=a+b&topic=c%26d&bare&empty=`,
        "http://localhost", async (command) => {
            assert.ok(command.includes('base::c("a b", "c&d", "bare", "")'));
            assert.ok(command.includes('names = base::c("topic", "topic", "", "empty")'));
            assert.ok(command.includes("tools:::httpd(.path, .query)"));
            return packet(html);
        });
    assert.equal(queried.url, `${url}?topic=a+b&topic=c%26d&bare&empty=`);
    assert.ok(buildWebRHelpResourceCommand("/doc/html/R.css").includes(".query <- NULL"));
    assert.ok(buildWebRHelpResourceCommand("/library/base/html/names.html")
        .includes('.type <- "text/html"'), "Match the native HTTP handler's default content type.");
    assert.throws(() => buildWebRHelpResourceCommand("/doc/html/R.css", "?x=%00"),
        /invalid-help-resource-query/);
    assert.equal((await fetchWebRHelpHomeDocument("http://localhost", async () => packet(html)))
        .baseUrl, "http://localhost/doc/html/index.html");
    await assert.rejects(fetchWebRHelpHomeDocument("http://localhost", async () => {
        throw new Error("Retired home reads must not query the worker");
    }, () => false), /help-resource-retired/);
    assert.equal((await native.fetchPage("https://external.example/help")).error, "invalid-help-url");
    assert.equal((await native.fetchPage("")).status, 400);
    assert.equal((await fetchWebRHelpPageByUrl("/unsupported", "http://localhost", async () => {
        throw new Error("Invalid help paths must not query the worker");
    })).status, 404);

    for (const asynchronous of [false, true]) {
        let reads = 0;
        const reader = createRHelpPageReader({
            resolveUrl: (raw) => asynchronous ? Promise.resolve(raw) : raw,
            loadText: async () => {
                reads += 1;
                throw new Error("resource unavailable");
            }
        });
        assert.deepEqual(await reader.fetchPage(url), {
            ok: false, status: 500, error: "resource unavailable"
        });
        assert.equal(reads, 1);
        assert.equal((await reader.fetchPage("")).error, "invalid-help-url");
        assert.equal(reads, 1);
    }
    console.log("Shared help page reader cases passed; worker resources and rendered help acceptance remain open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
