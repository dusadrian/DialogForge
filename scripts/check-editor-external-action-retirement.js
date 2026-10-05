"use strict";

const assert = require("node:assert/strict");
const { createDatasetEditorExternalActionsController } = require("../dist/src/dataset-editor/renderer/datasetEditorExternalActionsController");


const main = async function() {
    const previousError = console.error;
    const reports = [];
    console.error = (...args) => reports.push(args);
    const flush = async function() {
        for (let step = 0; step < 10; step += 1) {
            await Promise.resolve();
        }
    };
    try {
        for (const kind of ["case", "variable"]) {
            for (const transition of ["normal", "invalidate", "sequence", "name", "no-schema", "new-request", "reject"]) {
                let name = "old";
                let sequence = 0;
                let schema = true;
                let release;
                let rejectRead;
                const held = new Promise((resolve, reject) => { release = resolve; rejectRead = reject; });
                const effects = [];
                const controller = createDatasetEditorExternalActionsController({
                    getCurrentDatasetName: () => name,
                    getLoadSequence: () => sequence,
                    hasDatasetSchema: () => schema,
                    loadDataset: next => {
                        name = next;
                        sequence += 1;
                        effects.push("load");
                        return held;
                    },
                    jumpToCase: value => effects.push(`case:${value}`),
                    jumpToVariable: value => effects.push(`variable:${value}`)
                });
                if (kind === "case") {
                    controller.goToCase("data", 4);
                } else {
                    controller.goToVariable("data", " x ");
                }
                assert.deepEqual(effects, ["load"]);
                if (transition === "invalidate") {
                    controller.invalidate();
                } else if (transition === "sequence") {
                    sequence += 1;
                } else if (transition === "name") {
                    name = "replacement";
                } else if (transition === "no-schema") {
                    schema = false;
                } else if (transition === "new-request") {
                    controller.goToCase("data", 8);
                }
                const failure = new Error("Opening failed");
                const reportCount = reports.length;
                if (transition === "reject") {
                    rejectRead(failure);
                } else {
                    release();
                }
                await flush();
                if (transition === "normal") {
                    assert.deepEqual(effects, ["load", kind === "case" ? "case:4" : "variable:x"]);
                } else if (transition === "new-request") {
                    assert.deepEqual(effects, ["load", "case:8"]);
                } else {
                    assert.deepEqual(effects, ["load"]);
                }
                assert.equal(reports.length - reportCount, transition === "reject" ? 1 : 0);
                if (transition === "reject") {
                    assert.equal(reports.at(-1)[1], failure);
                }
            }
        }

        for (const method of ["openDataset", "refreshDataset", "applyDatasetChanges"]) {
            for (const outcome of ["throw", "reject", "success"]) {
                const failure = new Error(`${method} failed`);
                const effects = [];
                const operation = function(value) {
                    effects.push(value);
                    if (outcome === "throw") {
                        throw failure;
                    }
                    return outcome === "reject" ? Promise.reject(failure) : Promise.resolve();
                };
                let applyChanges;
                const controller = createDatasetEditorExternalActionsController({
                    loadDataset: operation, refreshDataset: operation, applyDatasetChanges: operation
                });
                const bridge = {};
                for (const name of ["onInit", "onLanguageChanged", "onSetDatasetList", "onOpenDataset", "onRefreshDataset", "onFilterStateChanged", "onGotoCase", "onGotoVariable"]) {
                    bridge[name] = () => {};
                }
                bridge.onApplyChanges = callback => { applyChanges = callback; };
                controller.bindIpc(bridge);
                const count = reports.length;
                if (method === "applyDatasetChanges") {
                    applyChanges({ changes: [] });
                } else {
                    controller[method]("data");
                }
                await flush();
                assert.equal(effects.length, 1);
                assert.equal(reports.length - count, outcome === "success" ? 0 : 1);
                if (outcome !== "success") {
                    assert.equal(reports.at(-1)[1], failure);
                }
            }
        }
        console.log("Shared external editor action cases passed (controlled delivery, not real frame/window acceptance).");
    } finally {
        console.error = previousError;
    }
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
