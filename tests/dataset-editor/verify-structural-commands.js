"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createColumnInsertFromSelection, createColumnRemoveConfirmationMessage, createColumnRemoveFromSelection, createColumnRenameFromInputs, createColumnRenameFromSelection, createSuggestedColumnName, createRowInsertFromSelection, createRowNameUpdateFromInputs, createRowNameUpdateFromSelection, createRowRemoveConfirmationMessage, createRowRemoveFromSelection, createRowSortFromSelection } = require("../../shared/dataset-editor/commands/structuralCommands");
const verifyColumnCommands = function () {
    const insert = createColumnInsertFromSelection({
        kind: "data-column",
        objectName: "sample_data",
        columnName: "condition"
    }, "new_condition", "after");
    const remove = createColumnRemoveFromSelection({
        kind: "data-cell",
        objectName: "sample_data",
        rowIndex: 0,
        columnName: "outcome"
    });
    const rename = createColumnRenameFromSelection({
        kind: "data-column",
        objectName: "sample_data",
        columnName: "old_condition"
    }, "condition");
    const manualRename = createColumnRenameFromInputs("sample_data", "old_condition", "condition");
    const variableRowInsert = createColumnInsertFromSelection({
        kind: "variable-row",
        objectName: "sample_data",
        rowIndex: 2,
        columnName: "condition"
    }, "new_condition", "before");
    const variableRowRemove = createColumnRemoveFromSelection({
        kind: "variable-row",
        objectName: "sample_data",
        rowIndex: 2,
        columnName: "condition"
    });
    assert.strictEqual(insert.status, "ready");
    assert.deepStrictEqual(insert.request, {
        objectName: "sample_data",
        referenceName: "condition",
        newName: "new_condition",
        position: "after",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
    assert.strictEqual(remove.status, "ready");
    assert.deepStrictEqual(remove.request, {
        objectName: "sample_data",
        columnName: "outcome",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
    assert.strictEqual(createColumnRemoveConfirmationMessage(remove.request), 'Remove column "outcome"?');
    assert.strictEqual(rename.status, "ready");
    assert.deepStrictEqual(rename.request, {
        objectName: "sample_data",
        fromName: "old_condition",
        toName: "condition",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
    assert.strictEqual(manualRename.status, "ready");
    assert.deepStrictEqual(manualRename.request, {
        objectName: "sample_data",
        fromName: "old_condition",
        toName: "condition",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
    assert.strictEqual(variableRowInsert.status, "ready");
    assert.deepStrictEqual(variableRowInsert.request, {
        objectName: "sample_data",
        referenceName: "condition",
        newName: "new_condition",
        position: "before",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
    assert.strictEqual(variableRowRemove.status, "ready");
    assert.deepStrictEqual(variableRowRemove.request, {
        objectName: "sample_data",
        columnName: "condition",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};
const verifySuggestedColumnNames = function () {
    assert.strictEqual(createSuggestedColumnName(["case", "condition", "outcome"], "condition", "before"), "column2");
    assert.strictEqual(createSuggestedColumnName(["case", "condition", "outcome"], "condition", "after"), "column3");
    assert.strictEqual(createSuggestedColumnName(["column1", "column2"], "column1", "before"), "column1_2");
};
const verifyRowCommands = function () {
    const insert = createRowInsertFromSelection({
        kind: "data-row",
        objectName: "sample_data",
        rowIndex: 2
    }, "before");
    const remove = createRowRemoveFromSelection({
        kind: "data-cell",
        objectName: "sample_data",
        rowIndex: 1,
        columnName: "condition"
    });
    const rename = createRowNameUpdateFromSelection({
        kind: "data-row",
        objectName: "sample_data",
        rowIndex: 3
    }, "case-3");
    const manualRename = createRowNameUpdateFromInputs("sample_data", 4, "case-4");
    const sort = createRowSortFromSelection({
        kind: "data-column",
        objectName: "sample_data",
        columnName: "condition"
    }, "descending");
    assert.strictEqual(insert.status, "ready");
    assert.deepStrictEqual(insert.request, {
        objectName: "sample_data",
        rowIndex: 2,
        name: "",
        position: "before",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
    assert.strictEqual(remove.status, "ready");
    assert.deepStrictEqual(remove.request, {
        objectName: "sample_data",
        rowIndex: 1,
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
    assert.strictEqual(createRowRemoveConfirmationMessage(remove.request), 'Delete row "2"?');
    assert.strictEqual(rename.status, "ready");
    assert.deepStrictEqual(rename.request, {
        objectName: "sample_data",
        rowIndex: 3,
        name: "case-3",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
    assert.strictEqual(manualRename.status, "ready");
    assert.deepStrictEqual(manualRename.request, {
        objectName: "sample_data",
        rowIndex: 4,
        name: "case-4",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
    assert.strictEqual(sort.status, "ready");
    assert.deepStrictEqual(sort.request, {
        objectName: "sample_data",
        columnName: "condition",
        direction: "descending",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};
const verifyUnavailableSelections = function () {
    const column = createColumnInsertFromSelection({
        kind: "variable-cell",
        objectName: "sample_data",
        rowIndex: 0,
        metadataKey: "label"
    }, "new_condition", "after");
    const row = createRowRemoveFromSelection({
        kind: "data-column",
        objectName: "sample_data",
        columnName: "condition"
    });
    const rename = createColumnRenameFromSelection({
        kind: "data-column",
        objectName: "sample_data",
        columnName: "condition"
    }, "");
    const sort = createRowSortFromSelection({
        kind: "data-row",
        objectName: "sample_data",
        rowIndex: 0
    }, "ascending");
    const rowName = createRowNameUpdateFromSelection({
        kind: "data-row",
        objectName: "sample_data",
        rowIndex: 0
    }, "");
    assert.strictEqual(column.status, "unavailable");
    assert.strictEqual(column.request, null);
    assert.strictEqual(row.status, "unavailable");
    assert.strictEqual(row.request, null);
    assert.strictEqual(rename.status, "unavailable");
    assert.strictEqual(rename.request, null);
    assert.strictEqual(sort.status, "unavailable");
    assert.strictEqual(sort.request, null);
    assert.strictEqual(rowName.status, "unavailable");
    assert.strictEqual(rowName.request, null);
};
verifyColumnCommands();
verifySuggestedColumnNames();
verifyRowCommands();
verifyUnavailableSelections();
console.log("Dataset editor structural command contract verified.");
