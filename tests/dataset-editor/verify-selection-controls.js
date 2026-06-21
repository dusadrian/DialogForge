"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createDataCellSelectionPlan, createDataColumnSelectionPlan, createDataRowSelectionPlan, createEditControlPlan, createMetadataRangeSelectionPlan, createVariableCellSelectionPlan, createVariableRowSelectionPlan } = require("../../shared/dataset-editor/selection/selectionControls");
const cell = createDataCellSelectionPlan("data", 2, "score", "9");
assert.deepStrictEqual(cell.action, {
    type: "selectCell",
    objectName: "data",
    rowIndex: 2,
    columnName: "score"
});
assert.deepStrictEqual(cell.controls, [
    { id: "cellRow", value: "2" },
    { id: "cellColumn", value: "score" },
    { id: "cellValue", value: "9" }
]);
const row = createDataRowSelectionPlan("data", 4);
assert.strictEqual(row.controls[0].id, "rowNameIndex");
assert.strictEqual(row.controls[0].value, "4");
const column = createDataColumnSelectionPlan("data", "score");
assert.strictEqual(column.controls[0].id, "cellColumn");
assert.strictEqual(column.controls[1].id, "columnRenameFrom");
const variable = createVariableCellSelectionPlan("data", 1, "label", "score", "Score label");
assert.deepStrictEqual(variable.action, {
    type: "selectVariableCell",
    objectName: "data",
    rowIndex: 1,
    metadataKey: "label"
});
assert.deepStrictEqual(variable.controls.map((control) => {
    return control.id;
}), ["variableName", "valueLabelVariable", "declaredMissingVariable", "variableMetadataKey", "variableMetadataValue"]);
const range = createMetadataRangeSelectionPlan({
    kind: "variable-cell",
    objectName: "data",
    rowIndex: 1,
    columnName: "",
    metadataKey: "label",
    anchorRowIndex: -1,
    focusRowIndex: -1
}, "data", 3, "label", "outcome", "Outcome label");
assert.strictEqual(range.action.anchorRowIndex, 1);
assert.strictEqual(range.action.focusRowIndex, 3);
const newRange = createMetadataRangeSelectionPlan({
    kind: "variable-cell",
    objectName: "data",
    rowIndex: 1,
    columnName: "",
    metadataKey: "role",
    anchorRowIndex: -1,
    focusRowIndex: -1
}, "data", 3, "label", "outcome", "Outcome label");
assert.strictEqual(newRange.action.anchorRowIndex, 3);
const nameRange = createMetadataRangeSelectionPlan({
    kind: "variable-cell",
    objectName: "data",
    rowIndex: 1,
    columnName: "",
    metadataKey: "name",
    anchorRowIndex: -1,
    focusRowIndex: -1
}, "data", 3, "name", "outcome", "outcome");
assert.strictEqual(nameRange.action.type, "selectVariableCell");
assert.strictEqual(nameRange.action.rowIndex, 3);
assert.strictEqual(nameRange.action.metadataKey, "name");
const variableRow = createVariableRowSelectionPlan("data", 5, "outcome");
assert.deepStrictEqual(variableRow.action, {
    type: "selectVariableRow",
    objectName: "data",
    rowIndex: 5,
    variableName: "outcome"
});
assert.deepStrictEqual(variableRow.controls, [
    { id: "variableName", value: "outcome" },
    { id: "valueLabelVariable", value: "outcome" },
    { id: "declaredMissingVariable", value: "outcome" }
]);
assert.deepStrictEqual(createEditControlPlan({
    kind: "data-cell",
    objectName: "data",
    rowIndex: 0,
    columnName: "score",
    metadataKey: "",
    anchorRowIndex: -1,
    focusRowIndex: -1
}), {
    inputId: "cellValue",
    status: "ready",
    message: "Data cell edit control selected."
});
assert.strictEqual(createEditControlPlan({
    kind: "variable-row",
    objectName: "data",
    rowIndex: 0,
    columnName: "",
    metadataKey: "",
    anchorRowIndex: -1,
    focusRowIndex: -1
}).status, "unavailable");
console.log("Dataset editor selection control contract verified.");
