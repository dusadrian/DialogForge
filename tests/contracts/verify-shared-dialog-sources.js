"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { readDialogSourceElements } = require("../../shared/dialog-runtime/dialogSource");
const { createProductDialogSourceReader } = require("../../shared/dialog-runtime/dialog-builder/productDialogSourceReader");
const rootDir = path.resolve(__dirname, "../..");
const readJson = function (filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
};
const registryPath = path.join(rootDir, "shared/base-app/dialogs/dialogs.json");
const registry = readJson(registryPath);
const dialog = registry.find((candidate) => {
    return candidate.id === "import";
});
assert.ok(dialog);
assert.strictEqual(dialog.owner, "shared/base-app");
assert.strictEqual(dialog.status, "source-imported");
assert.ok(dialog.sourceFile);
const sourceDialog = readJson(path.join(rootDir, "shared/base-app/dialogs", dialog.sourceFile));
const sourceActionFile = path.join(
    rootDir,
    "shared/base-app/dialogs",
    path.dirname(dialog.sourceFile),
    "actions.js"
);
const sourceElements = readDialogSourceElements(rootDir, dialog);
assert.ok(sourceDialog.properties);
assert.ok(fs.existsSync(sourceActionFile));
assert.ok(fs.readFileSync(sourceActionFile, "utf8").includes("const filePath"));
assert.ok(sourceDialog.elements);
assert.strictEqual(sourceElements.status, "ready");
assert.strictEqual(sourceElements.controls.length, sourceDialog.elements.length);
const readRuntimeDialog = createProductDialogSourceReader({
    rootDir,
    productId: "base",
    findDefinition: function(dialogId) {
        return dialogId === dialog.id ? dialog : null;
    },
    getLocale: function() {
        return "en_US";
    }
});
const runtimeDialog = readRuntimeDialog(dialog.id);
assert.ok(
    runtimeDialog.customJS.includes("const filePath"),
    "runtime dialog loading must include the adjacent actions.js entry"
);
console.log("Shared dialog source registry verified.");
