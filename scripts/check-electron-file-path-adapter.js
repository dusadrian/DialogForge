"use strict";

const assert = require("node:assert/strict");
const {
    createDialogForgeHostBridge
} = require("../dist/src/shell-electron/bootstrap/dialogForgeHostBridge");

const ipc = { invoke() {}, send() {}, on() {}, once() {} };
const clipboard = { writeText() {}, readText() { return ""; } };
const file = { path: "/legacy/script.R" };
const modern = createDialogForgeHostBridge(ipc, {
    clipboard,
    webUtils: {
        getPathForFile(received) {
            assert.equal(received, file);
            return "/selected/script.R";
        }
    }
});

assert.equal(modern.readDroppedFilePath(file), "/selected/script.R");
assert.deepEqual(modern.getDroppedFilePaths([file]), ["/selected/script.R"]);

const synthetic = createDialogForgeHostBridge(ipc, {
    clipboard,
    webUtils: { getPathForFile() { return ""; } }
});
assert.equal(synthetic.readDroppedFilePath(file), "");

const rejected = createDialogForgeHostBridge(ipc, {
    clipboard,
    webUtils: { getPathForFile() { throw new Error("Not a File"); } }
});
assert.equal(rejected.readDroppedFilePath(file), "");

const legacy = createDialogForgeHostBridge(ipc, { clipboard });
assert.equal(legacy.readDroppedFilePath(file), "/legacy/script.R");
assert.equal(legacy.readDroppedFilePath({}), "");
console.log("Electron dropped-file paths use the injected modern API and bounded legacy fallback.");
