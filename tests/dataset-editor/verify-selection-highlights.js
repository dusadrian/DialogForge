"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { isDataPreviewCellSelected, isDataPreviewRowSelected, isDataPreviewColumnSelected, isVariableMetadataCellSelected, isVariableMetadataRowSelected } = require("../../shared/dataset-editor/view/selectionHighlights");
const verifyDataSelectionHighlights = function () {
    assert.strictEqual(isDataPreviewCellSelected({ kind: "data-cell", rowIndex: 1, columnName: "condition" }, 1, "condition"), true);
    assert.strictEqual(isDataPreviewRowSelected({ kind: "data-row", rowIndex: 2 }, 2), true);
    assert.strictEqual(isDataPreviewColumnSelected({ kind: "data-column", columnName: "outcome" }, "outcome"), true);
};
const verifyVariableSelectionHighlights = function () {
    assert.strictEqual(isVariableMetadataCellSelected({ kind: "variable-cell", rowIndex: 1, metadataKey: "label" }, 1, "label"), true);
    assert.strictEqual(isVariableMetadataCellSelected({
        kind: "metadata-range",
        metadataKey: "measure",
        anchorRowIndex: 4,
        focusRowIndex: 2
    }, 3, "measure"), true);
    assert.strictEqual(isVariableMetadataCellSelected({
        kind: "metadata-range",
        metadataKey: "measure",
        anchorRowIndex: 4,
        focusRowIndex: 2
    }, 3, "label"), false);
    assert.strictEqual(isVariableMetadataRowSelected({ kind: "variable-row", rowIndex: 2 }, 2), true);
};
verifyDataSelectionHighlights();
verifyVariableSelectionHighlights();
console.log("Dataset editor selection highlight contract verified.");
