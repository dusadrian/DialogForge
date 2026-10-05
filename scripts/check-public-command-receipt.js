"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { createRuntimeSessionIpcController } = require("../dist/src/shell-electron/runtime/runtimeSessionIpcController");
const { runtimeCommandIpcChannels, invokeRuntimeCommandRoute } = require("../dist/src/core/ipc/runtimeCommandIpc");
const { createRuntimeCommandReceipt, readAcceptedRuntimeCommandResult,
    requireSuccessfulRuntimeCommand } = require("../dist/src/runtime/commands/runtimeCommandReceipt");

const main = async function() {
    const file = "src/shell-electron/runtime/runtimeIpcComposition.ts";
    const parsed = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    let route;
    const visit = node => {
        if (ts.isCallExpression(node) && node.expression.getText(parsed) === "createRuntimeSessionIpcController") {
            route = node.arguments[0].properties.find(property =>
                property.name?.getText(parsed) === "executeVisibleCommand")?.initializer.getText(parsed);
        }
        ts.forEachChild(node, visit);
    };
    visit(parsed);
    assert.equal(route, "executeVisibleCommandReceiptAndBroadcast", "Public native route cannot select lossy transcript-only conversion.");

    for (const scenario of [
        { executionDisposition: "completed", evaluationOutcome: "success", ok: true },
        { executionDisposition: "completed", evaluationOutcome: "error", ok: false },
        { executionDisposition: "completed", evaluationOutcome: "interrupted", ok: false },
        { executionDisposition: "session_lost", evaluationOutcome: "success", ok: false },
        { executionDisposition: "not_started", ok: false }
    ]) {
        const handlers = new Map();
        let calls = 0;
        createRuntimeSessionIpcController({
            ipcMain: { on() {}, handle: (channel, handler) => handlers.set(channel, handler) },
            runtimeSessionManager: {},
            executeVisibleCommand: async request => {
                calls++;
                assert.equal(request.text, "scoped()");
                return createRuntimeCommandReceipt({ ...scenario, transcriptEvents: [], workspaceUpdate: null });
            }
        });
        const result = await invokeRuntimeCommandRoute({
            invoke: async (channel, input) => structuredClone(await handlers.get(channel)(null, input))
        }, runtimeCommandIpcChannels.executeVisible, { text: "scoped()", source: "receipt-route-fixture" });
        assert.equal(result.ok, scenario.ok);
        assert.equal(result.executionDisposition, scenario.executionDisposition);
        assert.equal(result.evaluationOutcome, scenario.evaluationOutcome);
        assert.equal(calls, 1, "Typed public route must not replay commands.");
        assert.equal(readAcceptedRuntimeCommandResult(result, true), result);
        if (scenario.ok) {
            requireSuccessfulRuntimeCommand(result, "scoped package failure");
        } else {
            assert.throws(() => requireSuccessfulRuntimeCommand(result, "scoped package failure"), /scoped package failure/);
        }
    }
    for (const invalid of [null, undefined, false, 0, "ok", {}, { ok: "true" }]) {
        assert.deepEqual(readAcceptedRuntimeCommandResult(invalid, true), { ok: false });
    }
    const legacy = [];
    assert.equal(readAcceptedRuntimeCommandResult(legacy, true), legacy);
    assert.deepEqual(readAcceptedRuntimeCommandResult(legacy, false), { ok: false });
    console.log("Public native route/serialization/shared main reader retain command receipts and reject invalid/retired values without replay.");
};
main().catch(error => { console.error(error); process.exitCode = 1; });
