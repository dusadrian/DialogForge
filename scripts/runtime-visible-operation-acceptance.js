"use strict";

const { createRImportController } = require("../dist/src/runtime/providers/r/controllers/rImportController");
const { createRTabularMutationController } = require("../dist/src/runtime/providers/r/controllers/rTabularMutationController");
const { createRTabularMetadataController } = require("../dist/src/runtime/providers/r/controllers/rTabularMetadataController");
const { transcriptHasFailure } = require("../dist/src/runtime/commands/commandProtocol");
const { createRuntimeCommandReceipt } = require("../dist/src/runtime/commands/runtimeCommandReceipt");

// Use the same operation consumers with actual command results from either
// adapter. A controlled reply gate delays delivery, not R evaluation.
exports.checkActualVisibleOperationDisposition = async function(options) {
    const operations = ["importData", "renameColumn", "insertColumn", "removeColumn",
        "insertRow", "removeRow", "sortRows", "updateRowName", "writeCell",
        "writeVariableMetadata", "writeValueLabels", "writeDeclaredMissing"];
    let captured;
    let executions = 0;
    let commandSequence = 0;
    let commandText;
    const bindings = {
        getClient: () => ({}),
        createRequestId: () => "actual-visible-operation",
        executeVisibleCommand: async code => {
            executions++;
            const result = await options.execute(code, "answer", { inspectJournal: false });
            captured = {
                executionDisposition: result.executionDisposition,
                evaluationOutcome: result.outcome,
                transcriptEvents: result.returnedEvents,
                workspaceUpdate: result.workspaceUpdate,
                workspaceReconciliation: result.workspaceReconciliation
            };
            return captured;
        },
        transcriptHasFailure
    };
    const controller = {
        ...createRImportController(bindings),
        ...createRTabularMutationController(bindings),
        ...createRTabularMetadataController(bindings)
    };
    const invoke = operation => controller[operation]({
        source: "scoped-fixture.csv", format: "csv", targetName: "scoped_import",
        objectName: "scoped_data", variableName: "value", metadataKey: "label", value: "new",
        uiCommandVisibility: "visible", visibleCommandText: commandText
    }, { providerId: options.host === "native" ? "r" : "webr", status: "ready" });
    const observations = [];
    try {
        for (const outcome of ["success", "error"]) {
            for (const operation of operations) {
                commandText = "actual_operation_value <- " + (++commandSequence) + "L"
                    + (outcome === "error" ? '; stop("actual operation partial failure")' : "");
                const count = executions;
                const result = await invoke(operation);
                const successful = result.status === (operation === "importData" ? "imported" : "updated");
                const receipt = createRuntimeCommandReceipt(captured);
                if (successful !== (outcome === "success") || captured.evaluationOutcome !== outcome
                    || receipt.ok !== successful || receipt.evaluationOutcome !== outcome
                    || !captured.workspaceUpdate?.workspaceRevision
                    || result.workspaceUpdate !== captured.workspaceUpdate || executions !== count + 1) {
                    throw Error(options.host + ": Actual operation outcome/partial receipt/replay differed: " + operation);
                }
                observations.push({ operation, actualOutcome: outcome, status: result.status,
                    commandReceiptOk: receipt.ok, acceptedPartialReceiptRetained: true, replayed: false });
            }
        }
        for (const operation of ["importData", "renameColumn", "writeVariableMetadata"]) {
            const probe = options.captureProbe();
            probe.arm("late-success");
            commandText = "actual_retired_operation <- 41L";
            const count = executions;
            const pending = invoke(operation);
            try {
                const producer = await probe.waitForReply();
                if (!producer.ok || producer.outcome !== "success") {
                    throw Error(options.host + ": Operation gate did not follow actual R success");
                }
                const replacement = await options.restart("clean");
                if (replacement.status !== "ready") throw Error(options.host + ": Replacement not ready");
                probe.release();
                const result = await pending;
                const receipt = createRuntimeCommandReceipt(captured, false);
                if (captured.executionDisposition !== "session_lost"
                    || receipt.ok || receipt.transcriptEvents.length
                    || result.status === "imported" || result.status === "updated"
                    || result.workspaceUpdate || result.transcriptEvents.length || executions !== count + 1) {
                    throw Error(options.host + ": Actual retired operation reported success/effects or replayed");
                }
                observations.push({ operation, actualOutcome: producer.outcome,
                    deliveredDisposition: captured.executionDisposition, status: result.status,
                    commandReceiptOk: receipt.ok, retiredEffects: false, replayed: false });
            } finally {
                probe.release();
            }
        }
        const recovered = await options.execute(
            'stopifnot(!exists("actual_retired_operation")); actual_operation_recovered <- 42L', "answer");
        if (recovered.outcome !== "success" || !recovered.workspaceUpdate?.workspaceRevision) {
            throw Error(options.host + ": Actual operation recovery failed");
        }
        return { host: options.host, observations, actualRProducer: true,
            sharedOperationConsumers: true, controlledReplyGate: true, recoveryOutcome: recovered.outcome,
            renderedProductChecked: false };
    } finally {
        await options.restart("clean");
    }
};
