"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createDeclaredMissingUpdateFromSelection, createDeclaredMissingUpdateFromInputs, createValueLabelUpdateFromInputs, createValueLabelUpdateFromSelection, createVariableMetadataUpdateFromInputs, createVariableMetadataUpdateFromSelection } = require("../../shared/dataset-editor/commands/metadataCommands");
const verifyMetadataUpdateCommand = function () {
    const command = createVariableMetadataUpdateFromSelection({
        kind: "variable-cell",
        objectName: "sample_data",
        rowIndex: 1,
        metadataKey: "label"
    }, "condition", "Updated label");
    assert.strictEqual(command.status, "ready");
    assert.deepStrictEqual(command.request, {
        objectName: "sample_data",
        variableName: "condition",
        metadataKey: "label",
        value: "Updated label",
        label: "Updated label",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};
const verifyUnavailableSelection = function () {
    const command = createVariableMetadataUpdateFromSelection({
        kind: "data-cell",
        objectName: "sample_data",
        rowIndex: 0,
        columnName: "condition"
    }, "condition", "Updated label");
    assert.strictEqual(command.status, "unavailable");
    assert.strictEqual(command.request, null);
};
const verifyMetadataUpdateFromInputs = function () {
    const command = createVariableMetadataUpdateFromInputs("sample_data", "condition", "measure", "scale");
    assert.strictEqual(command.status, "ready");
    assert.deepStrictEqual(command.request, {
        objectName: "sample_data",
        variableName: "condition",
        metadataKey: "measure",
        value: "scale",
        label: "",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};
const verifyValueLabelCommand = function () {
    const command = createValueLabelUpdateFromSelection({
        kind: "variable-cell",
        objectName: "sample_data",
        rowIndex: 1,
        metadataKey: "values"
    }, "condition", "0", "Absent");
    assert.strictEqual(command.status, "ready");
    assert.deepStrictEqual(command.request, {
        objectName: "sample_data",
        variableName: "condition",
        labels: [
            {
                value: "0",
                label: "Absent"
            }
        ],
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};
const verifyValueLabelFromInputs = function () {
    const command = createValueLabelUpdateFromInputs("sample_data", "condition", "1", "Present");
    assert.strictEqual(command.status, "ready");
    assert.deepStrictEqual(command.request, {
        objectName: "sample_data",
        variableName: "condition",
        labels: [
            {
                value: "1",
                label: "Present"
            }
        ],
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};
const verifyDeclaredMissingCommand = function () {
    const command = createDeclaredMissingUpdateFromSelection({
        kind: "variable-cell",
        objectName: "sample_data",
        rowIndex: 1,
        metadataKey: "values"
    }, "condition", "-9", "Not asked");
    assert.strictEqual(command.status, "ready");
    assert.deepStrictEqual(command.request, {
        objectName: "sample_data",
        variableName: "condition",
        values: [
            {
                value: "-9",
                label: "Not asked"
            }
        ],
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};
const verifyDeclaredMissingFromInputs = function () {
    const command = createDeclaredMissingUpdateFromInputs("sample_data", "condition", "-8", "Unknown");
    assert.strictEqual(command.status, "ready");
    assert.deepStrictEqual(command.request, {
        objectName: "sample_data",
        variableName: "condition",
        values: [
            {
                value: "-8",
                label: "Unknown"
            }
        ],
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};
verifyMetadataUpdateCommand();
verifyMetadataUpdateFromInputs();
verifyUnavailableSelection();
verifyValueLabelCommand();
verifyValueLabelFromInputs();
verifyDeclaredMissingCommand();
verifyDeclaredMissingFromInputs();
console.log("Dataset editor metadata command contract verified.");
