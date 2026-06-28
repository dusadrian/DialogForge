"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readDialogSourceElements } = require("../../shared/dialog-runtime/dialogSource");
const { createProductDialogSourceReader } = require("../../shared/dialog-runtime/dialog-builder/productDialogSourceReader");
const {
    validateDialogRegistry,
    validateDialogSourceFile,
    validateI18nDirectory,
    validateLocaleFile
} = require("../../shared/base-app/bootstrap/productAssetValidation");
const rootDir = path.resolve(__dirname, "../..");
const readJson = function (filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
};
const registryPath = path.join(rootDir, "shared/base-app/dialogs/dialogs.json");
validateDialogRegistry(registryPath, path.join(rootDir, "shared/base-app/dialogs"));
validateI18nDirectory(path.join(rootDir, "shared/base-app/i18n"));
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
const stagedActionFile = path.join(
    rootDir,
    "dist/shared/base-app/dialogs",
    path.dirname(dialog.sourceFile),
    "actions.js"
);
const sourceElements = readDialogSourceElements(rootDir, dialog);
validateDialogSourceFile(path.join(rootDir, "shared/base-app/dialogs", dialog.sourceFile));
assert.ok(sourceDialog.properties);
assert.ok(fs.existsSync(sourceActionFile));
assert.ok(fs.readFileSync(sourceActionFile, "utf8").includes("const filePath"));
assert.ok(sourceDialog.elements);
assert.strictEqual(sourceElements.status, "ready");
assert.strictEqual(sourceElements.controls.length, sourceDialog.elements.length);
if (fs.existsSync(path.join(rootDir, "dist"))) {
    assert.ok(
        fs.existsSync(stagedActionFile),
        "build output must stage shared dialog actions.js files"
    );
}
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
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-assets-"));
const invalidDialogPath = path.join(fixtureDir, "invalid-dialog.json");
fs.writeFileSync(
    invalidDialogPath,
    JSON.stringify({
        properties: {
            name: "bad"
        },
        elements: [
            {
                type: "Input"
            }
        ]
    }, null, 4)
);
assert.throws(
    () => {
        validateDialogSourceFile(invalidDialogPath);
    },
    /\$\.properties must define title/
);
const invalidLocalePath = path.join(fixtureDir, "invalid-locale.json");
fs.writeFileSync(
    invalidLocalePath,
    JSON.stringify({
        ok: "value",
        bad: 42
    }, null, 4)
);
assert.throws(
    () => {
        validateLocaleFile(invalidLocalePath);
    },
    /key "bad" must contain a string value/
);
console.log("Shared dialog source registry verified.");
