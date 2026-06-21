"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createDialogControlModelFromSources, getDialogControl } = require("../../shared/dialog-runtime/custom-js/dialogControlModel");
const { createDialogRuntimeHarness } = require("../../shared/dialog-runtime/custom-js/dialogRuntimeHarness");
const { createDialogScriptRunner, listDialogScriptControlReferences } = require("../../shared/dialog-runtime/custom-js/dialogScriptRunner");
const { createImportPreviewRequest, readDelimitedImportPreview } = require("../../shared/runtime/tabular-data/importPreview");
const rootDir = path.resolve(__dirname, "../..");
const readDialogControls = function (source) {
    return (source.elements || []).map((element, index) => {
        return {
            name: element.nameid || element.name || element.id || "control_" + index,
            value: element.value || ""
        };
    });
};
const createDocumentStub = function () {
    const createElement = function () {
        return {
            style: {},
            dataset: {},
            isConnected: false,
            innerHTML: "",
            textContent: "",
            appendChild(child) {
                child.isConnected = true;
            }
        };
    };
    const body = createElement();
    return {
        body,
        createElement
    };
};
const verifySharedImportDialog = async function () {
    const source = JSON.parse(fs.readFileSync(path.join(rootDir, "shared/base-app/dialogs/source/import/dialog.json"), "utf8"));
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-source-import-"));
    const importPath = path.join(directory, "survey.csv");
    const dtaPath = path.join(directory, "survey.dta");
    const importCommands = [];
    const previewPayloads = [];
    fs.writeFileSync(importPath, "case,value\nA,1\nB,2\n", "utf8");
    fs.writeFileSync(dtaPath, "binary fixture placeholder", "utf8");
    const model = createDialogControlModelFromSources(readDialogControls(source));
    const runner = createDialogScriptRunner({
        model,
        document: createDocumentStub(),
        harness: createDialogRuntimeHarness({
            externalCallHost: {
                call: async function () {
                    return {
                        status: "ready",
                        value: null
                    };
                }
            }
        }),
        controlNames: listDialogScriptControlReferences(source.customJS),
        openImportFile: async function () {
            return { ok: true, filePath: importPath };
        },
        getImportPreview: async function (payload) {
            previewPayloads.push(payload);
            return readDelimitedImportPreview(createImportPreviewRequest(payload || {}));
        },
        runCommand: async function (command, dependencies) {
            importCommands.push({
                command: String(command || ""),
                dependencies: Array.isArray(dependencies)
                    ? dependencies.map(String)
                    : []
            });
            return { ok: true };
        }
    });
    const setup = await runner.run(source.customJS);
    assert.strictEqual(setup.status, "ready");
    assert.strictEqual(getDialogControl(model, "preview").value, null, "the current DialogR import dialog renders an empty preview surface before file selection");
    const browse = await runner.trigger("click", "browse");
    assert.strictEqual(browse.status, "ready", browse.error);
    assert.strictEqual(getDialogControl(model, "input1").value, importPath);
    assert.strictEqual(getDialogControl(model, "input2").value, "survey");
    assert.strictEqual(previewPayloads.at(-1).command, "read.csv");
    assert.strictEqual(previewPayloads.at(-1).binary, false);
    const imported = await runner.trigger("click", "b_import");
    assert.strictEqual(imported.status, "ready");
    assert.deepStrictEqual(importCommands, [
        {
            command: [
                "survey <- read.csv(",
                `    ${JSON.stringify(importPath)},`,
                "    header = FALSE",
                ")"
            ].join("\n"),
            dependencies: []
        }
    ]);
    const binaryImportCommands = [];
    const binaryPreviewPayloads = [];
    const binaryModel = createDialogControlModelFromSources(readDialogControls(source));
    const binaryRunner = createDialogScriptRunner({
        model: binaryModel,
        document: createDocumentStub(),
        harness: createDialogRuntimeHarness({
            externalCallHost: {
                call: async function () {
                    return {
                        status: "ready",
                        value: null
                    };
                }
            }
        }),
        controlNames: listDialogScriptControlReferences(source.customJS),
        openImportFile: async function () {
            return { ok: true, filePath: dtaPath };
        },
        getImportPreview: async function (payload) {
            binaryPreviewPayloads.push(payload);
            return {
                colnames: ["case", "value"],
                vdata: [
                    ["I", "J"],
                    ["9", "10"]
                ]
            };
        },
        runCommand: async function (command, dependencies) {
            binaryImportCommands.push({
                command: String(command || ""),
                dependencies: Array.isArray(dependencies)
                    ? dependencies.map(String)
                    : []
            });
            return { ok: true };
        }
    });
    const binarySetup = await binaryRunner.run(source.customJS);
    assert.strictEqual(binarySetup.status, "ready");
    const binaryBrowse = await binaryRunner.trigger("click", "browse");
    assert.strictEqual(binaryBrowse.status, "ready", binaryBrowse.error);
    assert.strictEqual(getDialogControl(binaryModel, "input1").value, dtaPath);
    assert.strictEqual(getDialogControl(binaryModel, "input2").value, "survey");
    assert.strictEqual(getDialogControl(binaryModel, "radio8").checked, true, "binary import detection must select the structured-data radio");
    assert.strictEqual(binaryPreviewPayloads.at(-1).command, "read.csv");
    assert.strictEqual(binaryPreviewPayloads.at(-1).binary, true);
    const binaryImported = await binaryRunner.trigger("click", "b_import");
    assert.strictEqual(binaryImported.status, "ready");
    assert.deepStrictEqual(binaryImportCommands, [
        {
            command: `survey <- convert(${JSON.stringify(dtaPath)})`,
            dependencies: ["DDIwR"]
        }
    ]);
};
verifySharedImportDialog()
    .then(() => {
    console.log("Shared import source dialog verified.");
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
