"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createDatasetColumnLayoutKey, createInitialDatasetEditorState, datasetEditorReducer } = require("../../shared/dataset-editor/state/datasetEditorState");
const verifyCellSelection = function () {
    const state = datasetEditorReducer(createInitialDatasetEditorState(), {
        type: "selectCell",
        objectName: "sample_data",
        rowIndex: 1,
        columnName: "condition"
    });
    assert.strictEqual(state.selection.kind, "data-cell");
    assert.strictEqual(state.selection.objectName, "sample_data");
    assert.strictEqual(state.selection.rowIndex, 1);
    assert.strictEqual(state.selection.columnName, "condition");
    assert.strictEqual(state.editing.active, false);
};
const verifyEditingState = function () {
    const selected = datasetEditorReducer(createInitialDatasetEditorState(), {
        type: "selectCell",
        objectName: "sample_data",
        rowIndex: 0,
        columnName: "outcome"
    });
    const editing = datasetEditorReducer(selected, {
        type: "beginEdit",
        value: "1"
    });
    const ended = datasetEditorReducer(editing, {
        type: "endEdit"
    });
    assert.strictEqual(editing.editing.active, true);
    assert.strictEqual(editing.editing.value, "1");
    assert.strictEqual(ended.editing.active, false);
    assert.strictEqual(ended.selection.columnName, "outcome");
};
const verifyRowAndColumnSelection = function () {
    const row = datasetEditorReducer(createInitialDatasetEditorState(), {
        type: "selectRow",
        objectName: "sample_data",
        rowIndex: 2
    });
    const column = datasetEditorReducer(row, {
        type: "selectColumn",
        objectName: "sample_data",
        columnName: "outcome"
    });
    assert.strictEqual(row.selection.kind, "data-row");
    assert.strictEqual(row.selection.rowIndex, 2);
    assert.strictEqual(column.selection.kind, "data-column");
    assert.strictEqual(column.selection.columnName, "outcome");
    assert.strictEqual(column.editing.active, false);
};
const verifyVariableSelection = function () {
    const cell = datasetEditorReducer(createInitialDatasetEditorState(), {
        type: "selectVariableCell",
        objectName: "sample_data",
        rowIndex: 2,
        metadataKey: "label"
    });
    const row = datasetEditorReducer(cell, {
        type: "selectVariableRow",
        objectName: "sample_data",
        rowIndex: 4,
        variableName: "outcome"
    });
    assert.strictEqual(cell.selection.kind, "variable-cell");
    assert.strictEqual(cell.selection.objectName, "sample_data");
    assert.strictEqual(cell.selection.rowIndex, 2);
    assert.strictEqual(cell.selection.metadataKey, "label");
    assert.strictEqual(cell.selection.columnName, "");
    assert.strictEqual(row.selection.kind, "variable-row");
    assert.strictEqual(row.selection.rowIndex, 4);
    assert.strictEqual(row.selection.columnName, "outcome");
    assert.strictEqual(row.selection.metadataKey, "");
    assert.strictEqual(row.editing.active, false);
};
const verifyMetadataRangeSelection = function () {
    const state = datasetEditorReducer(createInitialDatasetEditorState(), {
        type: "selectMetadataRange",
        objectName: "sample_data",
        metadataKey: "measure",
        anchorRowIndex: 1,
        focusRowIndex: 5
    });
    assert.strictEqual(state.selection.kind, "metadata-range");
    assert.strictEqual(state.selection.objectName, "sample_data");
    assert.strictEqual(state.selection.metadataKey, "measure");
    assert.strictEqual(state.selection.anchorRowIndex, 1);
    assert.strictEqual(state.selection.focusRowIndex, 5);
    assert.strictEqual(state.selection.rowIndex, 5);
    assert.strictEqual(state.editing.active, false);
};
const verifyVariableCellEditingState = function () {
    const selected = datasetEditorReducer(createInitialDatasetEditorState(), {
        type: "selectVariableCell",
        objectName: "sample_data",
        rowIndex: 0,
        metadataKey: "label"
    });
    const editing = datasetEditorReducer(selected, {
        type: "beginEdit",
        value: "Condition label"
    });
    const blocked = datasetEditorReducer(datasetEditorReducer(createInitialDatasetEditorState(), {
        type: "selectVariableRow",
        objectName: "sample_data",
        rowIndex: 0,
        variableName: "condition"
    }), {
        type: "beginEdit",
        value: "ignored"
    });
    assert.strictEqual(editing.editing.active, true);
    assert.strictEqual(editing.editing.value, "Condition label");
    assert.strictEqual(blocked.editing.active, false);
};
const verifyViewportState = function () {
    const initial = createInitialDatasetEditorState();
    const moved = datasetEditorReducer(initial, {
        type: "setViewport",
        viewport: {
            dataStartRow: 20,
            dataVisibleRows: 15,
            dataStartColumn: 3,
            dataVisibleColumns: 8,
            variableStartRow: 5,
            variableVisibleRows: 12
        }
    });
    const invalid = datasetEditorReducer(moved, {
        type: "setViewport",
        viewport: {
            dataStartRow: -2,
            dataVisibleRows: 0
        }
    });
    assert.deepStrictEqual(moved.viewport, {
        dataStartRow: 20,
        dataVisibleRows: 15,
        dataStartColumn: 3,
        dataVisibleColumns: 8,
        variableStartRow: 5,
        variableVisibleRows: 12
    });
    assert.strictEqual(invalid.viewport.dataStartRow, 20);
    assert.strictEqual(invalid.viewport.dataVisibleRows, 15);
};
const verifyColumnWidthState = function () {
    const initial = createInitialDatasetEditorState();
    const resized = datasetEditorReducer(initial, {
        type: "setColumnWidth",
        objectName: "sample_data",
        columnName: "condition",
        width: 132.7
    });
    const invalid = datasetEditorReducer(resized, {
        type: "setColumnWidth",
        objectName: "sample_data",
        columnName: "condition",
        width: 12
    });
    const key = createDatasetColumnLayoutKey("sample_data", "condition");
    assert.strictEqual(resized.columnWidths[key], 133);
    assert.strictEqual(invalid.columnWidths[key], 133);
};
const verifyColumnOrderState = function () {
    const ordered = datasetEditorReducer(createInitialDatasetEditorState(), {
        type: "setColumnOrder",
        objectName: "sample_data",
        columnNames: ["id", "condition", "outcome", "condition", ""]
    });
    const moved = datasetEditorReducer(ordered, {
        type: "moveColumn",
        objectName: "sample_data",
        columnName: "outcome",
        targetIndex: 0
    });
    const invalid = datasetEditorReducer(moved, {
        type: "moveColumn",
        objectName: "sample_data",
        columnName: "missing",
        targetIndex: 1
    });
    assert.deepStrictEqual(ordered.columnOrder.sample_data, ["id", "condition", "outcome"]);
    assert.deepStrictEqual(moved.columnOrder.sample_data, ["outcome", "id", "condition"]);
    assert.deepStrictEqual(invalid.columnOrder.sample_data, ["outcome", "id", "condition"]);
};
const verifyLayoutSurvivesSelectionChanges = function () {
    const layout = datasetEditorReducer(datasetEditorReducer(createInitialDatasetEditorState(), {
        type: "setViewport",
        viewport: {
            dataStartRow: 10
        }
    }), {
        type: "setColumnOrder",
        objectName: "sample_data",
        columnNames: ["id", "outcome"]
    });
    const selected = datasetEditorReducer(layout, {
        type: "selectColumn",
        objectName: "sample_data",
        columnName: "outcome"
    });
    assert.strictEqual(selected.viewport.dataStartRow, 10);
    assert.deepStrictEqual(selected.columnOrder.sample_data, ["id", "outcome"]);
};
verifyCellSelection();
verifyEditingState();
verifyRowAndColumnSelection();
verifyVariableSelection();
verifyMetadataRangeSelection();
verifyVariableCellEditingState();
verifyViewportState();
verifyColumnWidthState();
verifyColumnOrderState();
verifyLayoutSurvivesSelectionChanges();
console.log("Dataset editor state contract verified.");
