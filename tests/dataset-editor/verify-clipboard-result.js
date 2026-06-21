"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { readClipboardText, writeCopyPayloadText } = require("../../shared/shell-electron/clipboard/clipboardResult");
const verifyReadyPayload = function () {
    let text = "";
    const result = writeCopyPayloadText({
        writeText: function (value) {
            text = value;
        }
    }, {
        status: "ready",
        kind: "data-row",
        text: "A\t1",
        cells: [],
        message: "ready"
    });
    assert.strictEqual(text, "A\t1");
    assert.strictEqual(result.status, "copied");
    assert.strictEqual(result.textLength, 3);
};
const verifyEmptyPayload = function () {
    let called = false;
    const result = writeCopyPayloadText({
        writeText: function () {
            called = true;
        }
    }, {
        status: "empty",
        kind: "none",
        text: "",
        cells: [],
        message: "empty"
    });
    assert.strictEqual(called, false);
    assert.strictEqual(result.status, "empty");
};
const verifyReadClipboardText = function () {
    const result = readClipboardText({
        readText: function () {
            return "A\t1";
        }
    });
    assert.strictEqual(result.status, "ready");
    assert.strictEqual(result.textLength, 3);
};
verifyReadyPayload();
verifyEmptyPayload();
verifyReadClipboardText();
console.log("Clipboard result contract verified.");
