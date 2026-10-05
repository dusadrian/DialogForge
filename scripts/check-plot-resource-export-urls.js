"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("src/base-app/pages/plotViewer.html", "utf8");
const start = source.indexOf("        const derivePlotUrl = function");
const end = source.indexOf("        const parseRendererIds = function", start);
assert.ok(start >= 0 && end > start);
const context = vm.createContext({ URL, latestPayload: {} });
vm.runInContext(source.slice(start, end) + "\nthis.exportUrl = deriveExportUrl; this.prepareExport = preparePlotExportUrl;", context);

const native = new URL(context.exportUrl("http://127.0.0.1:1234/live?token=fixture", 1, 800, 600, "png"));
assert.equal(native.pathname, "/plot");
assert.equal(native.searchParams.get("renderer"), "png");
assert.equal(native.searchParams.get("index"), "1");
assert.equal(native.searchParams.get("token"), "fixture");
for (const url of ["blob:http://acceptance.invalid/fixture", "data:image/png;base64,fixture"]) {
    assert.equal(context.exportUrl(url, 0, 800, 600, "png"), url);
    context.latestPayload = { urls: [url] };
    assert.equal(context.exportUrl("blob:previous", 0, 800, 600, "png"), url);
    context.latestPayload = {};
}
assert.ok(!source.includes("return Promise.resolve({ ok: true });"),
    "A missing physical plot bridge cannot acknowledge an operation as successful.");
const checkCapturedDimensions = async function() {
    const draws = [];
    const canvas = {
        width: 0,
        height: 0,
        getContext() {
            return { drawImage(...args) { draws.push(args.slice(1)); } };
        },
        toDataURL(type) {
            assert.equal(type, "image/png");
            return "data:image/png;base64,resized";
        }
    };
    context.Image = class {
        naturalWidth = 1440;
        naturalHeight = 1152;
        async decode() {}
    };
    context.document = { createElement() { return canvas; } };
    const url = await context.prepareExport("blob:fixture", 0, 800, 600, "png");
    assert.equal(url, "data:image/png;base64,resized");
    assert.equal(canvas.width, 800);
    assert.equal(canvas.height, 600);
    assert.deepEqual(draws, [[0, 0, 800, 600]]);
    const nativeUrl = await context.prepareExport(
        "http://127.0.0.1:1234/live", 0, 800, 600, "png"
    );
    assert.equal(new URL(nativeUrl).searchParams.get("width"), "800");
    context.Image = class {
        async decode() { throw new Error("retired resource"); }
    };
    await assert.rejects(context.prepareExport("blob:retired", 0, 800, 600, "png"),
        /retired resource/);
};

checkCapturedDimensions().then(() => {
    console.log("Canonical plot resource export URL cases passed.");
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
