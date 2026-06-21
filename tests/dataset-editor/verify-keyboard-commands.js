"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { getDatasetEditorKeyboardCommand } = require("../../shared/dataset-editor/commands/keyboardCommands");
const keyboardInput = function (overrides) {
    return Object.assign({
        key: "",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        targetTagName: "body",
        targetId: "",
        targetIsContentEditable: false
    }, overrides);
};
const verifyCopyShortcut = function () {
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "c", metaKey: true })), "dataset.copy");
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "C", ctrlKey: true })), "dataset.copy");
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "c", metaKey: true, selectionKind: "data-column" })), "dataset.copy");
};
const verifyPasteShortcut = function () {
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "v", metaKey: true })), "dataset.pasteFromClipboard");
};
const verifyTabToggleShortcut = function () {
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "t", metaKey: true })), "dataset.toggleTab");
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "T", ctrlKey: true })), "dataset.toggleTab");
};
const verifyEditableTargetsKeepNativeBehavior = function () {
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "c", metaKey: true, targetTagName: "input" })), "");
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "v", metaKey: true, targetIsContentEditable: true })), "");
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "t", metaKey: true, targetTagName: "textarea" })), "");
};
const verifyEditShortcuts = function () {
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "Enter" })), "dataset.beginEdit");
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "Escape" })), "dataset.cancelEdit");
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "Enter", targetTagName: "input", targetId: "cellValue" })), "dataset.commitEdit");
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "Escape", targetTagName: "input", targetId: "variableMetadataValue" })), "dataset.cancelEdit");
};
const verifyAltModifiedShortcutsAreIgnored = function () {
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "c", metaKey: true, altKey: true })), "");
};
const verifyShiftModifiedShortcutsAreIgnored = function () {
    assert.strictEqual(getDatasetEditorKeyboardCommand(keyboardInput({ key: "c", metaKey: true, shiftKey: true })), "");
};
verifyCopyShortcut();
verifyPasteShortcut();
verifyTabToggleShortcut();
verifyEditableTargetsKeepNativeBehavior();
verifyEditShortcuts();
verifyAltModifiedShortcutsAreIgnored();
verifyShiftModifiedShortcutsAreIgnored();
console.log("Dataset editor keyboard command contract verified.");
