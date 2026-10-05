"use strict";

const assert = require("node:assert/strict");
const { bindVariableMetadataFields } = require("../dist/src/dataset-editor/renderer/variableFieldBindings");
const { createDatasetEditorChromeView } = require("../dist/src/dataset-editor/renderer/datasetEditorChromeView");


class Field {
    constructor(key, value, type = "text", row = 0) {
        this.key = key;
        this.value = value;
        this.type = type;
        this.row = row;
        this.title = "";
        this.listeners = new Map();
    }

    getAttribute(name) {
        return name === "data-variable-row" ? String(this.row) : this.key;
    }

    addEventListener(name, listener) {
        const listeners = this.listeners.get(name) || [];
        listeners.push(listener);
        this.listeners.set(name, listeners);
    }

    emit(name, event = {}) {
        for (const listener of this.listeners.get(name) || []) {
            listener(event);
        }
    }

    blur() {
        this.emit("change");
        this.emit("blur");
    }
}

class InputField extends Field {}
class SelectField extends Field {}


const originalInput = global.HTMLInputElement;
const originalSelect = global.HTMLSelectElement;
global.HTMLInputElement = InputField;
global.HTMLSelectElement = SelectField;

try {
    const name = new InputField("name", "value");
    const width = new InputField("width", "1", "number");
    const type = new SelectField("type", "integer");
    const invalid = new InputField("name", "ignored", "text", 4);
    const commits = [];
    const inputs = [];

    bindVariableMetadataFields({
        host: { querySelectorAll: () => [name, width, type, invalid] },
        rowCount: 1,
        input: change => inputs.push(change.value),
        // Keep the write pending: change and blur must not both dispatch it.
        commit: change => commits.push([change.key, change.value])
    });

    name.value = "renamed";
    name.emit("input");
    let prevented = false;
    name.emit("keydown", {
        key: "Enter",
        preventDefault: () => { prevented = true; }
    });
    assert.equal(prevented, true);
    assert.deepEqual(commits, [["name", "renamed"]]);
    assert.equal(name.title, "renamed");
    name.emit("blur");
    assert.equal(commits.length, 1);

    // Failure can restore the old field; a new input must permit a retry.
    name.value = "value";
    name.value = "renamed";
    name.emit("input");
    name.blur();
    assert.deepEqual(commits.slice(1), [["name", "renamed"]]);

    // A changed value delivered by change alone is not lost.
    name.value = "another";
    name.blur();
    assert.deepEqual(commits.slice(2), [["name", "another"]]);

    width.value = "8";
    width.emit("input");
    width.blur();
    assert.deepEqual(commits.slice(3), [["width", 8]]);

    type.value = "character";
    type.emit("change");
    type.value = "integer";
    type.emit("change");
    assert.deepEqual(commits.slice(4), [
        ["type", "character"], ["type", "integer"]
    ]);

    invalid.emit("input");
    invalid.blur();
    assert.equal(commits.length, 6);
    assert.deepEqual(inputs, ["renamed", "renamed", 8]);

    const elements = new Map();
    for (const id of [
        "datasetEditorTabData", "datasetEditorTabVariables",
        "datasetEditorPanelData", "datasetEditorPanelVariables"
    ]) {
        const classes = new Map();
        elements.set(id, {
            classes,
            classList: { toggle: (name, active) => classes.set(name, active) },
            setAttribute: () => {}
        });
    }
    let dataPaints = 0;
    let variablePaints = 0;
    const chrome = createDatasetEditorChromeView({
        document: { getElementById: id => elements.get(id) || null },
        window: {},
        translate: key => key,
        readTitleState: () => ({ datasetName: "fixture", rowCount: 3, columnCount: 1 }),
        onDataActivated: () => {
            assert.equal(elements.get("datasetEditorPanelData").classes.get("is-active"), true);
            assert.equal(elements.get("datasetEditorPanelVariables").classes.get("is-active"), false);
            dataPaints += 1;
        },
        onVariablesActivated: () => { variablePaints += 1; }
    });
    chrome.setActiveTab("variables");
    assert.equal(dataPaints, 0);
    assert.equal(variablePaints, 1);
    chrome.setActiveTab("data");
    assert.equal(dataPaints, 1);
    assert.equal(variablePaints, 1);

    console.log("Shared variable-field single-commit cases passed (controlled DOM events, not paired rendered acceptance).");
} finally {
    global.HTMLInputElement = originalInput;
    global.HTMLSelectElement = originalSelect;
}
