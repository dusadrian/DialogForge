"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { getDatasetEditorContextActions, selectionContainsVariableMetadataCell } = require("../../shared/dataset-editor/context-menus/contextMenuActions");
const actionIds = function (selection) {
    return getDatasetEditorContextActions(selection).map((action) => {
        return action.id;
    });
};
const actionCommands = function (selection) {
    return getDatasetEditorContextActions(selection).map((action) => {
        return action.command;
    });
};
const verifyDataColumnActions = function () {
    const selection = {
        kind: "data-column",
        objectName: "sample_data",
        columnName: "condition"
    };
    assert.deepStrictEqual(actionIds(selection), [
        "data-column.copy",
        "data-column.copy-values-and-labels",
        "data-column.paste",
        "data-column.insert-before",
        "data-column.insert-after",
        "data-column.sort-ascending",
        "data-column.sort-descending",
        "data-column.rename",
        "data-column.remove"
    ]);
    assert.deepStrictEqual(actionCommands(selection), [
        "dataset.copyValues",
        "dataset.copy",
        "dataset.pasteFromClipboard",
        "dataset.insertColumn.before",
        "dataset.insertColumn.after",
        "dataset.sortRows.ascending",
        "dataset.sortRows.descending",
        "dataset.renameColumn",
        "dataset.removeColumn"
    ]);
};
const verifyVariableValuesActions = function () {
    assert.deepStrictEqual(actionIds({
        kind: "variable-cell",
        objectName: "sample_data",
        rowIndex: 1,
        metadataKey: "values"
    }), [
        "variable-cell.edit",
        "variable-cell.copy",
        "variable-cell.paste",
        "variable-cell.update",
        "variable-cell.value-labels",
        "variable-cell.declared-missing"
    ]);
};
const verifyDataCellActions = function () {
    assert.deepStrictEqual(actionIds({
        kind: "data-cell",
        objectName: "sample_data",
        rowIndex: 1,
        columnName: "condition"
    }), [
        "data-cell.edit",
        "data-cell.copy",
        "data-cell.paste",
        "data-row.insert-after",
        "data-row.remove",
        "data-column.insert-after",
        "data-column.remove"
    ]);
};
const verifyDataRowActions = function () {
    assert.deepStrictEqual(actionIds({
        kind: "data-row",
        objectName: "sample_data",
        rowIndex: 1
    }), [
        "data-row.copy",
        "data-row.paste",
        "data-row.rename",
        "data-row.insert-before",
        "data-row.insert-after",
        "data-row.remove"
    ]);
    assert.deepStrictEqual(actionCommands({
        kind: "data-row",
        objectName: "sample_data",
        rowIndex: 1
    }), [
        "dataset.copy",
        "dataset.pasteFromClipboard",
        "dataset.renameRow",
        "dataset.insertRow.before",
        "dataset.insertRow.after",
        "dataset.removeRow"
    ]);
};
const verifyMetadataRangeActions = function () {
    assert.deepStrictEqual(actionIds({
        kind: "metadata-range",
        objectName: "sample_data",
        metadataKey: "label",
        anchorRowIndex: 1,
        focusRowIndex: 2
    }), [
        "metadata-range.paste"
    ]);
};
const verifyVariableRowActions = function () {
    assert.deepStrictEqual(actionIds({
        kind: "variable-row",
        objectName: "sample_data",
        rowIndex: 1,
        columnName: "condition"
    }), [
        "variable-row.copy",
        "variable-row.insert-before",
        "variable-row.insert-after",
        "variable-row.remove"
    ]);
    assert.deepStrictEqual(actionCommands({
        kind: "variable-row",
        objectName: "sample_data",
        rowIndex: 1,
        columnName: "condition"
    }), [
        "dataset.copy",
        "dataset.insertColumn.before",
        "dataset.insertColumn.after",
        "dataset.removeColumn"
    ]);
};
const verifyMetadataRangeContainment = function () {
    const selection = {
        kind: "metadata-range",
        objectName: "sample_data",
        metadataKey: "label",
        anchorRowIndex: 5,
        focusRowIndex: 2
    };
    assert.strictEqual(selectionContainsVariableMetadataCell(selection, 2, "label"), true);
    assert.strictEqual(selectionContainsVariableMetadataCell(selection, 4, "label"), true);
    assert.strictEqual(selectionContainsVariableMetadataCell(selection, 6, "label"), false);
    assert.strictEqual(selectionContainsVariableMetadataCell(selection, 4, "values"), false);
    assert.strictEqual(selectionContainsVariableMetadataCell({ kind: "variable-cell", rowIndex: 4, metadataKey: "label" }, 4, "label"), false);
};
verifyDataColumnActions();
verifyDataCellActions();
verifyDataRowActions();
verifyVariableValuesActions();
verifyMetadataRangeActions();
verifyVariableRowActions();
verifyMetadataRangeContainment();
console.log("Dataset editor context menu action contract verified.");
