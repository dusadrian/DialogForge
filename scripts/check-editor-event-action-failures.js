"use strict";

const assert = require("node:assert/strict");
const { createDatasetEditorContextMenuBindingController } = require("../dist/src/dataset-editor/renderer/datasetEditorContextMenuBindingController");
const { createDatasetEditorWindowInteractionController } = require("../dist/src/dataset-editor/renderer/datasetEditorWindowInteractionController");


const main = async function() {
    const originalError = console.error;
    const reported = [];
    console.error = (...args) => reported.push(args);
    try {
        for (const outcome of ["throw", "reject", "success", "false"]) {
            const failure = new Error(`Event action ${outcome}`);
            const calls = [];
            const menuActions = {};
            const menuCases = [
                ["copyColumn", ["x", { includeLabels: true }]],
                ["pasteColumn", ["x"]], ["sortColumn", ["x", true]],
                ["renameColumn", ["x"]], ["insertColumn", ["x", "after"]],
                ["removeColumn", ["x"]], ["insertRow", [4, "before"]],
                ["renameRow", [4]], ["removeRow", [4]],
                ["copyCell", []], ["pasteCell", []]
            ];
            const invoke = function(owner, name, args, expectedOwner) {
                assert.equal(owner, expectedOwner, "Binding must preserve action receiver");
                calls.push([name, args]);
                if (outcome === "throw") {
                    throw failure;
                }
                if (outcome === "reject") {
                    return Promise.reject(failure);
                }
                return Promise.resolve(outcome !== "false");
            };
            for (const [name] of menuCases) {
                menuActions[name] = function(...args) {
                    return invoke(this, name, args, menuActions);
                };
            }
            const menuBindings = createDatasetEditorContextMenuBindingController(
                { getElementById: () => null }, {}, menuActions
            );
            const keyboardOptions = { getSelectedColumn: () => "x" };
            const keyboardCases = [
                ["copySelectedColumn", ["x"]], ["pasteSelectedColumn", ["x"]],
                ["copyActiveCell", []], ["pasteActiveCell", []]
            ];
            for (const [name] of keyboardCases) {
                keyboardOptions[name] = function(...args) {
                    return invoke(this, name, args, keyboardOptions);
                };
            }
            const keyboardBindings = createDatasetEditorWindowInteractionController(keyboardOptions);
            const reportCount = reported.length;
            for (const [name, args] of menuCases) {
                assert.equal(menuBindings[name](...args), undefined);
            }
            for (const [name] of keyboardCases) {
                assert.equal(keyboardBindings.globalEvents.actions[name](), undefined);
            }
            for (let step = 0; step < 6; step += 1) {
                await Promise.resolve();
            }
            assert.deepEqual(calls, [...menuCases, ...keyboardCases]);
            const newReports = reported.slice(reportCount);
            assert.equal(newReports.length, outcome === "throw" || outcome === "reject" ? 15 : 0);
            for (const [message, error] of newReports) {
                assert.ok(message.startsWith("Dataset editor action failed ("));
                assert.equal(error, failure);
            }
        }
        console.log("Shared editor event-action failure cases passed (controlled callbacks, not rendered menu/shortcut acceptance).");
    } finally {
        console.error = originalError;
    }
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
