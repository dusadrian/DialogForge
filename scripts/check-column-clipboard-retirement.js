"use strict";

const assert = require("node:assert/strict");
const { createDatasetColumnClipboardActions } = require("../dist/src/dataset-editor/renderer/datasetColumnClipboardActions");
const { createDatasetEditorCover } = require("../dist/src/dataset-editor/renderer/datasetEditorCover");
const { createDatasetTableRenderer } = require("../dist/src/dataset-editor/renderer/datasetTableRenderer");


const checkOperation = async function(operation, stage, transition) {
    let datasetName = "data";
    let metadataSequence = 0;
    let release;
    let rejectRead;
    let markStarted;
    const held = new Promise((resolve, reject) => { release = resolve; rejectRead = reject; });
    const started = new Promise(resolve => { markStarted = resolve; });
    const effects = [];
    const waitStage = function(name, value) {
        effects.push(name);
        if (name === stage) {
            markStarted();
            return held;
        }
        return Promise.resolve(value);
    };
    const controller = createDatasetColumnClipboardActions({
        clipboardState: {
            clearVariableMetadata: () => effects.push("clear-metadata"),
            setDataColumn: () => effects.push("remember"),
            readDataColumn: () => ({ datasetName: "data", columnName: "x", rowCount: 2001, mode: "values" })
        },
        getDatasetName: () => datasetName,
        getMetadataSequence: () => metadataSequence,
        getRowCount: () => 2001,
        getColumnNames: () => ["x", "y"],
        getContent: () => waitStage("content", { rows: [[{ display: "1", raw: "1" }]] }),
        getVariableMetadata: () => waitStage("metadata", null),
        writeClipboard: () => waitStage("write", true),
        readClipboard: () => waitStage("read", "1"),
        runCommand: () => waitStage("command", true),
        refreshDataset: async () => {
            await waitStage("refresh");
            metadataSequence += 1;
        },
        hideHeaderMenu: () => {},
        showLoading: () => {
            effects.push("loading");
            return () => effects.push("release-loading");
        },
        showNotice: message => effects.push(message),
        translate: key => key
    });
    const pending = operation === "copy"
        ? controller.copy("x", { includeLabels: true })
        : controller.paste("y");
    const failure = new Error("Column operation failed");
    if (stage) {
        await started;
        if (transition === "invalidate") {
            controller.invalidate();
        } else if (transition === "name") {
            datasetName = "replacement";
        } else if (transition === "metadata") {
            metadataSequence += 1;
        }
        if (transition === "throw") {
            rejectRead(failure);
        } else {
            release(stage === "content" ? { rows: [[{ display: "1", raw: "1" }]] } : (stage === "read" ? "1" : true));
        }
    }
    if (transition === "throw") {
        await assert.rejects(pending, error => error === failure);
    } else {
        await pending;
    }
    if (stage && transition !== "throw") {
        assert.ok(!effects.includes("remember"));
        assert.ok(!effects.includes("Column values and labels copied"));
        assert.ok(!effects.includes("Column pasted"));
        if (stage === "content") {
            assert.equal(effects.filter(effect => effect === "content").length, 1);
            assert.ok(!effects.includes("metadata"));
        } else if (stage === "metadata") {
            assert.ok(!effects.includes("write"));
        } else if (stage === "read") {
            assert.ok(!effects.includes("command"));
        } else if (stage === "command") {
            assert.ok(!effects.includes("refresh"));
        }
    } else if (!stage) {
        assert.ok(effects.includes(operation === "copy" ? "remember" : "Column pasted"));
    }
    assert.equal(effects.filter(effect => effect === "release-loading").length, stage === "read" ? 0 : 1);
};


const main = async function() {
    for (const stage of ["content", "metadata", "write"]) {
        for (const transition of ["invalidate", "name", "metadata", "throw"]) {
            await checkOperation("copy", stage, transition);
        }
    }
    for (const stage of ["read", "command", "refresh"]) {
        for (const transition of ["invalidate", "name", "throw"]) {
            await checkOperation("paste", stage, transition);
        }
    }
    await checkOperation("paste", "read", "metadata");
    await checkOperation("paste", "command", "metadata");
    await checkOperation("copy");
    await checkOperation("paste");

    const classes = new Set();
    const label = { textContent: "", hidden: true };
    const cover = createDatasetEditorCover({
        getElementById: id => id === "datasetEditorCoverLabel" ? label : {
            classList: { toggle: (name, active) => active ? classes.add(name) : classes.delete(name) }
        }
    }, key => key);
    cover.showModalCover();
    const releaseOld = cover.showOwnedLoadingCover("old");
    const releaseNew = cover.showOwnedLoadingCover("new");
    releaseOld();
    assert.equal(label.textContent, "new");
    assert.equal(cover.isLoading, true);
    releaseNew();
    assert.equal(cover.isLoading, false);
    assert.ok(classes.has("dataset-editor__cover--active"), "Loading release must preserve real modal cover");
    cover.hideModalCover();
    assert.ok(!classes.has("dataset-editor__cover--active"));

    for (const state of ["failed", "empty", "pending"]) {
        const messages = [];
        const renderer = createDatasetTableRenderer({
            getVariablesHost: () => ({}), getVariables: () => [],
            isVariableMetadataLoaded: () => state !== "pending",
            isVariableMetadataFailed: () => state === "failed",
            translate: key => key,
            renderVariablesStatus: message => messages.push(message)
        });
        renderer.renderVariables();
        assert.deepEqual(messages, [state === "failed" ? "Could not load variable metadata" : (state === "empty" ? "No variable metadata available" : "")]);
    }
    console.log("Shared column clipboard/cover/table cases passed (controlled operations, not rendered host acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
