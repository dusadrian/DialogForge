"use strict";

const assert = require("node:assert/strict");
const {
    renderWorkspacePaneToggle
} = require("../dist/src/base-app/features/workspace-pane/workspacePaneToggle");

for (const host of ["electron", "browser"]) {
    const classes = new Set();
    const attributes = {};
    const button = {
        dataset: {},
        setAttribute: (key, value) => { attributes[key] = value; },
        querySelector: () => ({
            classList: {
                toggle: (key, present) => {
                    if (present) {
                        classes.add(key);
                    }
                    else {
                        classes.delete(key);
                    }
                }
            }
        })
    };
    const document = { getElementById: () => button };
    renderWorkspacePaneToggle(document, true);
    assert.equal(attributes["aria-label"], "Hide Workspace", host);
    assert.equal(button.dataset.tooltip, "Hide Workspace");
    assert.deepEqual([...classes], ["codicon-chevron-left"]);
    renderWorkspacePaneToggle(document, false, (key) => `translated: ${key}`);
    assert.equal(attributes["aria-label"], "translated: Show Workspace", host);
    assert.equal(button.dataset.tooltip, "translated: Show Workspace");
    assert.deepEqual([...classes], ["codicon-chevron-right"]);
    renderWorkspacePaneToggle(document, true, (key) => `translated: ${key}`);
    assert.equal(attributes["aria-label"], "translated: Hide Workspace", host);
    assert.deepEqual([...classes], ["codicon-chevron-left"]);
}

assert.throws(
    () => renderWorkspacePaneToggle({ getElementById: () => null }, true),
    /Missing workspace pane toggle/
);

console.log("Shared workspace-toggle cases passed; rendered acceptance is separate.");
