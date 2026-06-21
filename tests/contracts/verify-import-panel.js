"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { renderImportPreview } = require("../../shared/base-app/features/import-panel/importPanel").importPanelApi;
const fields = [];
const host = {};
const helpers = {
    appendField: function (_host, label, value) {
        fields.push({ label, value });
    },
    empty: function () {
        fields.length = 0;
    }
};
renderImportPreview(host, {
    status: "ready",
    error: "",
    colnames: ["case", "value"],
    vdata: [
        ["A", "B"],
        ["1", "2"]
    ]
}, helpers);
assert.deepStrictEqual(fields, [
    { label: "preview", value: "ready" },
    { label: "columns", value: 2 },
    { label: "rows", value: 2 },
    { label: "error", value: "" },
    { label: "case", value: "A, B" },
    { label: "value", value: "1, 2" }
]);
renderImportPreview(host, {
    status: "failed",
    error: "Runtime parser rejected the file.",
    colnames: [],
    vdata: []
}, helpers);
assert.deepStrictEqual(fields, [
    { label: "preview", value: "failed" },
    { label: "columns", value: 0 },
    { label: "rows", value: 0 },
    { label: "error", value: "Runtime parser rejected the file." }
]);
console.log("Import panel helpers verified.");
