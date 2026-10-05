"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../src/base-app/pages/help.html"), "utf8");
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];

const createFixture = function(host) {
    const pending = [];
    const listeners = new Map();
    const elements = new Map();
    for (const id of ["helpFrame", "helpBack", "helpForward", "helpHome", "helpLocation"]) {
        elements.set(id, {
            srcdoc: "", contentWindow: {}, textContent: "",
            addEventListener() {}
        });
    }
    const api = {
        fetchHelpPage: () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
    };
    const window = {
        location: {
            origin: "http://fixture",
            href: "http://fixture/src/base-app/pages/help.html",
            search: "?src=http://localhost/library/base/html/first.html"
        },
        addEventListener: (name, callback) => listeners.set(name, callback),
        open() { throw new Error("Contract cases must not open external pages"); }
    };
    if (host === "r") {
        window.dialogForge = api;
        window.parent = window;
    }
    else {
        window.parent = { dialogForge: api, postMessage() {} };
    }
    const document = { title: "Help", getElementById: (id) => elements.get(id) };
    vm.runInNewContext(script, { window, document, URL, URLSearchParams, console });
    return {
        document,
        frame: elements.get("helpFrame"),
        pending,
        message: (data, source = window.parent) => listeners.get("message")({ data, source })
    };
};

const settle = async function() {
    for (let index = 0; index < 6; index += 1) {
        await Promise.resolve();
    }
};

const main = async function() {
    for (const host of ["r", "webr"]) {
        const documentReplacement = createFixture(host);
        documentReplacement.message({ id: "app-help-open", html: "<h1>New document</h1>", title: "New" });
        documentReplacement.pending[0].resolve({ ok: true, text: "Old URL", url: "http://localhost/first" });
        await settle();
        assert.ok(documentReplacement.frame.srcdoc.includes("New document"));
        assert.ok(!documentReplacement.frame.srcdoc.includes("Old URL"));

        const fixture = createFixture(host);
        fixture.message({ id: "app-help-open", url: "http://localhost/library/base/html/second.html" });
        fixture.pending[1].resolve({ ok: true, text: "<h1>Newest URL</h1>",
            url: "http://localhost/library/base/html/second.html" });
        await settle();
        fixture.pending[0].reject(new Error("retired URL failure"));
        await settle();
        assert.ok(fixture.frame.srcdoc.includes("Newest URL"));
        assert.ok(!fixture.frame.srcdoc.includes("Unable to load help page"));
        const title = fixture.document.title;
        fixture.message({ id: "app-help-complete", requestId: 1, title: "Retired title" }, fixture.frame.contentWindow);
        assert.equal(fixture.document.title, title);
        fixture.message({ id: "app-help-complete", requestId: 2, title: "Foreign title" }, {});
        assert.equal(fixture.document.title, title);
        fixture.message({ id: "app-help-complete", requestId: 2, title: "Current title" }, fixture.frame.contentWindow);
        assert.match(fixture.document.title, /Current title/);
        fixture.message({ id: "app-help-navigate", requestId: 1, url: "http://localhost/retired" }, fixture.frame.contentWindow);
        assert.equal(fixture.pending.length, 2, "Retired frames cannot initiate new help requests.");
    }
    console.log("Shared help navigation contract cases passed; this is not rendered host acceptance.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
