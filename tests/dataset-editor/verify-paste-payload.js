"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { parseClipboardText } = require("../../shared/dataset-editor/clipboard/pastePayload");
const verifyEmptyText = function () {
    const payload = parseClipboardText("");
    assert.strictEqual(payload.status, "empty");
    assert.strictEqual(payload.width, 0);
    assert.strictEqual(payload.height, 0);
};
const verifyTabDelimitedText = function () {
    const payload = parseClipboardText("A\t1\nB\t0\n");
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.width, 2);
    assert.strictEqual(payload.height, 2);
    assert.deepStrictEqual(payload.rows[0], ["A", "1"]);
};
const verifyRaggedText = function () {
    const payload = parseClipboardText("A\t1\tYes\nB");
    assert.strictEqual(payload.width, 3);
    assert.strictEqual(payload.height, 2);
    assert.deepStrictEqual(payload.rows[1], ["B"]);
};
verifyEmptyText();
verifyTabDelimitedText();
verifyRaggedText();
console.log("Dataset editor paste payload contract verified.");
