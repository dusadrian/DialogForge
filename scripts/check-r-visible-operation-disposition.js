"use strict";
const assert = require("node:assert/strict");
const { createRImportController } = require("../dist/src/runtime/providers/r/controllers/rImportController");
const { createRTabularMutationController } = require("../dist/src/runtime/providers/r/controllers/rTabularMutationController");
const { createRTabularMetadataController } = require("../dist/src/runtime/providers/r/controllers/rTabularMetadataController");
const { transcriptHasFailure } = require("../dist/src/runtime/commands/commandProtocol");

const main = async function() {
    for (const providerId of ["r", "webr"]) {
        for (const scenario of [
            { name: "session_lost", executionDisposition: "session_lost", failed: true },
            { name: "not_started", executionDisposition: "not_started", failed: true },
            { name: "evaluated-error", executionDisposition: "completed", evaluationOutcome: "error", failed: true },
            { name: "evaluated-interrupted", executionDisposition: "completed", evaluationOutcome: "interrupted", failed: true },
            { name: "checked-success", executionDisposition: "completed", evaluationOutcome: "success", failed: false },
            { name: "legacy-success", failed: false },
            { name: "transcript-interrupted", transcriptEvents: [{ type: "completed", state: "interrupted" }], failed: true },
            { name: "transcript-error", transcriptEvents: [{ type: "error" }], failed: true }
        ]) {
            let executions = 0;
            const workspaceUpdate = { kind: "delta", workspaceRevision: 1, added: [], changed: [], removed: [] };
            const transcriptEvents = scenario.transcriptEvents || [];
            const bindings = {
                getClient: () => ({}), createRequestId: () => "scoped-visible-disposition",
                executeVisibleCommand: async () => {
                    executions++;
                    return {
                        executionDisposition: scenario.executionDisposition,
                        evaluationOutcome: scenario.evaluationOutcome,
                        transcriptEvents, workspaceUpdate, workspaceReconciliation: "applied"
                    };
                },
                transcriptHasFailure
            };
            const snapshot = { providerId, status: "ready", lifecycleGeneration: 1 };
            const controller = {
                ...createRImportController(bindings),
                ...createRTabularMutationController(bindings),
                ...createRTabularMetadataController(bindings)
            };
            const operations = ["importData", "renameColumn", "insertColumn", "removeColumn",
                "insertRow", "removeRow", "sortRows", "updateRowName", "writeCell",
                "writeVariableMetadata", "writeValueLabels", "writeDeclaredMissing"];
            for (const operation of operations) {
                const result = await controller[operation]({
                    source: "scoped-fixture.csv", format: "csv", targetName: "scoped_import",
                    objectName: "scoped_data", fromName: "before", toName: "after",
                    columnName: "value", newName: "new", referenceName: "value", position: "after",
                    rowIndex: 1, variableName: "value", metadataKey: "label", value: "new",
                    labels: [], values: [],
                    uiCommandVisibility: "visible", visibleCommandText: "scoped_fixture()"
                }, snapshot);
                const successful = result.status === (operation === "importData" ? "imported" : "updated");
                assert.equal(successful, !scenario.failed,
                    [providerId, operation, scenario.name, "must honor explicit failure without changing legacy success"].join(": "));
                assert.equal(result.workspaceUpdate, workspaceUpdate, "Accepted partial workspace receipt must survive.");
                assert.deepEqual(result.transcriptEvents, transcriptEvents, "No fabricated transcript error for interrupted input.");
            }
            assert.equal(executions, operations.length, "No failed command is retried.");
        }
    }
    assert.equal(transcriptHasFailure([{ type: "completed", state: "interrupted" }]), false,
        "Interruption is not reclassified as a transcript error.");
    console.log("Twelve shared visible operation consumers honor loss/error/interruption and preserve legacy success and partial receipts.");
};
main().catch(error => { console.error(error); process.exitCode = 1; });
