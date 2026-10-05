"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { readRStartupOutput, hasRStartupPrompt } = require("../dist/src/runtime/providers/r/session/rStartupOutput");

for (const host of ["r", "webr"]) {
    for (const newline of ["\n", "\r\n", "\r"]) {
        const output = ["R version fixture", "Startup message", "> ", "ignored command output"].join(newline);
        assert.equal(readRStartupOutput(output), "R version fixture\nStartup message", host);
        assert.equal(hasRStartupPrompt(output), true);
    }
    assert.equal(readRStartupOutput("R version fixture\n>"), "R version fixture");
    assert.equal(readRStartupOutput("R version fixture\n+ continuation"), "R version fixture");
    assert.equal(readRStartupOutput("  \nBanner without prompt\n  "), "Banner without prompt");
    assert.equal(readRStartupOutput(""), "");
    assert.equal(hasRStartupPrompt("Version 4.6.0\nCopyright"), false);
    assert.equal(hasRStartupPrompt(">= compatibility\n++ package"), false);
}

for (const relativePath of [
    "src/runtime/providers/r/session/runtimeProcessHost.ts",
    "src/runtime/providers/webr/webRBrowserStartup.ts"
]) {
    const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
    assert.ok(source.includes("readRStartupOutput("));
}
assert.equal(fs.existsSync(path.join(__dirname, "../src/runtime/providers/webr/webRInstallProgressAdapter.ts")), false);
console.log("Shared R startup output cases passed; actual startup acceptance remains open.");
