"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createCopyPayload, createVariableMetadataCopyPayload } = require("../../shared/dataset-editor/clipboard/copyPayload");
const preview = {
    status: "ready",
    providerId: "test",
    objectName: "sample_data",
    columns: [
        { name: "case", type: "character", role: "id" },
        { name: "condition", type: "numeric", role: "data" }
    ],
    rows: [
        { case: "A", condition: 1 },
        { case: "B", condition: 0 }
    ],
    message: "ready",
    readAt: "test"
};
const metadata = {
    status: "ready",
    providerId: "test",
    objectName: "sample_data",
    variables: [
        {
            name: "case",
            type: "character",
            role: "id",
            label: "Case label",
            width: 8,
            decimals: 0,
            values: "",
            align: "left",
            measure: "nominal"
        },
        {
            name: "condition",
            type: "numeric",
            role: "data",
            label: "Condition label",
            width: 10,
            decimals: 2,
            values: "0 = absent; 1 = present",
            categories: [
                { value: "0", label: "absent", isMissing: false },
                { value: "1", label: "present", isMissing: true }
            ],
            missingRange: { min: "-9", max: "-7" },
            align: "right",
            measure: "scale"
        },
        {
            name: "outcome",
            type: "numeric",
            role: "data",
            label: "Outcome label",
            width: 10,
            decimals: 0,
            values: "0 = no; 1 = yes",
            align: "right",
            measure: "nominal"
        }
    ],
    message: "ready",
    refreshedAt: "test"
};
const verifyCellPayload = function () {
    const payload = createCopyPayload(preview, {
        kind: "data-cell",
        rowIndex: 0,
        columnName: "condition"
    });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.text, "1");
    assert.strictEqual(payload.cells.length, 1);
};
const verifyRowPayload = function () {
    const payload = createCopyPayload(preview, {
        kind: "data-row",
        rowIndex: 1
    });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.text, "B\t0");
    assert.strictEqual(payload.cells.length, 2);
};
const verifyColumnPayload = function () {
    const payload = createCopyPayload(preview, {
        kind: "data-column",
        columnName: "case"
    });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.text, "A\nB");
    assert.strictEqual(payload.cells.length, 2);
};
const verifyColumnValuesAndLabelsPayload = function () {
    const payload = createCopyPayload(preview, {
        kind: "data-column",
        columnName: "condition"
    }, metadata, { includeValueLabels: true });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.kind, "data-column-values-and-labels");
    assert.strictEqual(payload.text, "1\tpresent\n0\tabsent");
    assert.strictEqual(payload.cells.length, 2);
};
const verifyColumnValuesAndLabelsPayloadUsesCategories = function () {
    const categoryMetadata = Object.assign({}, metadata, {
        variables: metadata.variables.map((variable) => {
            if (variable.name !== "condition") {
                return variable;
            }
            return Object.assign({}, variable, {
                values: "",
                categories: [
                    { value: "0", label: "absent", isMissing: false },
                    { value: "1", label: "present", isMissing: false }
                ]
            });
        })
    });
    const payload = createCopyPayload(preview, {
        kind: "data-column",
        columnName: "condition"
    }, categoryMetadata, { includeValueLabels: true });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.text, "1\tpresent\n0\tabsent");
};
const verifyVariableCellPayload = function () {
    const payload = createVariableMetadataCopyPayload(metadata, {
        kind: "variable-cell",
        objectName: "sample_data",
        rowIndex: 1,
        metadataKey: "label"
    });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.kind, "variable-cell");
    assert.strictEqual(payload.text, "Condition label");
    assert.strictEqual(payload.cells.length, 0);
};
const verifyVariableValuesPayload = function () {
    const payload = createVariableMetadataCopyPayload(metadata, {
        kind: "variable-cell",
        objectName: "sample_data",
        rowIndex: 1,
        metadataKey: "values"
    });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.kind, "variable-values-and-labels");
    assert.strictEqual(payload.text, "0\tabsent\tFALSE\n1\tpresent\tTRUE\n-9\t-7\tRANGE");
    assert.strictEqual(payload.cells.length, 0);
};
const verifyVariableRowPayload = function () {
    const payload = createVariableMetadataCopyPayload(metadata, {
        kind: "variable-row",
        objectName: "sample_data",
        rowIndex: 1
    });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.kind, "variable-row");
    assert.strictEqual(payload.text, "condition\tnumeric\t10\t2\tCondition label\t0 = absent; 1 = present\tright\tscale");
};
const verifyMetadataRangePayload = function () {
    const payload = createVariableMetadataCopyPayload(metadata, {
        kind: "metadata-range",
        objectName: "sample_data",
        metadataKey: "measure",
        anchorRowIndex: 2,
        focusRowIndex: 1
    });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.kind, "metadata-range");
    assert.strictEqual(payload.text, "scale\nnominal");
};
verifyCellPayload();
verifyRowPayload();
verifyColumnPayload();
verifyColumnValuesAndLabelsPayload();
verifyColumnValuesAndLabelsPayloadUsesCategories();
verifyVariableCellPayload();
verifyVariableValuesPayload();
verifyVariableRowPayload();
verifyMetadataRangePayload();
console.log("Dataset editor copy payload contract verified.");
