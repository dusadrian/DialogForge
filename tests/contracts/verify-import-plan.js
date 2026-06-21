"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createImportPlanRequest, createImportPlanResult } = require("../../shared/runtime/tabular-data/importProtocol");
const request = createImportPlanRequest({
    source: "/tmp/my data.csv"
});
assert.deepStrictEqual(request, {
    source: "/tmp/my data.csv",
    targetName: ""
});
const result = createImportPlanResult({
    status: "ready",
    source: "/tmp/my data.csv",
    exists: true,
    sizeBytes: 12
});
assert.strictEqual(result.status, "ready");
assert.strictEqual(result.format, "csv");
assert.strictEqual(result.targetName, "my_data");
assert.strictEqual(result.exists, true);
assert.strictEqual(result.sizeBytes, 12);
console.log("Import planning contract verified.");
