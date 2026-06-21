"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createClipboardCopyPayloadFromSelection, createCopyPayloadFromSelection, createPasteUpdatePlanFromSelection } = require("../../shared/dataset-editor/commands/clipboardCommands");
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
        { name: "case", type: "character", role: "id", label: "Case label", measure: "nominal" },
        {
            name: "condition",
            type: "numeric",
            role: "data",
            label: "Condition label",
            values: "0 = absent; 1 = present",
            categories: [
                { value: "0", label: "absent", isMissing: false },
                { value: "1", label: "present", isMissing: true }
            ],
            missingRange: { min: "-9", max: "-7" },
            measure: "scale"
        },
        { name: "outcome", type: "numeric", role: "data", label: "Outcome label", measure: "nominal" }
    ],
    message: "ready",
    refreshedAt: "test"
};
const verifyDataCopyRouting = function () {
    const payload = createCopyPayloadFromSelection(preview, metadata, {
        kind: "data-column",
        objectName: "sample_data",
        columnName: "case"
    });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.kind, "data-column");
    assert.strictEqual(payload.text, "A\nB");
};
const verifyDataCopyWithLabelsRouting = function () {
    const payload = createCopyPayloadFromSelection(preview, metadata, {
        kind: "data-column",
        objectName: "sample_data",
        columnName: "condition"
    }, { includeValueLabels: true });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.kind, "data-column-values-and-labels");
    assert.strictEqual(payload.text, "1\tpresent\n0\tabsent");
};
const verifyClipboardColumnCopyUsesLabels = function () {
    const payload = createClipboardCopyPayloadFromSelection(preview, metadata, {
        kind: "data-column",
        objectName: "sample_data",
        columnName: "condition"
    });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.kind, "data-column-values-and-labels");
    assert.strictEqual(payload.text, "1\tpresent\n0\tabsent");
};
const verifyClipboardColumnCopyCanUseValuesOnly = function () {
    const payload = createClipboardCopyPayloadFromSelection(preview, metadata, {
        kind: "data-column",
        objectName: "sample_data",
        columnName: "condition"
    }, { includeValueLabels: false });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.kind, "data-column");
    assert.strictEqual(payload.text, "1\n0");
};
const verifyMetadataCopyRouting = function () {
    const payload = createCopyPayloadFromSelection(preview, metadata, {
        kind: "metadata-range",
        objectName: "sample_data",
        metadataKey: "measure",
        anchorRowIndex: 1,
        focusRowIndex: 2
    });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.kind, "metadata-range");
    assert.strictEqual(payload.text, "scale\nnominal");
};
const verifyValuesMetadataCopyRouting = function () {
    const payload = createCopyPayloadFromSelection(preview, metadata, {
        kind: "variable-cell",
        objectName: "sample_data",
        rowIndex: 1,
        metadataKey: "values"
    });
    assert.strictEqual(payload.status, "ready");
    assert.strictEqual(payload.kind, "variable-values-and-labels");
    assert.strictEqual(payload.text, "0\tabsent\tFALSE\n1\tpresent\tTRUE\n-9\t-7\tRANGE");
};
const verifyDataPasteRouting = function () {
    const plan = createPasteUpdatePlanFromSelection(preview, metadata, {
        kind: "data-cell",
        objectName: "sample_data",
        rowIndex: 0,
        columnName: "condition"
    }, parseClipboardText("0\t1"));
    assert.strictEqual(plan.status, "ready");
    assert.strictEqual(plan.kind, "data-cells");
    assert.strictEqual(plan.cellUpdates.length, 2);
    assert.strictEqual(plan.metadataUpdates.length, 0);
};
const verifyValuesAndLabelsColumnPasteUsesValuesOnly = function () {
    const sourceCopyPayload = createClipboardCopyPayloadFromSelection(preview, metadata, {
        kind: "data-column",
        objectName: "sample_data",
        columnName: "condition"
    });
    const plan = createPasteUpdatePlanFromSelection(preview, metadata, {
        kind: "data-column",
        objectName: "sample_data",
        columnName: "outcome"
    }, parseClipboardText(sourceCopyPayload.text), sourceCopyPayload);
    assert.strictEqual(plan.status, "ready");
    assert.strictEqual(plan.kind, "data-cells");
    assert.deepStrictEqual(plan.cellUpdates.map((update) => {
        return update.columnName + ":" + update.value;
    }), [
        "outcome:1",
        "outcome:0"
    ]);
};
const verifyMetadataPasteRouting = function () {
    const plan = createPasteUpdatePlanFromSelection(preview, metadata, {
        kind: "metadata-range",
        objectName: "sample_data",
        metadataKey: "label",
        anchorRowIndex: 1,
        focusRowIndex: 2
    }, parseClipboardText("Updated condition\nUpdated outcome"));
    assert.strictEqual(plan.status, "ready");
    assert.strictEqual(plan.kind, "variable-metadata");
    assert.strictEqual(plan.cellUpdates.length, 0);
    assert.deepStrictEqual(plan.metadataUpdates.map((update) => {
        return update.variableName + ":" + update.value;
    }), [
        "condition:Updated condition",
        "outcome:Updated outcome"
    ]);
};
const verifyValuesMetadataPasteRouting = function () {
    const sourceCopyPayload = createCopyPayloadFromSelection(preview, metadata, {
        kind: "variable-cell",
        objectName: "sample_data",
        rowIndex: 1,
        metadataKey: "values"
    });
    const plan = createPasteUpdatePlanFromSelection(preview, metadata, {
        kind: "variable-cell",
        objectName: "sample_data",
        rowIndex: 2,
        metadataKey: "values"
    }, parseClipboardText(sourceCopyPayload.text), sourceCopyPayload);
    assert.strictEqual(plan.status, "ready");
    assert.strictEqual(plan.kind, "variable-values");
    assert.strictEqual(plan.metadataUpdates.length, 0);
    assert.deepStrictEqual(plan.valueLabelUpdates.map((update) => {
        return update.variableName + ":" + update.labels.map((entry) => {
            return entry.value + "=" + entry.label;
        }).join(",");
    }), [
        "outcome:0=absent,1=present"
    ]);
    assert.deepStrictEqual(plan.declaredMissingUpdates.map((update) => {
        return update.variableName + ":" + update.values.map((entry) => {
            return entry.value + "=" + entry.label;
        }).join(",");
    }), [
        "outcome:1=present"
    ]);
};
const verifyEmptyPasteRouting = function () {
    const plan = createPasteUpdatePlanFromSelection(preview, metadata, {
        kind: "none",
        objectName: "",
        rowIndex: -1,
        columnName: "",
        metadataKey: "",
        anchorRowIndex: -1,
        focusRowIndex: -1
    }, parseClipboardText("ignored"));
    assert.strictEqual(plan.status, "empty");
    assert.strictEqual(plan.kind, "none");
};
verifyDataCopyRouting();
verifyDataCopyWithLabelsRouting();
verifyClipboardColumnCopyUsesLabels();
verifyClipboardColumnCopyCanUseValuesOnly();
verifyMetadataCopyRouting();
verifyValuesMetadataCopyRouting();
verifyDataPasteRouting();
verifyValuesAndLabelsColumnPasteUsesValuesOnly();
verifyMetadataPasteRouting();
verifyValuesMetadataPasteRouting();
verifyEmptyPasteRouting();
console.log("Dataset editor clipboard command contract verified.");
