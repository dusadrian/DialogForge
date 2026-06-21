"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createScriptFileResult } = require("../../shared/shell-electron/filesystem/scriptFileResult");
const opened = createScriptFileResult({
    status: "ready",
    filePath: "/tmp/script.R",
    content: "x <- 1\n",
    message: "Script file opened."
});
const canceled = createScriptFileResult({
    status: "canceled",
    canceled: true
});
assert.strictEqual(opened.status, "ready");
assert.strictEqual(opened.filePath, "/tmp/script.R");
assert.strictEqual(opened.content, "x <- 1\n");
assert.strictEqual(canceled.canceled, true);
console.log("Script file result contract verified.");
