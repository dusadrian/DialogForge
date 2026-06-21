"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createSelectionDiagnosticFields, createActionDiagnostics } = require("../../shared/dataset-editor/view/selectionDiagnostics");
const verifySelectionDiagnosticFields = function () {
    const fields = createSelectionDiagnosticFields({
        selection: {
            kind: "metadata-range",
            objectName: "sample_data",
            metadataKey: "label",
            anchorRowIndex: 1,
            focusRowIndex: 3
        },
        editing: {
            active: false,
            value: ""
        }
    });
    assert.deepStrictEqual(fields, [
        { name: "selection", value: "metadata-range" },
        { name: "object", value: "sample_data" },
        { name: "metadata", value: "label" },
        { name: "range", value: "1...3" },
        { name: "editing", value: "inactive" }
    ]);
};
const verifyActionDiagnostics = function () {
    assert.deepStrictEqual(createActionDiagnostics([
        { id: "copy", label: "Copy", command: "dataset.copy" }
    ]), [
        { label: "Copy", command: "dataset.copy" }
    ]);
};
verifySelectionDiagnosticFields();
verifyActionDiagnostics();
console.log("Dataset editor selection diagnostic contract verified.");
