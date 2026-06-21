"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createOpenFileResult, createPathInfoResult } = require("../../shared/shell-electron/filesystem/openFileResult");
const selected = createOpenFileResult({
    canceled: false,
    filePaths: ["/tmp/data.csv"]
});
const canceled = createOpenFileResult({
    canceled: true,
    filePaths: []
});
assert.strictEqual(selected.status, "selected");
assert.strictEqual(selected.filePath, "/tmp/data.csv");
assert.strictEqual(canceled.status, "canceled");
assert.strictEqual(canceled.filePath, "");
const inspected = createPathInfoResult({
    status: "ready",
    path: "/tmp/script.R",
    kind: "file",
    extension: ".r",
    basename: "script.R",
    message: "Path inspected."
});
assert.strictEqual(inspected.kind, "file");
assert.strictEqual(inspected.extension, ".r");
assert.strictEqual(inspected.basename, "script.R");
console.log("Open file result contract verified.");
