"use strict";
const assert = require("node:assert/strict");
const { registerProductDialogRuntimeComposition } = require("../dist/src/shell-electron/dialog-runtime/productDialogRuntimeComposition");
const { dialogRuntimeIpcChannels } = require("../dist/src/dialog-runtime/dialogRuntimeIpc");
const delivery = require("../dist/src/runtime/commands/runtimeVisibleCommandDelivery");
const { createBrowserWebRSession } = require("../dist/src/runtime/providers/webr/webRBrowserSession");
const { createRuntimeCommandReceipt, requireSuccessfulRuntimeCommand } = require("../dist/src/runtime/commands/runtimeCommandReceipt");
const { createProductDialogCommandResultFromRuntime } = require("../dist/src/dialog-runtime/dialogCommandResult");

const main = async function() {
    for (const scenario of [
        { name: "session_lost", executionDisposition: "session_lost", successful: false },
        { name: "not_started", executionDisposition: "not_started", successful: false },
        { name: "interrupted", executionDisposition: "completed", evaluationOutcome: "interrupted", successful: false },
        { name: "error", executionDisposition: "completed", evaluationOutcome: "error", successful: false },
        { name: "success", executionDisposition: "completed", evaluationOutcome: "success", successful: true }
    ]) {
        const result = { executionDisposition: scenario.executionDisposition,
            evaluationOutcome: scenario.evaluationOutcome, transcriptEvents: [], workspaceUpdate: null };
        const contradictory = { ok: true, ...result };
        assert.equal(createProductDialogCommandResultFromRuntime("scoped()", contradictory).ok, scenario.successful,
            "Shared dialog consumer must not trust contradictory ok=true.");
        if (scenario.successful) {
            requireSuccessfulRuntimeCommand(contradictory, "scoped failure");
        } else {
            assert.throws(() => requireSuccessfulRuntimeCommand(contradictory, "scoped failure"), /scoped failure/);
        }
        const retired = createRuntimeCommandReceipt({ ...result,
            transcriptEvents: [{ type: "output", message: "retired output" }] }, false);
        assert.equal(retired.ok, false);
        assert.deepEqual(retired.transcriptEvents, [], "Retired adapter receipt cannot republish stale transcript.");
        assert.equal(retired.evaluationOutcome, scenario.evaluationOutcome, "Known evaluation evidence retained separately.");
        for (const visibility of ["visible", "hidden"]) {
            const handlers = new Map();
            let legacyCalls = 0;
            let retainedCalls = 0;
            let refreshes = 0;
            registerProductDialogRuntimeComposition({
                ipcMain: { on() {}, handle: (channel, handler) => handlers.set(channel, handler) },
                productId: "scoped-product", getUiCommandVisibility: () => visibility,
                runtimeSessionManager: {
                    getSnapshot: () => ({ providerId: "r", status: "ready", lifecycleGeneration: 1 }),
                    executeVisibleCommand: async () => { legacyCalls++; return []; },
                    executeVisibleCommandWithEffects: async () => { retainedCalls++; return result; }
                },
                executeVisibleCommandAndBroadcast: async () => { legacyCalls++; return []; },
                executeVisibleCommandReceiptAndBroadcast: async () => {
                    retainedCalls++;
                    return { ok: scenario.successful, transcriptEvents: [], ...result };
                },
                openImportFile: async () => {}, previewImportFile: async () => {},
                sendTranscriptEvents() {}, invalidateDatasetPreview() {},
                refreshWorkspaceAndBroadcast: async () => { refreshes++; },
                broadcastRuntimeEvents: async () => {}, reportError: error => { throw error; }
            });
            const received = await handlers.get(dialogRuntimeIpcChannels.runVisibleCommand)(null, { command: "scoped()" });
            assert.equal(received.ok, scenario.successful, "Native " + visibility + " receipt must honor " + scenario.name);
            assert.equal(legacyCalls, 0, "Do not execute the lossy array-only adapter.");
            assert.equal(retainedCalls, 1, "Execute once through retained result path.");
            if (scenario.executionDisposition !== "completed") {
                assert.equal(refreshes, 0, "No post-loss/unsent workspace refresh.");
            }
        }
        const original = delivery.createRuntimeVisibleCommandDelivery;
        try {
            delivery.createRuntimeVisibleCommandDelivery = () => async () => ({
                accepted: scenario.executionDisposition !== "session_lost", result
            });
            const session = createBrowserWebRSession({
                runtimeControlClient: {}, visibleCommands: { readConsoleOutputWidth: () => 80, recordTranscriptEvents() {} },
                workspaceChanged: async () => {}
            });
            const receipt = await session.executeVisibleCommand("scoped()");
            assert.equal(receipt.ok, scenario.successful, "WebR thin receipt adapter must honor " + scenario.name);
        } finally {
            delivery.createRuntimeVisibleCommandDelivery = original;
        }
    }
    for (const scenario of ["current", "retired", "not_started", "refresh-failed"]) {
        let generation = 1;
        let refreshes = 0;
        let eventRefreshes = 0;
        const runtime = {
            getSnapshot: () => ({ providerId: "r", status: "ready", lifecycleGeneration: generation }),
            executeVisibleCommandWithEffects: async () => ({
                executionDisposition: scenario === "not_started" ? "not_started" : "completed",
                evaluationOutcome: "error", workspaceUpdate: null,
                transcriptEvents: [{ type: "error", message: "actual error" }]
            })
        };
        const deliver = delivery.createRuntimeVisibleCommandDelivery({
            runtime, publishTranscript() {}, publishWorkspace: async () => {},
            refreshWorkspaceAfterCommand: async () => {
                refreshes++;
                if (scenario === "retired") generation++;
                if (scenario === "refresh-failed") throw Error("Scoped hidden refresh failed");
            },
            refreshRuntimeEvents: async () => { eventRefreshes++; }
        });
        if (scenario === "refresh-failed") {
            await assert.rejects(deliver({ text: "scoped()" }), /Scoped hidden refresh failed/);
            assert.equal(eventRefreshes, 0, "Preserve refresh failure propagation.");
        } else {
            const received = await deliver({ text: "scoped()" });
            assert.equal(received.accepted, scenario !== "retired");
            assert.equal(refreshes, scenario === "not_started" ? 0 : 1);
            assert.equal(eventRefreshes, scenario === "current" ? 1 : 0);
        }
    }
    console.log("Native visible/hidden dialog and WebR receipt adapters preserve shared command success semantics without replay.");
};
main().catch(error => { console.error(error); process.exitCode = 1; });
