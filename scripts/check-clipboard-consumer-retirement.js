"use strict";

const assert = require("node:assert/strict");
const { createDatasetClipboardController } = require(
    "../dist/src/dataset-editor/renderer/datasetClipboardController"
);
const { createClipboardResult } = require("../dist/src/core/clipboard/clipboardResult");


const checkConsumer = async function(method, kind, transition, readStatus = "ready") {
    let session = { providerId: "fixture", lifecycleGeneration: 1, status: "ready" };
    let objectName = "data";
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const calls = [];
    const effects = [];
    const input = { value: kind === "structured" ? "1\tOne\tTRUE" : "1\n2" };
    const originalText = input.value;
    const receipt = { status: "updated", objectName: "data", updated: 1, failed: 0,
        results: [{ status: "updated", objectName: "data" }] };
    const readReceipt = createClipboardResult({ status: readStatus,
        text: readStatus === "ready" ? "3\n4" : "", message: "Clipboard result" });
    const copyReceipt = createClipboardResult({ status: "copied", text: originalText });
    const firstResult = method === "readClipboard" || method === "pasteFromClipboard"
        ? readReceipt : method === "copyToClipboard" ? copyReceipt : receipt;
    const call = function(name, request, result) {
        calls.push([name, request]);
        return calls.length === 1 ? held : Promise.resolve(result);
    };
    const previousWindow = global.window;
    global.window = { dialogForge: {
        readClipboardText: () => call("read", undefined, readReceipt),
        copyPayloadToClipboard: value => call("copy", value, copyReceipt),
        writeCells: value => call("cells", value, receipt),
        writeVariableMetadata: value => call("metadata", value, receipt),
        writeValueLabels: value => call("labels", value, receipt),
        writeDeclaredMissing: value => call("missing", value, receipt)
    } };
    const record = name => {
        effects.push(name);
        if (transition === "render-retirement" && name === "paste") {
            session = { ...session, lifecycleGeneration: 2 };
        }
    };
    const controller = createDatasetClipboardController({
        pasteInput: input,
        getRuntimeSnapshot: () => session,
        getPreview: () => ({ status: "ready", objectName,
            columns: [{ name: "x" }], rows: [[1], [2]] }),
        getMetadata: () => ({ status: "ready", objectName,
            variables: [{ name: "x" }, { name: "y" }] }),
        getSelection: () => ({ objectName, rowIndex: 0, columnName: "x",
            kind: kind === "cell" ? "data-cell" : kind === "structured" ? "variable-cell" : "metadata-range",
            metadataKey: kind === "structured" ? "values" : "label",
            anchorRowIndex: 0, focusRowIndex: 1 }),
        getCopyPayload: () => ({ status: "ready", text: originalText,
            kind: kind === "structured" ? "variable-values-and-labels" : "data-cell" }),
        getPastePayload: () => null,
        renderCopyPayload: () => record("copy-payload"),
        renderClipboardResult: () => record("copy-result"),
        renderClipboardReadResult: () => record("read-result"),
        renderPastePayload: () => record("paste"),
        renderPasteApplyResult: () => record("apply-result"),
        refreshDataset: () => record("dataset"),
        refreshVariableMetadata: () => record("metadata"),
        refreshValueLabels: () => record("labels"),
        refreshDeclaredMissing: () => record("missing"),
        refreshRuntimeEvents: () => record("events")
    });
    try {
        const pending = controller[method](method === "copyToClipboard" ? { useSnapshot: true } : undefined);
        assert.equal(calls.length, 1);
        if (transition === "generation") {
            session = { ...session, lifecycleGeneration: 2 };
        } else if (transition === "provider") {
            session = { ...session, providerId: "replacement" };
        } else if (transition === "status") {
            session = { ...session, status: "stopped" };
        } else if (transition === "dataset") {
            objectName = "replacement";
        }
        release(firstResult);
        await pending;
        if (transition && transition !== "render-retirement") {
            assert.equal(calls.length, 1, "Retired owner must not dispatch another write");
            assert.deepEqual(effects, []);
            assert.equal(input.value, originalText);
        } else if (transition === "render-retirement") {
            assert.ok(!effects.includes("apply-result"));
            assert.ok(!effects.includes("events"));
        } else if (method === "copyToClipboard") {
            assert.deepEqual(effects, ["copy-payload", "copy-result"]);
        } else if (method === "readClipboard") {
            assert.deepEqual(effects, ["read-result", "paste"]);
        } else if (method === "pasteFromClipboard" && readStatus !== "ready") {
            assert.equal(calls.length, 1, "Failed clipboard read must not paste previous input");
            assert.equal(input.value, originalText);
        } else {
            assert.ok(effects.includes("apply-result"));
            assert.ok(effects.includes("events"));
            if (kind !== "cell") {
                assert.equal(calls.length, 2, "Both metadata targets must dispatch while current");
            }
        }
    } finally {
        if (previousWindow === undefined) {
            delete global.window;
        } else {
            global.window = previousWindow;
        }
    }
};


const main = async function() {
    for (const method of ["copyToClipboard", "readClipboard", "pasteFromClipboard", "applyPaste"]) {
        for (const transition of ["generation", "provider", "status", "dataset"]) {
            await checkConsumer(method, "cell", transition);
        }
        await checkConsumer(method, "cell", null);
    }
    for (const kind of ["cell", "metadata", "structured"]) {
        await checkConsumer("applyPaste", kind, "generation");
        await checkConsumer("applyPaste", kind, "render-retirement");
        await checkConsumer("applyPaste", kind, null);
    }
    await checkConsumer("pasteFromClipboard", "cell", null, "failed");
    await checkConsumer("pasteFromClipboard", "cell", null, "empty");
    console.log("Shared clipboard consumer cases passed (controlled renderer, not real clipboard/host acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
