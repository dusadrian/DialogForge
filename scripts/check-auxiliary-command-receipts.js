"use strict";
const assert = require("node:assert/strict");
const { createScriptChannelAdapter } = require("../dist/src/script-editor/scriptChannelAdapter");
const { createHelpCommandActions } = require("../dist/src/runtime/help/helpCommandActions");
const { runScriptCodeBatch } = require("../dist/src/script-editor/run/scriptCodeBatch");
const { createDatasetEditorIpcController } = require("../dist/src/shell-electron/dataset-editor/datasetEditorIpcController");
const { datasetEditorIpcChannels } = require("../dist/src/dataset-editor/datasetEditorIpc");
const { runtimeCommandResultSucceeded } = require("../dist/src/runtime/commands/runtimeCommandReceipt");
const fs = require("node:fs");
const ts = require("typescript");

const browserFile = "src/shell-web/pages/shell.js";
const parsed = ts.createSourceFile(browserFile, fs.readFileSync(browserFile, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let browserDatasetCallback;
const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "browserPreloadChannelBridge") {
        browserDatasetCallback = node.initializer.arguments[0].properties.find(property =>
            property.name?.getText(parsed) === "runVisibleDataEditorCommand");
    }
    ts.forEachChild(node, visit);
};
visit(parsed);
assert.ok(browserDatasetCallback, "Exact browser dataset callback must be found.");
const browserCode = ts.createPrinter().printNode(ts.EmitHint.Unspecified, browserDatasetCallback, parsed);

const main = async function() {
    for (const providerId of ["r", "webr"]) {
        for (const scenario of [
            { name: "lost", executionDisposition: "session_lost", evaluationOutcome: "success", calls: 1, status: "unavailable" },
            { name: "unsent", executionDisposition: "not_started", calls: 1, status: "unavailable" },
            { name: "interrupted", executionDisposition: "completed", evaluationOutcome: "interrupted", calls: 1, status: "interrupted" },
            { name: "unspecified-failure", calls: 1, status: "unavailable" },
            { name: "success", executionDisposition: "completed", evaluationOutcome: "success", calls: 2, status: "submitted" },
            { name: "ordinary-error", executionDisposition: "completed", evaluationOutcome: "error", calls: 2, status: "submitted" }
        ]) {
            let calls = 0;
            const boundaries = [];
            const receipt = { ok: scenario.name === "success", ...scenario,
                transcriptEvents: [{ type: "output", message: providerId + " " + scenario.name }] };
            const adapter = createScriptChannelAdapter({
                ensureRuntimeReady: async () => true,
                executeVisibleCommand: async () => { calls++; return receipt; },
                publishCommandBoundary: code => boundaries.push(code)
            });
            const result = await adapter.runCodeBatch({ chunks: ["scoped_first()", "scoped_second()"] });
            assert.equal(calls, scenario.calls, providerId + ": Script must stop remaining chunks for " + scenario.name);
            assert.equal(result.status, scenario.status);
            assert.equal(boundaries.length, scenario.executionDisposition === "completed" ? calls : 0);
            assert.equal(result.events.length, calls, "Returned events must survive the channel adapter.");
            calls = 0;
            boundaries.length = 0;
            const direct = await runScriptCodeBatch({ chunks: ["scoped_first()", "scoped_second()"] }, {
                ensureRuntimeReady: async () => true,
                executeVisibleCommand: async () => { calls++; return receipt; },
                publishCommandBoundary: code => boundaries.push(code)
            });
            assert.equal(direct.status, result.status);
            assert.deepEqual(direct.events, result.events);
            assert.equal(calls, scenario.calls, "Direct native runner and channel adapter must use same stopping policy.");
        }
        for (const scenario of [
            { executionDisposition: "session_lost", evaluationOutcome: "success" },
            { executionDisposition: "not_started" },
            { executionDisposition: "completed", evaluationOutcome: "interrupted" },
            { executionDisposition: "completed", evaluationOutcome: "error" }
        ]) {
            const actions = createHelpCommandActions({
                executeVisibleCommand: async () => ({ ok: true, ...scenario, transcriptEvents: [] }),
                openHelpTopic: async () => ({ status: "ready" })
            });
            assert.equal((await actions.runExample({ topic: "mean" })).status, "error",
                providerId + ": Help receipt cannot report contradictory success.");
            const handlers = new Map();
            const receipt = { ok: true, ...scenario, transcriptEvents: [] };
            createDatasetEditorIpcController({
                translate: (key) => key,
                ipcMain: { on() {}, handle: (channel, handler) => handlers.set(channel, handler) },
                runtimeSessionManager: {}, datasetEditorWindowController: {},
                uiCommandVisibility: () => "visible", executeVisibleCommand: async () => receipt
            });
            assert.equal(await handlers.get(datasetEditorIpcChannels.runVisibleCommand)(null, { command: "scoped()" }), false);
            const browser = new Function("executeVisibleCommand", "runtimeCommandResultSucceeded",
                "return ({" + browserCode + "}).runVisibleDataEditorCommand;")(
                async () => receipt, runtimeCommandResultSucceeded
            );
            assert.equal(await browser({ command: "scoped()" }), false,
                "Exact browser dataset callback must use same receipt classifier.");
        }
    }
    console.log("Shared script/help consumers preserve receipts, stop loss/unsent/interruption, and retain ordinary error chunk behavior.");
};
main().catch(error => { console.error(error); process.exitCode = 1; });
