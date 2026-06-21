"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createPasteCellUpdates, createVariableMetadataPasteUpdates } = require("../../shared/dataset-editor/clipboard/pasteMapping");
const { parseClipboardText } = require("../../shared/dataset-editor/clipboard/pastePayload");
const preview = {
    status: "ready",
    providerId: "test",
    objectName: "sample_data",
    columns: [
        { name: "case", type: "character", role: "id" },
        { name: "condition", type: "numeric", role: "data" },
        { name: "outcome", type: "numeric", role: "data" }
    ],
    rows: [
        { case: "A", condition: 1, outcome: 1 },
        { case: "B", condition: 0, outcome: 0 }
    ],
    message: "ready",
    readAt: "test"
};
const metadata = {
    status: "ready",
    providerId: "test",
    objectName: "sample_data",
    variables: [
        { name: "case", type: "character", role: "id", label: "Case label" },
        { name: "condition", type: "numeric", role: "data", label: "Condition label" },
        { name: "outcome", type: "numeric", role: "data", label: "Outcome label" }
    ],
    message: "ready",
    refreshedAt: "test"
};
const verifyCellPasteMapping = function () {
    const updates = createPasteCellUpdates(preview, {
        kind: "data-cell",
        rowIndex: 0,
        columnName: "condition"
    }, parseClipboardText("0\t1"));
    assert.deepStrictEqual(updates, [
        {
            objectName: "sample_data",
            rowIndex: 0,
            columnName: "condition",
            value: "0",
            uiCommandVisibility: "hidden",
            visibleCommandText: ""
        },
        {
            objectName: "sample_data",
            rowIndex: 0,
            columnName: "outcome",
            value: "1",
            uiCommandVisibility: "hidden",
            visibleCommandText: ""
        }
    ]);
};
const verifyBoundsAreClipped = function () {
    const updates = createPasteCellUpdates(preview, {
        kind: "data-cell",
        rowIndex: 1,
        columnName: "outcome"
    }, parseClipboardText("1\t2\n3\t4"));
    assert.deepStrictEqual(updates, [
        {
            objectName: "sample_data",
            rowIndex: 1,
            columnName: "outcome",
            value: "1",
            uiCommandVisibility: "hidden",
            visibleCommandText: ""
        }
    ]);
};
const verifyVariableCellPasteMapping = function () {
    const updates = createVariableMetadataPasteUpdates(metadata, {
        kind: "variable-cell",
        objectName: "sample_data",
        rowIndex: 1,
        metadataKey: "label"
    }, parseClipboardText("Updated condition"));
    assert.deepStrictEqual(updates, [
        {
            objectName: "sample_data",
            rowIndex: 1,
            variableName: "condition",
            metadataKey: "label",
            value: "Updated condition"
        }
    ]);
};
const verifyMetadataRangePasteMapping = function () {
    const updates = createVariableMetadataPasteUpdates(metadata, {
        kind: "metadata-range",
        objectName: "sample_data",
        metadataKey: "measure",
        anchorRowIndex: 1,
        focusRowIndex: 2
    }, parseClipboardText("nominal\nscale\nignored"));
    assert.deepStrictEqual(updates, [
        {
            objectName: "sample_data",
            rowIndex: 1,
            variableName: "condition",
            metadataKey: "measure",
            value: "nominal"
        },
        {
            objectName: "sample_data",
            rowIndex: 2,
            variableName: "outcome",
            metadataKey: "measure",
            value: "scale"
        }
    ]);
};
verifyCellPasteMapping();
verifyBoundsAreClipped();
verifyVariableCellPasteMapping();
verifyMetadataRangePasteMapping();
console.log("Dataset editor paste mapping contract verified.");
