"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const receiptProtocol = require("../dist/src/runtime/commands/runtimeCommandReceipt");

// Execute the exact small production binding in isolation. This is not a
// substitute for package menu/rendered console acceptance.
const file = "src/base-app/features/main-window/mainCompositionRoot.ts";
const parsed = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
let callback;
const visit = function(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "mainRuntimeWorkflows") {
        const argument = node.initializer.arguments[0];
        callback = argument.properties.find(property => property.name?.getText(parsed) === "executeVisibleCommand")?.initializer;
    }
    ts.forEachChild(node, visit);
};
visit(parsed);
assert.ok(callback, "Exact production command receipt binding must be found.");
const printed = ts.createPrinter().printNode(ts.EmitHint.Expression, callback, parsed);
const compiled = ts.transpileModule("module.exports = " + printed, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;

const main = async function() {
    for (const accepted of [false, true]) {
        for (const result of [[], { ok: true, executionDisposition: "completed", evaluationOutcome: "success" },
            { ok: false, executionDisposition: "session_lost", evaluationOutcome: "success" },
            { ok: false, executionDisposition: "completed", evaluationOutcome: "interrupted" }]) {
            let calls = 0;
            const module = { exports: null };
            new Function("module", "mainConsoleCoordinator", "readAcceptedRuntimeCommandResult", compiled)(
                module,
                { executeWithReceipt: async () => { calls++; return { accepted, result }; } },
                receiptProtocol.readAcceptedRuntimeCommandResult
            );
            const received = await module.exports("scoped()", "scoped-binding");
            assert.equal(calls, 1, "Binding cannot replay the command.");
            if (accepted) {
                assert.equal(received, result, "The exact main binding must retain modern receipts as well as legacy events.");
            } else {
                assert.equal(received.ok, false, "Retired coordinator result cannot become command success.");
            }
        }
    }
    console.log("Exact main command binding retains accepted modern receipts/legacy events without replay or retired success.");
};
main().catch(error => { console.error(error); process.exitCode = 1; });
