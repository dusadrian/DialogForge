"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createDatasetColumnLayoutKey } = require("../../shared/dataset-editor/state/datasetEditorState");
const { createDataPreviewDescriptor, createVariableMetadataTableDescriptor } = require("../../shared/dataset-editor/view/tableDescriptors");
const verifyDataPreviewDescriptor = function () {
    const descriptor = createDataPreviewDescriptor({
        status: "ready",
        providerId: "test",
        objectName: "sample_data",
        columns: [
            { name: "case", type: "character", role: "id" },
            { name: "condition", type: "numeric", role: "data" }
        ],
        rows: [
            { case: "A", condition: 1 },
            { case: "B", condition: null }
        ],
        rowNames: ["case-a", ""],
        message: "ready",
        readAt: "test"
    });
    assert.strictEqual(descriptor.status, "ready");
    assert.deepStrictEqual(descriptor.headers, [
        { text: "case", columnName: "case", width: 0 },
        { text: "condition", columnName: "condition", width: 0 }
    ]);
    assert.deepStrictEqual(descriptor.rows[0].header, {
        rowIndex: 0,
        text: "case-a"
    });
    assert.deepStrictEqual(descriptor.rows[1].header, {
        rowIndex: 1,
        text: "1"
    });
    assert.strictEqual(descriptor.rows[0].cells[1].text, "1");
    assert.strictEqual(descriptor.rows[1].cells[1].text, "");
};
const verifyDataPreviewLayoutDescriptor = function () {
    const descriptor = createDataPreviewDescriptor({
        status: "ready",
        providerId: "test",
        objectName: "sample_data",
        columns: [
            { name: "case", type: "character", role: "id" },
            { name: "condition", type: "numeric", role: "data" },
            { name: "outcome", type: "numeric", role: "data" }
        ],
        rows: [
            { case: "A", condition: 1, outcome: 0 },
            { case: "B", condition: 0, outcome: 1 },
            { case: "C", condition: 1, outcome: 1 }
        ],
        rowNames: ["a", "b", "c"],
        message: "ready",
        readAt: "test"
    }, {
        viewport: {
            dataStartRow: 1,
            dataVisibleRows: 2,
            dataStartColumn: 0,
            dataVisibleColumns: 2
        },
        columnOrder: {
            sample_data: ["outcome", "case"]
        },
        columnWidths: {
            [createDatasetColumnLayoutKey("sample_data", "outcome")]: 120
        }
    });
    assert.strictEqual(descriptor.rowOffset, 1);
    assert.strictEqual(descriptor.columnOffset, 0);
    assert.deepStrictEqual(descriptor.headers, [
        { text: "outcome", columnName: "outcome", width: 120 },
        { text: "case", columnName: "case", width: 0 }
    ]);
    assert.strictEqual(descriptor.rows.length, 2);
    assert.strictEqual(descriptor.rows[0].rowIndex, 1);
    assert.strictEqual(descriptor.rows[0].cells[0].columnName, "outcome");
    assert.strictEqual(descriptor.rows[0].cells[0].text, "1");
    assert.strictEqual(descriptor.rows[0].cells[0].width, 120);
    assert.strictEqual(descriptor.rows[1].header.text, "c");
};
const verifyWindowedDataPreviewDescriptor = function () {
    const descriptor = createDataPreviewDescriptor({
        status: "ready",
        providerId: "test",
        objectName: "sample_data",
        columns: [
            { name: "v3", type: "numeric", role: "data" },
            { name: "v4", type: "numeric", role: "data" }
        ],
        rows: [
            { v3: 11, v4: 111 },
            { v3: 12, v4: 112 }
        ],
        rowNames: ["case-11", "case-12"],
        rowOffset: 10,
        totalRowCount: 100,
        totalColumnCount: 40,
        message: "ready",
        readAt: "test"
    }, {
        viewport: {
            dataStartRow: 0,
            dataVisibleRows: 2,
            dataStartColumn: 0,
            dataVisibleColumns: 2
        }
    });
    assert.strictEqual(descriptor.rowOffset, 10);
    assert.strictEqual(descriptor.rows[0].rowIndex, 10);
    assert.strictEqual(descriptor.rows[0].header.text, "case-11");
    assert.strictEqual(descriptor.rows[0].cells[0].text, "11");
    assert.strictEqual(descriptor.rows[1].rowIndex, 11);
};
const verifyVariableMetadataDescriptor = function () {
    const descriptor = createVariableMetadataTableDescriptor({
        status: "ready",
        providerId: "test",
        objectName: "sample_data",
        variables: [
            { name: "condition", type: "numeric", label: "Condition" }
        ],
        message: "ready",
        refreshedAt: "test"
    }, ["name", "type", "label"]);
    assert.strictEqual(descriptor.status, "ready");
    assert.deepStrictEqual(descriptor.headers, [
        { text: "name", metadataKey: "name" },
        { text: "type", metadataKey: "type" },
        { text: "label", metadataKey: "label" }
    ]);
    assert.strictEqual(descriptor.rows[0].variableName, "condition");
    assert.deepStrictEqual(descriptor.rows[0].header, {
        rowIndex: 0,
        variableName: "condition",
        text: "0"
    });
    assert.strictEqual(descriptor.rows[0].cells[2].text, "Condition");
};
const verifyVariableMetadataViewportDescriptor = function () {
    const descriptor = createVariableMetadataTableDescriptor({
        status: "ready",
        providerId: "test",
        objectName: "sample_data",
        variables: [
            { name: "id", type: "character", label: "Case" },
            { name: "condition", type: "numeric", label: "Condition" },
            { name: "outcome", type: "numeric", label: "Outcome" }
        ],
        message: "ready",
        refreshedAt: "test"
    }, ["name", "type", "label"], {
        viewport: {
            variableStartRow: 1,
            variableVisibleRows: 1
        }
    });
    assert.strictEqual(descriptor.rowOffset, 1);
    assert.strictEqual(descriptor.rows.length, 1);
    assert.strictEqual(descriptor.rows[0].rowIndex, 1);
    assert.strictEqual(descriptor.rows[0].variableName, "condition");
    assert.strictEqual(descriptor.rows[0].cells[2].text, "Condition");
};
verifyDataPreviewDescriptor();
verifyDataPreviewLayoutDescriptor();
verifyWindowedDataPreviewDescriptor();
verifyVariableMetadataDescriptor();
verifyVariableMetadataViewportDescriptor();
console.log("Dataset editor table descriptor contract verified.");
