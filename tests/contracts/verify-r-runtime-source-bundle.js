"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { listMissingRuntimeSourceFiles, requiredRuntimeSourceFileNames } = require("../../shared/runtime/providers/r/session/runtimeLaunchPlan");
const verifySourceBundle = function (rootDir) {
    const sourceDir = path.join(rootDir, "shared", "runtime", "providers", "r", "r-sources");
    const missing = listMissingRuntimeSourceFiles(sourceDir);
    const forbiddenSharedRuntimePhrases = [
        "DialogR diagnostic",
        "DialogQCA diagnostic"
    ];
    assert.deepStrictEqual(missing, []);
    requiredRuntimeSourceFileNames.forEach((fileName) => {
        const filePath = path.join(sourceDir, fileName);
        const content = fs.readFileSync(filePath, "utf8");
        assert.ok(content.trim().length > 0, `${fileName} should not be empty`);
        forbiddenSharedRuntimePhrases.forEach((phrase) => {
            assert.ok(!content.includes(phrase), `${fileName} must not contain product-branded shared runtime diagnostic: ${phrase}`);
        });
    });
};
verifySourceBundle(path.resolve(__dirname, "../.."));
console.log("R runtime source bundle verified.");
