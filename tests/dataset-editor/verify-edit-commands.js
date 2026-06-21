"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createEditStartFromSelection, createEditCommitFromSelection, createCellEditFromInputs } = require("../../shared/dataset-editor/commands/editCommands");
const verifyEditStart = function () {
    const command = createEditStartFromSelection({
        kind: "data-cell",
        objectName: "sample_data",
        rowIndex: 1,
        columnName: "condition"
    }, "0");
    assert.strictEqual(command.status, "ready");
    assert.strictEqual(command.value, "0");
};
const verifyDataCellEdit = function () {
    const command = createEditCommitFromSelection({
        kind: "data-cell",
        objectName: "sample_data",
        rowIndex: 1,
        columnName: "condition"
    }, "", "1");
    assert.strictEqual(command.status, "ready");
    assert.strictEqual(command.kind, "data-cell");
    assert.deepStrictEqual(command.cellRequest, {
        objectName: "sample_data",
        rowIndex: 1,
        columnName: "condition",
        value: "1",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
    assert.strictEqual(command.metadataRequest, null);
};
const verifyDataCellEditFromInputs = function () {
    const command = createCellEditFromInputs("sample_data", 2, "condition", "0");
    assert.strictEqual(command.status, "ready");
    assert.strictEqual(command.kind, "data-cell");
    assert.deepStrictEqual(command.cellRequest, {
        objectName: "sample_data",
        rowIndex: 2,
        columnName: "condition",
        value: "0",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};
const verifyVariableMetadataEdit = function () {
    const command = createEditCommitFromSelection({
        kind: "variable-cell",
        objectName: "sample_data",
        rowIndex: 1,
        metadataKey: "label"
    }, "condition", "Condition label");
    assert.strictEqual(command.status, "ready");
    assert.strictEqual(command.kind, "variable-cell");
    assert.strictEqual(command.cellRequest, null);
    assert.deepStrictEqual(command.metadataRequest, {
        objectName: "sample_data",
        variableName: "condition",
        metadataKey: "label",
        value: "Condition label",
        label: "Condition label",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};
const verifyUnavailableSelection = function () {
    const command = createEditCommitFromSelection({
        kind: "data-row",
        objectName: "sample_data",
        rowIndex: 1
    }, "", "ignored");
    assert.strictEqual(command.status, "unavailable");
    assert.strictEqual(command.cellRequest, null);
    assert.strictEqual(command.metadataRequest, null);
};
verifyDataCellEdit();
verifyDataCellEditFromInputs();
verifyVariableMetadataEdit();
verifyUnavailableSelection();
verifyEditStart();
console.log("Dataset editor edit command contract verified.");
