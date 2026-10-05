"use strict";

const assert = require("node:assert/strict");
const {
    resolveDatasetEditorGlobalShortcut
} = require("../dist/src/dataset-editor/commands/globalShortcut");
const {
    bindDatasetEditorGlobalEvents
} = require("../dist/src/dataset-editor/renderer/datasetEditorGlobalBindings");

const ordinary = {
    key: "v", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false,
    fontShortcut: false, headerMenuOpen: false, rowMenuOpen: false,
    valueLabelsOpen: false, dataTabActive: true, dataColumnSelected: false,
    inputTextSelected: false, variableRangeSelected: false
};

for (const key of ["c", "v"]) {
    for (const selected of [false, true]) {
        for (const column of [false, true]) {
            assert.equal(resolveDatasetEditorGlobalShortcut({
                ...ordinary, key, editableTarget: true,
                inputTextSelected: selected, dataColumnSelected: column,
                variableRangeSelected: true
            }), "none", "Native input must own clipboard keys while editing");
        }
    }
}

assert.equal(resolveDatasetEditorGlobalShortcut(ordinary), "paste-active-cell");
assert.equal(resolveDatasetEditorGlobalShortcut({
    ...ordinary, dataColumnSelected: true
}), "paste-selected-column");
assert.equal(resolveDatasetEditorGlobalShortcut({
    ...ordinary, key: "c"
}), "copy-active-cell");
assert.equal(resolveDatasetEditorGlobalShortcut({
    ...ordinary, key: "c", dataColumnSelected: true
}), "copy-selected-column");

class Element {
    constructor() { this.isContentEditable = false; }
}
class Input extends Element {
    constructor() { super(); this.selectionStart = 0; this.selectionEnd = 0; }
}
class Textarea extends Input {}
class Select extends Element {}

const previousGlobals = new Map();
for (const [name, value] of Object.entries({
    HTMLElement: Element, HTMLInputElement: Input,
    HTMLTextAreaElement: Textarea, HTMLSelectElement: Select
})) {
    previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true });
}
previousGlobals.set("window", Object.getOwnPropertyDescriptor(globalThis, "window"));

try {
    let keydown;
    const calls = [];
    Object.defineProperty(globalThis, "window", {
        value: { addEventListener: (name, listener) => {
            if (name === "keydown") keydown = listener;
        } }, configurable: true
    });
    const actions = {};
    for (const name of ["resized", "hideHeaderMenu", "hideRowMenu",
        "copySelectedColumn", "pasteSelectedColumn", "copyActiveCell",
        "pasteActiveCell", "toggleTab", "closeValueLabels"]) {
        actions[name] = () => calls.push(name);
    }
    bindDatasetEditorGlobalEvents({
        isFontShortcut: () => false,
        readState: () => ({ ...ordinary, valueLabelsOpen: false }),
        actions
    });
    const editable = new Element();
    editable.isContentEditable = true;
    for (const target of [new Input(), new Textarea(), new Select(), editable]) {
        for (const key of ["c", "v"]) {
            let prevented = false;
            keydown({ ...ordinary, key, target,
                preventDefault: () => { prevented = true; }, stopPropagation() {} });
            assert.equal(prevented, false);
            assert.equal(calls.length, 0);
        }
    }
    let prevented = false;
    keydown({ ...ordinary, target: new Element(),
        preventDefault: () => { prevented = true; }, stopPropagation() {} });
    assert.equal(prevented, true);
    assert.deepEqual(calls, ["pasteActiveCell"]);
}
finally {
    for (const [name, descriptor] of previousGlobals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
    }
}

console.log("Shared dataset clipboard shortcuts: focused text editors retained; grid actions preserved.");
