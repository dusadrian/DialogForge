"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { routeDatasetCommand } = require("../../shared/dataset-editor/commands/commandRouter");
assert.deepStrictEqual(routeDatasetCommand("dataset.copy"), {
    status: "ready",
    action: "copyToClipboard",
    position: "",
    direction: "",
    message: "Dataset command routed."
});
assert.deepStrictEqual(routeDatasetCommand("dataset.copyPayloadWithLabels"), {
    status: "ready",
    action: "copyPayloadWithLabels",
    position: "",
    direction: "",
    message: "Dataset command routed."
});
assert.deepStrictEqual(routeDatasetCommand("dataset.copyValues"), {
    status: "ready",
    action: "copyValuesToClipboard",
    position: "",
    direction: "",
    message: "Dataset command routed."
});
assert.deepStrictEqual(routeDatasetCommand("dataset.pasteFromClipboard"), {
    status: "ready",
    action: "pasteFromClipboard",
    position: "",
    direction: "",
    message: "Dataset command routed."
});
assert.deepStrictEqual(routeDatasetCommand("dataset.toggleTab"), {
    status: "ready",
    action: "toggleTab",
    position: "",
    direction: "",
    message: "Dataset command routed."
});
assert.deepStrictEqual(routeDatasetCommand("dataset.writeCell"), {
    status: "ready",
    action: "writeCell",
    position: "",
    direction: "",
    message: "Dataset command routed."
});
assert.deepStrictEqual(routeDatasetCommand("dataset.goToCase"), {
    status: "ready",
    action: "goToCase",
    position: "",
    direction: "",
    message: "Dataset command routed."
});
assert.deepStrictEqual(routeDatasetCommand("dataset.goToVariable"), {
    status: "ready",
    action: "goToVariable",
    position: "",
    direction: "",
    message: "Dataset command routed."
});
assert.deepStrictEqual(routeDatasetCommand("dataset.insertColumn.before"), {
    status: "ready",
    action: "insertColumn",
    position: "before",
    direction: "",
    message: "Dataset command routed."
});
assert.deepStrictEqual(routeDatasetCommand("dataset.insertRow.after"), {
    status: "ready",
    action: "insertRow",
    position: "after",
    direction: "",
    message: "Dataset command routed."
});
assert.deepStrictEqual(routeDatasetCommand("dataset.sortRows.descending"), {
    status: "ready",
    action: "sortRows",
    position: "",
    direction: "descending",
    message: "Dataset command routed."
});
assert.deepStrictEqual(routeDatasetCommand("dataset.renameRow"), {
    status: "ready",
    action: "renameRow",
    position: "",
    direction: "",
    message: "Dataset command routed."
});
assert.strictEqual(routeDatasetCommand("dataset.updateVariableMetadata").action, "updateVariableMetadata");
assert.strictEqual(routeDatasetCommand("dataset.nope").status, "unavailable");
console.log("Dataset command router contract verified.");
