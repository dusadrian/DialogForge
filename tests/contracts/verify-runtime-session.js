"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { getRuntimeProvider } = require("../../shared/runtime/providers/runtimeProviderRegistry");
const { createRuntimeSessionManager } = require("../../shared/runtime/session/runtimeSessionManager");
const { createVisibleCommandRequest } = require("../../shared/runtime/commands/commandProtocol");
const { createImportRequest } = require("../../shared/runtime/tabular-data/importProtocol");
const { createHelpTopicRequest } = require("../../shared/runtime/help/helpProtocol");
const { createCompletionRequest } = require("../../shared/runtime/completions/completionProtocol");
const { createDependencyCheckRequest } = require("../../shared/runtime/dependencies/dependencyProtocol");
const { createInvisibleQueryRequest } = require("../../shared/runtime/queries/invisibleQueryProtocol");
const { createInvisibleMutationRequest } = require("../../shared/runtime/queries/invisibleMutationProtocol");
const { createDialogExecutionRequest } = require("../../shared/runtime/dialogs/dialogExecutionProtocol");
const { createProductCommandRequest } = require("../../shared/runtime/product-commands/productCommandProtocol");
const { createCompositeDialogExternalCallHost } = require("../../shared/dialog-runtime/custom-js/compositeExternalCallHost");
const { createDialogExternalCallHost } = require("../../shared/dialog-runtime/custom-js/externalCallHost");
const { createPromptAnswerRequest, createPromptRequest } = require("../../shared/runtime/prompts/promptProtocol");
const { createStartupTaskExecutionRequest } = require("../../shared/runtime/startup/startupTaskProtocol");
const { createCellUpdateRequest, createColumnInsertRequest, createColumnRemoveRequest, createColumnRenameRequest, createDeclaredMissingUpdateRequest, createRowInsertRequest, createRowNameUpdateRequest, createRowRemoveRequest, createValueLabelUpdateRequest, createVariableMetadataUpdateRequest } = require("../../shared/runtime/tabular-data/tabularProtocol");
const createManager = function (runtimeId, options = {}) {
    return createRuntimeSessionManager(getRuntimeProvider(runtimeId), options);
};
const createFakeProductExternalCallHost = function () {
    return {
        supports: function (name) {
            return name === "fake.preview";
        },
        call: async function (name) {
            if (name === "fake.preview") {
                return {
                    status: "ready",
                    name,
                    value: { rendered: true },
                    message: "Fake product call resolved."
                };
            }

            return {
                status: "unsupported",
                name,
                value: null,
                message: "Fake product call is not implemented."
            };
        }
    };
};
const verifyPlaceholderLifecycle = async function () {
    const manager = createManager("r");
    assert.deepStrictEqual(manager.getSnapshot(), {
        providerId: "r",
        status: "not-started",
        connection: "registered",
        message: "R runtime provider is registered, but no R process is started yet."
    });
    const started = await manager.start();
    assert.strictEqual(started.status, "ready");
    assert.strictEqual(started.connection, "registered");
    const events = await manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "1 + 1",
        source: "contract-test"
    }));
    assert.deepStrictEqual(events.map((event) => {
        return event.type;
    }), ["submitted", "output", "completed"]);
    assert.strictEqual(events[0].commandKind, "commands.visible");
    assert.strictEqual(events[0].source, "contract-test");
    assert.strictEqual(events[0].text, "1 + 1");
    const stopped = await manager.stop();
    assert.strictEqual(stopped.status, "stopped");
    assert.strictEqual(stopped.connection, "registered");
};
const verifyPlaceholderProductCommand = async function () {
    const manager = createManager("r");
    await manager.start();
    const result = await manager.executeProductCommand(createProductCommandRequest({
        productId: "TestProduct",
        command: "TestProduct.packages.installRequired",
        label: "Install required R packages",
        capability: "TestProduct.packages.required",
        rPackages: ["fakepkg", "missing_placeholder_package"],
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "partial");
    assert.strictEqual(result.command, "TestProduct.packages.installRequired");
    assert.ok(result.message.includes("missing_placeholder_package"));
    assert.deepStrictEqual(result.transcriptEvents.map((event) => {
        return event.type;
    }), ["submitted", "output", "completed"]);
    assert.ok(result.transcriptEvents.some((event) => {
        return String(event.message || "").includes("available: fakepkg placeholder");
    }));
    const events = await manager.listRuntimeEvents();
    assert.strictEqual(events.events[0].type, "product.command.executed");
    assert.strictEqual(events.events[0].payload.command, "TestProduct.packages.installRequired");
};
const verifyWorkspaceRequiresReadySession = async function () {
    const manager = createManager("r");
    const workspace = await manager.listWorkspaceObjects();
    assert.strictEqual(workspace.status, "unavailable");
    assert.strictEqual(workspace.message, "Runtime session is not ready.");
    assert.deepStrictEqual(workspace.objects, []);
};
const verifyRuntimeEventsRequireReadySession = async function () {
    const manager = createManager("r");
    const events = await manager.listRuntimeEvents();
    assert.strictEqual(events.status, "unavailable");
    assert.deepStrictEqual(events.events, []);
};
const verifyPromptsRequireReadySession = async function () {
    const manager = createManager("r");
    const list = await manager.listPrompts();
    const requested = await manager.requestPrompt(createPromptRequest({
        prompt: "Enter value",
        kind: "text",
        source: "contract-test"
    }));
    const answered = await manager.answerPrompt(createPromptAnswerRequest({
        promptId: "prompt-1",
        answer: "42"
    }));
    assert.strictEqual(list.status, "unavailable");
    assert.strictEqual(requested.status, "unavailable");
    assert.strictEqual(answered.status, "unavailable");
};
const verifyStartupTaskRequiresReadySession = async function () {
    const manager = createManager("r", {
        startupTasks: [
            {
                id: "fake-packages",
                owner: "tests/fixtures/product-dialogs/fake",
                enabled: true,
                missing: [],
                reason: "",
                replacement: "Check placeholder packages."
            }
        ]
    });
    const result = await manager.executeStartupTask(createStartupTaskExecutionRequest({
        taskId: "fake-packages",
        owner: "tests/fixtures/product-dialogs/fake"
    }));
    assert.strictEqual(result.status, "unavailable");
};
const verifyPlaceholderWorkspace = async function () {
    const manager = createManager("r");
    await manager.start();
    const workspace = await manager.listWorkspaceObjects();
    assert.strictEqual(workspace.status, "ready");
    assert.strictEqual(workspace.providerId, "r");
    assert.strictEqual(workspace.objects.length, 2);
    assert.strictEqual(workspace.objects[0].name, "sample_data");
    assert.strictEqual(workspace.objects[0].kind, "data.frame");
    assert.deepStrictEqual(workspace.objects[0].capabilities, [
        "tabular.schema",
        "tabular.read",
        "tabular.writeCells",
        "tabular.writeColumns",
        "tabular.writeRows",
        "tabular.columnNames",
        "tabular.rowNames",
        "tabular.variableMetadata"
    ]);
};
const verifyPlaceholderRuntimeEvents = async function () {
    const manager = createManager("r", {
        dialogs: [{ id: "import", owner: "shared/base-app", targetHome: "shared/base-app/dialogs/import", status: "planned" }]
    });
    await manager.start();
    await manager.importData(createImportRequest({
        source: "/tmp/data.csv",
        format: "csv",
        targetName: "data"
    }));
    await manager.setActiveDataset("data");
    await manager.writeCell(createCellUpdateRequest({
        objectName: "data",
        rowIndex: 0,
        columnName: "value",
        value: 2
    }));
    await manager.writeVariableMetadata(createVariableMetadataUpdateRequest({
        objectName: "data",
        variableName: "value",
        label: "Imported value"
    }));
    await manager.renameColumn(createColumnRenameRequest({
        objectName: "data",
        fromName: "value",
        toName: "renamed_value"
    }));
    await manager.executeDialog(createDialogExecutionRequest({
        dialogId: "import",
        owner: "shared/base-app",
        inputs: {},
        source: "contract-test"
    }));
    const events = await manager.listRuntimeEvents();
    assert.strictEqual(events.status, "ready");
    assert.deepStrictEqual(events.events.map((event) => {
        return event.type;
    }), [
        "dialog.execution.planned",
        "tabular.column.renamed",
        "tabular.variableMetadata.updated",
        "tabular.cell.updated",
        "workspace.activeDataset.selected",
        "workspace.object.imported"
    ]);
    assert.strictEqual(events.events[4].objectName, "data");
    assert.strictEqual(events.events[5].objectName, "data");
};
const verifyProviderRuntimeEvents = async function () {
    const manager = createRuntimeSessionManager({
        manifest: {
            id: "r",
            label: "R",
            language: "r",
            status: "implemented",
            capabilities: ["commands.visible", "plots"]
        },
        createSession: function () {
            return {
                providerId: "r",
                status: "not-started",
                connection: "registered",
                message: "Test provider."
            };
        },
        eventController: {
            listRuntimeEvents: async function () {
                return [
                    {
                        type: "plot",
                        providerId: "r",
                        objectName: "plot-signature",
                        detail: "Plot available.",
                        payload: {
                            status: "available",
                            viewerUrl: "http://127.0.0.1:1234/live"
                        },
                        createdAt: "2026-06-04T00:00:00.000Z"
                    }
                ];
            }
        }
    });
    await manager.start();
    const events = await manager.listRuntimeEvents();
    assert.strictEqual(events.status, "ready");
    assert.strictEqual(events.events.length, 1);
    assert.strictEqual(events.events[0].type, "plot");
    assert.strictEqual(events.events[0].payload.status, "available");
    assert.strictEqual(events.events[0].payload.viewerUrl, "http://127.0.0.1:1234/live");
};
const verifyPlaceholderPrompts = async function () {
    const manager = createManager("r");
    await manager.start();
    const requested = await manager.requestPrompt(createPromptRequest({
        prompt: "Enter value",
        kind: "text",
        source: "contract-test"
    }));
    const list = await manager.listPrompts();
    const answered = await manager.answerPrompt(createPromptAnswerRequest({
        promptId: requested.prompt.id,
        answer: "42"
    }));
    const answeredAgain = await manager.answerPrompt(createPromptAnswerRequest({
        promptId: requested.prompt.id,
        answer: "43"
    }));
    const missing = await manager.answerPrompt(createPromptAnswerRequest({
        promptId: "missing",
        answer: "42"
    }));
    const invalid = await manager.requestPrompt(createPromptRequest({
        prompt: "",
        kind: "text",
        source: "contract-test"
    }));
    assert.strictEqual(requested.status, "queued");
    assert.strictEqual(requested.prompt.id, "prompt-1");
    assert.strictEqual(list.prompts.length, 1);
    assert.strictEqual(answered.status, "answered");
    assert.strictEqual(answered.prompt.answer, "42");
    assert.strictEqual(answeredAgain.status, "already-answered");
    assert.strictEqual(missing.status, "not-found");
    assert.strictEqual(invalid.status, "invalid");
};
const verifyObjectInspectionRequiresReadySession = async function () {
    const manager = createManager("r");
    const result = await manager.inspectObject("sample_data");
    assert.strictEqual(result.status, "unavailable");
    assert.strictEqual(result.message, "Runtime session is not ready.");
};
const verifyPlaceholderObjectInspection = async function () {
    const manager = createManager("r");
    await manager.start();
    const result = await manager.inspectObject("sample_data");
    const missing = await manager.inspectObject("missing_object");
    assert.strictEqual(result.status, "ready");
    assert.strictEqual(result.objectName, "sample_data");
    assert.strictEqual(result.kind, "data.frame");
    assert.deepStrictEqual(result.summary, [
        { name: "rows", value: "3" },
        { name: "columns", value: "3" }
    ]);
    assert.strictEqual(missing.status, "not-found");
};
const verifyTabularPreviewRequiresReadySession = async function () {
    const manager = createManager("r");
    const preview = await manager.readTabularPreview("sample_data");
    assert.strictEqual(preview.status, "unavailable");
    assert.strictEqual(preview.message, "Runtime session is not ready.");
};
const verifyActiveDatasetRequiresReadySession = async function () {
    const manager = createManager("r");
    const active = await manager.setActiveDataset("sample_data");
    assert.strictEqual(active.status, "unavailable");
    assert.strictEqual(active.message, "Runtime session is not ready.");
};
const verifyPlaceholderTabularPreview = async function () {
    const manager = createManager("r");
    await manager.start();
    const preview = await manager.readTabularPreview("sample_data");
    assert.strictEqual(preview.status, "ready");
    assert.strictEqual(preview.providerId, "r");
    assert.strictEqual(preview.objectName, "sample_data");
    assert.deepStrictEqual(preview.columns.map((column) => {
        return column.name;
    }), ["case", "condition", "outcome"]);
    assert.strictEqual(preview.rows.length, 3);
    const unsupported = await manager.readTabularPreview("sample_model");
    assert.strictEqual(unsupported.status, "not-tabular");
};
const verifyActiveDatasetSelection = async function () {
    const manager = createManager("r");
    await manager.start();
    const selected = await manager.setActiveDataset("sample_data");
    assert.strictEqual(selected.status, "selected");
    assert.strictEqual(selected.objectName, "sample_data");
    assert.strictEqual(manager.getActiveDataset().objectName, "sample_data");
    const preview = await manager.readTabularPreview("");
    assert.strictEqual(preview.status, "ready");
    assert.strictEqual(preview.objectName, "sample_data");
    const invalid = await manager.setActiveDataset("sample_model");
    assert.strictEqual(invalid.status, "invalid");
};
const verifyCellWriteRequiresReadySession = async function () {
    const manager = createManager("r");
    const result = await manager.writeCell(createCellUpdateRequest({
        objectName: "sample_data",
        rowIndex: 0,
        columnName: "condition",
        value: 0
    }));
    assert.strictEqual(result.status, "unavailable");
};
const verifyNameOperationsRequireReadySession = async function () {
    const manager = createManager("r");
    const column = await manager.renameColumn(createColumnRenameRequest({
        objectName: "sample_data",
        fromName: "condition",
        toName: "condition2"
    }));
    const row = await manager.updateRowName(createRowNameUpdateRequest({
        objectName: "sample_data",
        rowIndex: 0,
        name: "row1"
    }));
    const insertedColumn = await manager.insertColumn(createColumnInsertRequest({
        objectName: "sample_data",
        referenceName: "condition",
        newName: "inserted",
        position: "after"
    }));
    const removedColumn = await manager.removeColumn(createColumnRemoveRequest({
        objectName: "sample_data",
        columnName: "condition"
    }));
    const insertedRow = await manager.insertRow(createRowInsertRequest({
        objectName: "sample_data",
        rowIndex: 0,
        position: "after"
    }));
    const removedRow = await manager.removeRow(createRowRemoveRequest({
        objectName: "sample_data",
        rowIndex: 0
    }));
    assert.strictEqual(column.status, "unavailable");
    assert.strictEqual(row.status, "unavailable");
    assert.strictEqual(insertedColumn.status, "unavailable");
    assert.strictEqual(removedColumn.status, "unavailable");
    assert.strictEqual(insertedRow.status, "unavailable");
    assert.strictEqual(removedRow.status, "unavailable");
};
const verifyPlaceholderCellWrite = async function () {
    const manager = createManager("r");
    await manager.start();
    await manager.setActiveDataset("sample_data");
    const result = await manager.writeCell(createCellUpdateRequest({
        objectName: "",
        rowIndex: 0,
        columnName: "condition",
        value: 0
    }));
    assert.strictEqual(result.status, "updated");
    assert.strictEqual(result.objectName, "sample_data");
    const preview = await manager.readTabularPreview("");
    assert.strictEqual(preview.rows[0].condition, 0);
    const invalid = await manager.writeCell(createCellUpdateRequest({
        objectName: "sample_data",
        rowIndex: 20,
        columnName: "condition",
        value: 1
    }));
    assert.strictEqual(invalid.status, "invalid-cell");
};
const verifyPlaceholderNameOperations = async function () {
    const manager = createManager("r");
    await manager.start();
    await manager.setActiveDataset("sample_data");
    const result = await manager.renameColumn(createColumnRenameRequest({
        objectName: "",
        fromName: "condition",
        toName: "condition2"
    }));
    const preview = await manager.readTabularPreview("");
    const conflict = await manager.renameColumn(createColumnRenameRequest({
        objectName: "sample_data",
        fromName: "condition2",
        toName: "outcome"
    }));
    const missing = await manager.renameColumn(createColumnRenameRequest({
        objectName: "sample_data",
        fromName: "missing",
        toName: "missing2"
    }));
    const row = await manager.updateRowName(createRowNameUpdateRequest({
        objectName: "sample_data",
        rowIndex: 0,
        name: "row1"
    }));
    const rowNamePreview = await manager.readTabularPreview("sample_data");
    assert.strictEqual(result.status, "updated");
    assert.deepStrictEqual(preview.columns.map((column) => {
        return column.name;
    }), ["case", "outcome", "condition2"]);
    assert.strictEqual(conflict.status, "conflict");
    assert.strictEqual(missing.status, "invalid-column");
    assert.strictEqual(row.status, "updated");
    assert.strictEqual(rowNamePreview.rowNames[0], "row1");
};
const verifyPlaceholderStructuralOperations = async function () {
    const manager = createManager("r");
    await manager.start();
    await manager.setActiveDataset("sample_data");
    const insertedColumn = await manager.insertColumn(createColumnInsertRequest({
        objectName: "",
        referenceName: "condition",
        newName: "inserted",
        position: "after"
    }));
    let preview = await manager.readTabularPreview("");
    assert.strictEqual(insertedColumn.status, "updated");
    assert.deepStrictEqual(preview.columns.map((column) => {
        return column.name;
    }), ["case", "condition", "inserted", "outcome"]);
    const removedColumn = await manager.removeColumn(createColumnRemoveRequest({
        objectName: "",
        columnName: "inserted"
    }));
    const insertedRow = await manager.insertRow(createRowInsertRequest({
        objectName: "",
        rowIndex: 0,
        position: "after"
    }));
    preview = await manager.readTabularPreview("");
    assert.strictEqual(removedColumn.status, "updated");
    assert.deepStrictEqual(preview.columns.map((column) => {
        return column.name;
    }), ["case", "condition", "outcome"]);
    assert.strictEqual(insertedRow.status, "updated");
    assert.strictEqual(preview.rows.length, 4);
    const removedRow = await manager.removeRow(createRowRemoveRequest({
        objectName: "",
        rowIndex: 1
    }));
    preview = await manager.readTabularPreview("");
    assert.strictEqual(removedRow.status, "updated");
    assert.strictEqual(preview.rows.length, 3);
};
const verifyPlaceholderCellBatchWrite = async function () {
    const manager = createManager("r");
    await manager.start();
    await manager.setActiveDataset("sample_data");
    const result = await manager.writeCells([
        createCellUpdateRequest({
            objectName: "sample_data",
            rowIndex: 0,
            columnName: "condition",
            value: 1
        }),
        createCellUpdateRequest({
            objectName: "sample_data",
            rowIndex: 99,
            columnName: "condition",
            value: 0
        })
    ]);
    assert.strictEqual(result.status, "partial");
    assert.strictEqual(result.updated, 1);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.results.length, 2);
    assert.strictEqual(result.results[0].status, "updated");
    assert.strictEqual(result.results[1].status, "invalid-cell");
};
const verifyVariableMetadataRequiresReadySession = async function () {
    const manager = createManager("r");
    const metadata = await manager.readVariableMetadata("sample_data");
    assert.strictEqual(metadata.status, "unavailable");
};
const verifyPlaceholderVariableMetadata = async function () {
    const manager = createManager("r");
    await manager.start();
    await manager.setActiveDataset("sample_data");
    const metadata = await manager.readVariableMetadata("");
    assert.strictEqual(metadata.status, "ready");
    assert.strictEqual(metadata.objectName, "sample_data");
    assert.deepStrictEqual(metadata.variables.map((variable) => {
        return variable.role;
    }), ["id", "condition", "outcome"]);
};
const verifyVariableMetadataWriteRequiresReadySession = async function () {
    const manager = createManager("r");
    const result = await manager.writeVariableMetadata(createVariableMetadataUpdateRequest({
        objectName: "sample_data",
        variableName: "condition",
        label: "Edited condition"
    }));
    assert.strictEqual(result.status, "unavailable");
};
const verifyPlaceholderVariableMetadataWrite = async function () {
    const manager = createManager("r");
    await manager.start();
    await manager.setActiveDataset("sample_data");
    const result = await manager.writeVariableMetadata(createVariableMetadataUpdateRequest({
        objectName: "",
        variableName: "condition",
        label: "Edited condition"
    }));
    const metadata = await manager.readVariableMetadata("");
    const condition = metadata.variables.find((variable) => {
        return variable.name === "condition";
    });
    const invalid = await manager.writeVariableMetadata(createVariableMetadataUpdateRequest({
        objectName: "sample_data",
        variableName: "missing_variable",
        label: "Missing"
    }));
    assert.strictEqual(result.status, "updated");
    assert.strictEqual(result.objectName, "sample_data");
    assert.strictEqual(condition.label, "Edited condition");
    assert.strictEqual(invalid.status, "invalid-variable");
};
const verifyPlaceholderVariableMetadataKeyWrite = async function () {
    const manager = createManager("r");
    await manager.start();
    await manager.setActiveDataset("sample_data");
    const result = await manager.writeVariableMetadata(createVariableMetadataUpdateRequest({
        objectName: "",
        variableName: "condition",
        metadataKey: "measure",
        value: "nominal"
    }));
    const metadata = await manager.readVariableMetadata("");
    const condition = metadata.variables.find((variable) => {
        return variable.name === "condition";
    });
    assert.strictEqual(result.status, "updated");
    assert.strictEqual(result.metadataKey, "measure");
    assert.strictEqual(result.value, "nominal");
    assert.strictEqual(condition.measure, "nominal");
};
const verifyVariableMetadataWriteRequiresCapability = async function () {
    const manager = createManager("python");
    await manager.start();
    const result = await manager.writeVariableMetadata(createVariableMetadataUpdateRequest({
        objectName: "sample_frame",
        variableName: "score",
        label: "Score label"
    }));
    assert.strictEqual(result.status, "unsupported");
};
const verifyValueLabelsRequireReadySession = async function () {
    const manager = createManager("r");
    const labels = await manager.readValueLabels("sample_data");
    assert.strictEqual(labels.status, "unavailable");
};
const verifyPlaceholderValueLabels = async function () {
    const manager = createManager("r");
    await manager.start();
    await manager.setActiveDataset("sample_data");
    const labels = await manager.readValueLabels("");
    assert.strictEqual(labels.status, "ready");
    assert.strictEqual(labels.objectName, "sample_data");
    assert.strictEqual(labels.valueLabels.length, 2);
    assert.strictEqual(labels.valueLabels[0].variable, "condition");
    assert.deepStrictEqual(labels.valueLabels[0].labels[0], { value: 0, label: "Absent" });
};
const verifyPlaceholderValueLabelWrite = async function () {
    const manager = createManager("r");
    await manager.start();
    await manager.setActiveDataset("sample_data");
    const result = await manager.writeValueLabels(createValueLabelUpdateRequest({
        objectName: "",
        variableName: "condition",
        labels: [
            { value: 0, label: "No" },
            { value: 1, label: "Yes" }
        ]
    }));
    const labels = await manager.readValueLabels("");
    const condition = labels.valueLabels.find((entry) => {
        return entry.variable === "condition";
    });
    assert.strictEqual(result.status, "updated");
    assert.strictEqual(result.objectName, "sample_data");
    assert.deepStrictEqual(condition.labels[0], { value: 0, label: "No" });
};
const verifyDeclaredMissingRequiresReadySession = async function () {
    const manager = createManager("r");
    const missing = await manager.readDeclaredMissing("sample_data");
    assert.strictEqual(missing.status, "unavailable");
};
const verifyPlaceholderDeclaredMissing = async function () {
    const manager = createManager("r");
    await manager.start();
    await manager.setActiveDataset("sample_data");
    const missing = await manager.readDeclaredMissing("");
    assert.strictEqual(missing.status, "ready");
    assert.strictEqual(missing.objectName, "sample_data");
    assert.strictEqual(missing.declaredMissing.length, 2);
    assert.strictEqual(missing.declaredMissing[0].variable, "condition");
};
const verifyPlaceholderDeclaredMissingWrite = async function () {
    const manager = createManager("r");
    await manager.start();
    await manager.setActiveDataset("sample_data");
    const result = await manager.writeDeclaredMissing(createDeclaredMissingUpdateRequest({
        objectName: "",
        variableName: "condition",
        values: [
            { value: -7, label: "Refused" }
        ]
    }));
    const missing = await manager.readDeclaredMissing("");
    const condition = missing.declaredMissing.find((entry) => {
        return entry.variable === "condition";
    });
    assert.strictEqual(result.status, "updated");
    assert.strictEqual(result.objectName, "sample_data");
    assert.deepStrictEqual(condition.values[0], { value: -7, label: "Refused" });
};
const verifyImportRequiresReadySession = async function () {
    const manager = createManager("r");
    const result = await manager.importData(createImportRequest({
        source: "/tmp/data.csv",
        format: "csv",
        targetName: "data"
    }));
    assert.strictEqual(result.status, "unavailable");
};
const verifyPlaceholderImport = async function () {
    const manager = createManager("r");
    await manager.start();
    const result = await manager.importData(createImportRequest({
        source: "/tmp/data.csv",
        format: "csv",
        targetName: "data"
    }));
    assert.strictEqual(result.status, "planned");
    assert.strictEqual(result.targetName, "data");
    assert.deepStrictEqual(result.transcriptEvents.map((event) => {
        return event.type;
    }), ["submitted", "output", "completed"]);
    assert.strictEqual(result.transcriptEvents[0].commandKind, "data.import");
    const workspace = await manager.listWorkspaceObjects();
    const imported = workspace.objects.find((object) => {
        return object.name === "data";
    });
    const preview = await manager.readTabularPreview("data");
    assert.ok(imported);
    assert.strictEqual(imported.kind, "table");
    assert.ok(imported.capabilities.includes("tabular.rowNames"));
    assert.ok(imported.capabilities.includes("tabular.writeRows"));
    assert.deepStrictEqual(imported.provenance, {
        source: "/tmp/data.csv",
        format: "csv"
    });
    assert.strictEqual(preview.status, "ready");
    assert.strictEqual(preview.rows.length, 2);
    const active = await manager.setActiveDataset(result.targetName);
    const activePreview = await manager.readTabularPreview("");
    assert.strictEqual(active.status, "selected");
    assert.strictEqual(activePreview.objectName, "data");
};
const verifyUnsupportedImportFormatIsRejected = async function () {
    const manager = createManager("r");
    await manager.start();
    const result = await manager.importData(createImportRequest({
        source: "/tmp/data.xlsx",
        format: "excel",
        targetName: "data"
    }));
    assert.strictEqual(result.status, "unsupported-format");
    assert.strictEqual(result.format, "excel");
};
const verifyProviderImportControllerOwnsFormatSupport = async function () {
    const provider = {
        manifest: {
            id: "custom-import",
            label: "Custom Import",
            language: "custom",
            status: "implemented",
            capabilities: ["data.import"]
        },
        createSession: function () {
            return {
                providerId: "custom-import",
                status: "not-started",
                connection: "registered",
                message: "Custom import provider."
            };
        },
        importController: {
            supportsFormat: function (format) {
                return format === "custom-table";
            },
            importData: async function (request, snapshot) {
                return {
                    status: "imported",
                    providerId: snapshot.providerId,
                    source: request.source,
                    format: request.format,
                    targetName: request.targetName,
                    overwrite: request.overwrite,
                    transcriptEvents: [],
                    message: "Custom provider imported the table.",
                    importedAt: new Date().toISOString()
                };
            }
        }
    };
    const manager = createRuntimeSessionManager(provider);
    await manager.start();
    const result = await manager.importData(createImportRequest({
        source: "/tmp/data.custom",
        format: "custom-table",
        targetName: "custom_data"
    }));
    const unsupported = await manager.importData(createImportRequest({
        source: "/tmp/data.xlsx",
        format: "excel",
        targetName: "excel_data"
    }));
    assert.strictEqual(result.status, "imported");
    assert.strictEqual(result.providerId, "custom-import");
    assert.strictEqual(result.format, "custom-table");
    assert.strictEqual(unsupported.status, "unsupported-format");
    assert.strictEqual(unsupported.format, "excel");
};
const verifyDelimitedImportReadsExistingFile = async function () {
    const manager = createManager("python");
    const source = path.join(__dirname, "dialogforge-import-contract.csv");
    fs.writeFileSync(source, "case,score\nA,1\nB,0\n", "utf8");
    await manager.start();
    const result = await manager.importData(createImportRequest({
        source,
        format: "csv",
        targetName: "real_data"
    }));
    const preview = await manager.readTabularPreview("real_data");
    fs.unlinkSync(source);
    assert.strictEqual(result.status, "imported");
    assert.strictEqual(preview.status, "ready");
    assert.deepStrictEqual(preview.columns.map((column) => {
        return column.name;
    }), ["case", "score"]);
    assert.deepStrictEqual(preview.rows, [
        { case: "A", score: "1" },
        { case: "B", score: "0" }
    ]);
};
const verifyImportConflictPreservesExistingTarget = async function () {
    const manager = createManager("r");
    await manager.start();
    const first = await manager.importData(createImportRequest({
        source: "/tmp/data.csv",
        format: "csv",
        targetName: "data"
    }));
    const conflict = await manager.importData(createImportRequest({
        source: "/tmp/other.tsv",
        format: "tsv",
        targetName: "data"
    }));
    const workspace = await manager.listWorkspaceObjects();
    const imported = workspace.objects.find((object) => {
        return object.name === "data";
    });
    assert.strictEqual(first.status, "planned");
    assert.strictEqual(conflict.status, "conflict");
    assert.strictEqual(conflict.overwrite, false);
    assert.strictEqual(conflict.transcriptEvents.length, 0);
    assert.deepStrictEqual(imported.provenance, {
        source: "/tmp/data.csv",
        format: "csv"
    });
};
const verifyImportConflictPreservesProviderTarget = async function () {
    const manager = createManager("r");
    await manager.start();
    const conflict = await manager.importData(createImportRequest({
        source: "/tmp/other.tsv",
        format: "tsv",
        targetName: "sample_data"
    }));
    const preview = await manager.readTabularPreview("sample_data");
    assert.strictEqual(conflict.status, "conflict");
    assert.strictEqual(conflict.overwrite, false);
    assert.strictEqual(conflict.transcriptEvents.length, 0);
    assert.strictEqual(preview.status, "ready");
    assert.strictEqual(preview.rows.length, 3);
};
const verifyImportOverwriteReplacesExistingTarget = async function () {
    const manager = createManager("r");
    await manager.start();
    await manager.importData(createImportRequest({
        source: "/tmp/data.csv",
        format: "csv",
        targetName: "data"
    }));
    const overwrite = await manager.importData(createImportRequest({
        source: "/tmp/other.tsv",
        format: "tsv",
        targetName: "data",
        overwrite: true
    }));
    const workspace = await manager.listWorkspaceObjects();
    const imported = workspace.objects.find((object) => {
        return object.name === "data";
    });
    assert.strictEqual(overwrite.status, "planned");
    assert.strictEqual(overwrite.overwrite, true);
    assert.deepStrictEqual(imported.provenance, {
        source: "/tmp/other.tsv",
        format: "tsv"
    });
};
const verifyImportOverwriteReplacesProviderTarget = async function () {
    const manager = createManager("r");
    await manager.start();
    const overwrite = await manager.importData(createImportRequest({
        source: "/tmp/other.tsv",
        format: "tsv",
        targetName: "sample_data",
        overwrite: true
    }));
    const workspace = await manager.listWorkspaceObjects();
    const matches = workspace.objects.filter((object) => {
        return object.name === "sample_data";
    });
    const preview = await manager.readTabularPreview("sample_data");
    assert.strictEqual(overwrite.status, "planned");
    assert.strictEqual(overwrite.overwrite, true);
    assert.strictEqual(matches.length, 1);
    assert.deepStrictEqual(matches[0].provenance, {
        source: "/tmp/other.tsv",
        format: "tsv"
    });
    assert.strictEqual(preview.status, "ready");
    assert.strictEqual(preview.rows.length, 2);
};
const verifyCommandRequiresReadySession = async function () {
    const manager = createManager("r");
    const events = await manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "summary(data)",
        source: "contract-test"
    }));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "rejected");
    assert.strictEqual(events[0].message, "Runtime session is not ready.");
};
const verifyProductCommandRequiresReadySession = async function () {
    const manager = createManager("r");
    const result = await manager.executeProductCommand(createProductCommandRequest({
        productId: "TestProduct",
        command: "TestProduct.packages.installRequired",
        label: "Install required R packages",
        capability: "TestProduct.packages.required",
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "unavailable");
    assert.strictEqual(result.transcriptEvents.length, 1);
    assert.strictEqual(result.transcriptEvents[0].type, "rejected");
};
const verifyInvisibleQueryRequiresReadySession = async function () {
    const manager = createManager("r");
    const result = await manager.executeInvisibleQuery(createInvisibleQueryRequest({
        query: "workspace.objects()",
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "unavailable");
};
const verifyInvisibleMutationRequiresReadySession = async function () {
    const manager = createManager("r");
    const result = await manager.executeInvisibleMutation(createInvisibleMutationRequest({
        mutation: "lastSelection",
        value: "sample_data",
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "unavailable");
};
const verifyDialogExecutionRequiresReadySession = async function () {
    const manager = createManager("r", {
        dialogs: [{ id: "import", owner: "shared/base-app", targetHome: "shared/base-app/dialogs/import", status: "planned" }]
    });
    const result = await manager.executeDialog(createDialogExecutionRequest({
        dialogId: "import",
        owner: "shared/base-app",
        inputs: {},
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "unavailable");
};
const verifyHelpTopicRequiresReadySession = async function () {
    const manager = createManager("r");
    const result = await manager.readHelpTopic(createHelpTopicRequest({
        topic: "data.frame",
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "unavailable");
};
const verifyCompletionsRequireReadySession = async function () {
    const manager = createManager("r");
    const result = await manager.readCompletions(createCompletionRequest({
        prefix: "s",
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "unavailable");
};
const verifyDependencyChecksRequireReadySession = async function () {
    const manager = createManager("r");
    const result = await manager.checkDependencies(createDependencyCheckRequest({
        kind: "package",
        names: ["fakepkg"],
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "unavailable");
};
const verifyPlaceholderHelpTopic = async function () {
    const manager = createManager("r");
    await manager.start();
    const result = await manager.readHelpTopic(createHelpTopicRequest({
        topic: "data.frame",
        source: "contract-test"
    }));
    const invalid = await manager.readHelpTopic(createHelpTopicRequest({
        topic: "",
        source: "contract-test"
    }));
    const whitespace = await manager.readHelpTopic(createHelpTopicRequest({
        topic: "   ",
        source: " contract-test "
    }));
    assert.strictEqual(result.status, "ready");
    assert.strictEqual(result.topic, "data.frame");
    assert.strictEqual(result.kind, "single");
    assert.strictEqual(result.title, "Help: data.frame");
    assert.strictEqual(result.path, "");
    assert.deepStrictEqual(result.matches, []);
    assert.strictEqual(invalid.status, "invalid");
    assert.strictEqual(whitespace.status, "invalid");
};
const verifyPlaceholderCompletions = async function () {
    const manager = createManager("r");
    await manager.start();
    const result = await manager.readCompletions(createCompletionRequest({
        prefix: "sample",
        source: "contract-test"
    }));
    const emptyPrefix = await manager.readCompletions(createCompletionRequest({
        prefix: "",
        source: "contract-test"
    }));
    const trimmedPrefix = await manager.readCompletions(createCompletionRequest({
        prefix: " sample ",
        source: " contract-test "
    }));
    assert.strictEqual(result.status, "ready");
    assert.deepStrictEqual(result.items.map((item) => {
        return item.label;
    }), ["sample_data", "sample_model"]);
    assert.strictEqual(emptyPrefix.items.length, 3);
    assert.deepStrictEqual(trimmedPrefix.items.map((item) => {
        return item.label;
    }), ["sample_data", "sample_model"]);
};
const verifyPlaceholderInvisibleQuery = async function () {
    const manager = createManager("r");
    await manager.start();
    const result = await manager.executeInvisibleQuery(createInvisibleQueryRequest({
        query: "workspace.objects()",
        source: "contract-test"
    }));
    const invalid = await manager.executeInvisibleQuery(createInvisibleQueryRequest({
        query: "",
        source: "contract-test"
    }));
    const events = await manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "1 + 1",
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "ready");
    assert.strictEqual(result.value.workspaceObjects, 2);
    assert.strictEqual(invalid.status, "invalid");
    assert.strictEqual(events.length, 3);
};
const verifyInvisibleQueryRequiresCapability = async function () {
    const provider = {
        manifest: {
            id: "plain",
            label: "Plain",
            language: "plain",
            status: "implemented",
            capabilities: []
        },
        createSession: function () {
            return {
                providerId: "plain",
                status: "not-started",
                connection: "registered",
                message: "Plain runtime provider."
            };
        }
    };
    const manager = createRuntimeSessionManager(provider);
    await manager.start();
    const result = await manager.executeInvisibleQuery(createInvisibleQueryRequest({
        query: "workspace.objects()",
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "unsupported");
};
const verifyPlaceholderInvisibleMutation = async function () {
    const manager = createManager("r");
    await manager.start();
    const result = await manager.executeInvisibleMutation(createInvisibleMutationRequest({
        mutation: "lastSelection",
        value: "sample_data",
        source: "contract-test"
    }));
    const query = await manager.executeInvisibleQuery(createInvisibleQueryRequest({
        query: "session.state()",
        source: "contract-test"
    }));
    const invalid = await manager.executeInvisibleMutation(createInvisibleMutationRequest({
        mutation: "",
        value: "sample_data",
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "updated");
    assert.strictEqual(query.value.mutations.lastSelection, "sample_data");
    assert.strictEqual(invalid.status, "invalid");
};
const verifyInvisibleMutationRequiresCapability = async function () {
    const provider = {
        manifest: {
            id: "plain",
            label: "Plain",
            language: "plain",
            status: "implemented",
            capabilities: []
        },
        createSession: function () {
            return {
                providerId: "plain",
                status: "not-started",
                connection: "registered",
                message: "Plain runtime provider."
            };
        }
    };
    const manager = createRuntimeSessionManager(provider);
    await manager.start();
    const result = await manager.executeInvisibleMutation(createInvisibleMutationRequest({
        mutation: "lastSelection",
        value: "sample_data",
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "unsupported");
};
const verifyPlaceholderDialogExecution = async function () {
    const manager = createManager("r", {
        dialogs: [{ id: "import", owner: "shared/base-app", targetHome: "shared/base-app/dialogs/import", status: "planned" }]
    });
    await manager.start();
    const result = await manager.executeDialog(createDialogExecutionRequest({
        dialogId: "import",
        owner: "shared/base-app",
        inputs: {},
        source: "contract-test"
    }));
    const missing = await manager.executeDialog(createDialogExecutionRequest({
        dialogId: "missing",
        owner: "shared/base-app",
        inputs: {},
        source: "contract-test"
    }));
    const invalid = await manager.executeDialog(createDialogExecutionRequest({
        dialogId: "",
        owner: "shared/base-app",
        inputs: {},
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "planned");
    assert.strictEqual(result.dialogId, "import");
    assert.strictEqual(result.outputs.targetHome, "shared/base-app/dialogs/import");
    assert.strictEqual(missing.status, "not-registered");
    assert.strictEqual(invalid.status, "invalid");
};
const verifyDialogSourceExecution = async function () {
    const manager = createManager("r", {
        rootDir: require("path").resolve(__dirname, "../.."),
        dialogExternalCallHost: createDialogExternalCallHost(),
        dialogs: [
            {
                id: "fake",
                owner: "tests/fixtures/product-dialogs/fake",
                label: "Fake product dialog",
                targetHome: "tests/fixtures/product-dialogs/fake/dialogs/source/fake/",
                sourceFile: "source/fake/dialog.json",
                status: "source-imported",
                rPackages: ["fakepkg"]
            }
        ]
    });
    await manager.start();
    const result = await manager.executeDialog(createDialogExecutionRequest({
        dialogId: "fake",
        owner: "tests/fixtures/product-dialogs/fake",
        inputs: {},
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "source-loaded");
    assert.strictEqual(result.outputs.title, "Fake product dialog");
    assert.strictEqual(result.outputs.hasCustomJS, true);
    assert.ok(result.outputs.customJSUses.includes("run"));
    assert.ok(result.outputs.customJSUses.includes("callExternal"));
    assert.ok(result.outputs.externalCalls.includes("getDatasetVariablesForDialog"));
    assert.ok(result.outputs.externalCallPlan.supported.includes("getDatasetVariablesForDialog"));
    assert.ok(result.outputs.externalCallPlan.supported.includes("bindFrequenciesWorkspace"));
    assert.deepStrictEqual(result.outputs.productExternalCalls, []);
    assert.ok(result.outputs.sharedExternalCalls.includes("bindFrequenciesWorkspace"));
    assert.strictEqual(result.outputs.syntaxCommand, "");
    assert.strictEqual(result.outputs.defaultElementCount, 0);
    assert.ok(result.outputs.elementCount > 0);
    assert.strictEqual(result.outputs.controls.length, result.outputs.elementCount);
    assert.ok(result.outputs.controls.some((control) => {
        return control.name && control.type;
    }));
    assert.deepStrictEqual(result.outputs.dependencies, ["admisc", "declared"]);
};
const verifySharedImportSourceExecution = async function () {
    const manager = createManager("r", {
        rootDir: path.resolve(__dirname, "../.."),
        dialogExternalCallHost: createDialogExternalCallHost(),
        dialogs: [
            {
                id: "import",
                owner: "shared/base-app",
                label: "Import data",
                targetHome: "shared/base-app/dialogs/import",
                sourceFile: "source/import/dialog.json",
                status: "source-imported"
            }
        ]
    });
    await manager.start();
    const result = await manager.executeDialog(createDialogExecutionRequest({
        dialogId: "import",
        owner: "shared/base-app",
        inputs: {},
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "source-loaded");
    assert.strictEqual(result.outputs.title, "Import data");
    assert.strictEqual(result.outputs.hasCustomJS, true);
    assert.ok(result.outputs.customJSUses.includes("run"));
    assert.ok(result.outputs.customJSUses.includes("openImportFile"));
    assert.ok(result.outputs.customJSUses.includes("getImportPreview"));
    assert.deepStrictEqual(result.outputs.externalCalls, []);
    assert.deepStrictEqual(result.outputs.dependencies, []);
    assert.ok(result.outputs.elementCount > 0);
    assert.ok(result.outputs.controls.some((control) => {
        return control.name === "input1";
    }));
    assert.ok(result.outputs.controls.some((control) => {
        return control.name === "input2";
    }));
    assert.ok(result.outputs.controls.some((control) => {
        return control.name === "radio8";
    }));
    assert.ok(result.outputs.customJS.includes("DDIWR_BINARY_EXTENSIONS"));
};
const verifyDialogSourceExecutionUsesProductSettingsPackages = async function () {
    const manager = createManager("r", {
        rootDir: require("path").resolve(__dirname, "../.."),
        dialogExternalCallHost: createCompositeDialogExternalCallHost({
            shared: createDialogExternalCallHost(),
            products: {
                fake: createFakeProductExternalCallHost()
            }
        }),
        dialogs: [
            {
                id: "fake",
                owner: "tests/fixtures/product-dialogs/fake",
                label: "Fake product dialog",
                targetHome: "tests/fixtures/product-dialogs/fake/dialogs/source/fake/",
                sourceFile: "source/fake/dialog.json",
                status: "source-imported",
                rPackages: ["fakepkg"]
            }
        ]
    });
    await manager.start();
    const result = await manager.executeDialog(createDialogExecutionRequest({
        dialogId: "fake",
        owner: "tests/fixtures/product-dialogs/fake",
        inputs: {},
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "source-loaded");
    assert.deepStrictEqual(result.outputs.dependencies, ["fakepkg"]);
    assert.ok(result.outputs.productExternalCalls.includes("fake.preview"));
    assert.ok(result.outputs.externalCallPlan.supported.includes("fake.preview"));
    assert.ok(result.outputs.externalCallPlan.supported.includes("getDatasetVariablesForDialog"));
};
const verifyDialogExecutionRequiresCapability = async function () {
    const provider = {
        manifest: {
            id: "plain",
            label: "Plain",
            language: "plain",
            status: "implemented",
            capabilities: []
        },
        createSession: function () {
            return {
                providerId: "plain",
                status: "not-started",
                connection: "registered",
                message: "Plain runtime provider."
            };
        }
    };
    const manager = createRuntimeSessionManager(provider, {
        dialogs: [{ id: "import", owner: "shared/base-app", targetHome: "shared/base-app/dialogs/import", status: "planned" }]
    });
    await manager.start();
    const result = await manager.executeDialog(createDialogExecutionRequest({
        dialogId: "import",
        owner: "shared/base-app",
        inputs: {},
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "unsupported");
};
const verifyPlaceholderDependencyChecks = async function () {
    const manager = createManager("r");
    await manager.start();
    const ready = await manager.checkDependencies(createDependencyCheckRequest({
        kind: "package",
        names: ["fakepkg", "admisc"],
        source: "contract-test"
    }));
    const partial = await manager.checkDependencies(createDependencyCheckRequest({
        kind: "package",
        names: ["fakepkg", "missingPackage"],
        source: "contract-test"
    }));
    const invalid = await manager.checkDependencies(createDependencyCheckRequest({
        kind: "package",
        names: [],
        source: "contract-test"
    }));
    assert.strictEqual(ready.status, "ready");
    assert.deepStrictEqual(ready.items.map((item) => {
        return item.status;
    }), ["available", "available"]);
    assert.strictEqual(partial.status, "partial");
    assert.strictEqual(partial.items[1].status, "missing");
    assert.strictEqual(invalid.status, "invalid");
};
const verifyPlaceholderStartupTaskExecution = async function () {
    const manager = createManager("r", {
        startupTasks: [
            {
                id: "fake-packages",
                owner: "tests/fixtures/product-dialogs/fake",
                enabled: true,
                missing: [],
                reason: "",
                rPackages: ["fakepkg", "missing_startup_package"],
                replacement: "Check placeholder packages."
            },
            {
                id: "disabled-task",
                owner: "tests/fixtures/product-dialogs/fake",
                enabled: false,
                missing: ["dependencies.packages"],
                reason: "Missing dependency capability."
            },
            {
                id: "fake-workspace",
                owner: "tests/fixtures/product-dialogs/fake",
                enabled: true,
                missing: [],
                reason: "",
                requiredRuntime: ["workspace.objects"],
                replacement: "Prepare fakepkg workspace state."
            },
            {
                id: "combined-startup",
                owner: "tests/fixtures/product-dialogs/fake",
                enabled: true,
                missing: [],
                reason: "",
                rPackages: ["fakepkg"],
                requiredRuntime: ["workspace.objects"],
                replacement: "Prepare packages and workspace together."
            }
        ]
    });
    await manager.start();
    const planned = await manager.executeStartupTask(createStartupTaskExecutionRequest({
        taskId: "fake-packages",
        owner: "tests/fixtures/product-dialogs/fake"
    }));
    assert.strictEqual(planned.status, "partial");
    assert.strictEqual(planned.taskId, "fake-packages");
    assert.strictEqual(planned.message, "Placeholder dependency check completed.");
    const workspace = await manager.executeStartupTask(createStartupTaskExecutionRequest({
        taskId: "fake-workspace",
        owner: "tests/fixtures/product-dialogs/fake"
    }));
    assert.strictEqual(workspace.status, "ready");
    assert.match(workspace.message, /^Startup task refreshed [0-9]+ workspace object\(s\)\.$/);
    const combined = await manager.executeStartupTask(createStartupTaskExecutionRequest({
        taskId: "combined-startup",
        owner: "tests/fixtures/product-dialogs/fake"
    }));
    assert.strictEqual(combined.status, "ready");
    assert.ok(combined.message.includes("Placeholder dependency check completed."));
    assert.match(combined.message, /Startup task refreshed [0-9]+ workspace object\(s\)\./);
    const events = await manager.listRuntimeEvents();
    const startupEvents = events.events.filter((event) => {
        return event.type === "startup.task.executed";
    });
    assert.ok(startupEvents.some((event) => {
        return event.payload.taskId === "fake-packages";
    }));
    assert.ok(startupEvents.some((event) => {
        return event.payload.taskId === "fake-workspace";
    }));
    assert.ok(startupEvents.some((event) => {
        return event.payload.taskId === "combined-startup"
            && event.payload.dependencyStatus === "ready";
    }));
    assert.ok(startupEvents.some((event) => {
        return event.payload.taskId === "combined-startup"
            && typeof event.payload.objectCount === "number";
    }));
    const disabled = await manager.executeStartupTask(createStartupTaskExecutionRequest({
        taskId: "disabled-task",
        owner: "tests/fixtures/product-dialogs/fake"
    }));
    assert.strictEqual(disabled.status, "disabled");
    const missing = await manager.executeStartupTask(createStartupTaskExecutionRequest({
        taskId: "missing-task",
        owner: "tests/fixtures/product-dialogs/fake"
    }));
    assert.strictEqual(missing.status, "not-registered");
};
const verifyDependencyChecksRequireCapability = async function () {
    const manager = createManager("python");
    await manager.start();
    const result = await manager.checkDependencies(createDependencyCheckRequest({
        kind: "package",
        names: ["pandas"],
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "unsupported");
};
const verifyReservedLifecycle = async function () {
    const manager = createManager("python");
    const started = await manager.start();
    assert.strictEqual(started.providerId, "python");
    assert.strictEqual(started.status, "ready");
    assert.strictEqual(started.connection, "reserved");
    const workspace = await manager.listWorkspaceObjects();
    assert.strictEqual(workspace.status, "ready");
    assert.strictEqual(workspace.objects.length, 1);
    assert.strictEqual(workspace.objects[0].kind, "table");
    assert.ok(workspace.objects[0].capabilities.includes("tabular.rowNames"));
    const preview = await manager.readTabularPreview("sample_frame");
    assert.strictEqual(preview.status, "ready");
    assert.strictEqual(preview.columns.length, 2);
    assert.strictEqual(preview.rows.length, 2);
};
const verifyMissingLifecycle = async function () {
    const manager = createManager("ruby");
    const started = await manager.start();
    assert.strictEqual(started.providerId, "ruby");
    assert.strictEqual(started.status, "failed");
    assert.strictEqual(started.connection, "missing");
};
const verifyCommentOnlyRCommandsAreTranscriptOnly = function () {
    const source = fs.readFileSync(path.join(
        __dirname,
        "../../shared/runtime/providers/r/session/runtimeProcessController.ts"
    ), "utf8");

    assert.ok(source.includes("const isCommentOnlyRInput = function(commandText: string): boolean"));
    assert.ok(source.includes("trimmed.startsWith(\"#\")"));
    assert.ok(source.includes("if (isCommentOnlyRInput(request.text))"));
    assert.ok(source.includes("createTranscriptEvent(\"submitted\", request)"));
    assert.ok(source.includes("createTranscriptEvent(\"completed\", request"));
    assert.ok(!source.includes("createTranscriptEvent(\"output\", request, {\n                    message: \"NULL\""));
};
const run = async function () {
    verifyCommentOnlyRCommandsAreTranscriptOnly();
    await verifyCommandRequiresReadySession();
    await verifyProductCommandRequiresReadySession();
    await verifyInvisibleQueryRequiresReadySession();
    await verifyInvisibleMutationRequiresReadySession();
    await verifyDialogExecutionRequiresReadySession();
    await verifyWorkspaceRequiresReadySession();
    await verifyRuntimeEventsRequireReadySession();
    await verifyPromptsRequireReadySession();
    await verifyStartupTaskRequiresReadySession();
    await verifyObjectInspectionRequiresReadySession();
    await verifyTabularPreviewRequiresReadySession();
    await verifyActiveDatasetRequiresReadySession();
    await verifyCellWriteRequiresReadySession();
    await verifyNameOperationsRequireReadySession();
    await verifyVariableMetadataRequiresReadySession();
    await verifyVariableMetadataWriteRequiresReadySession();
    await verifyValueLabelsRequireReadySession();
    await verifyDeclaredMissingRequiresReadySession();
    await verifyImportRequiresReadySession();
    await verifyUnsupportedImportFormatIsRejected();
    await verifyProviderImportControllerOwnsFormatSupport();
    await verifyHelpTopicRequiresReadySession();
    await verifyCompletionsRequireReadySession();
    await verifyDependencyChecksRequireReadySession();
    await verifyPlaceholderLifecycle();
    await verifyPlaceholderProductCommand();
    await verifyPlaceholderWorkspace();
    await verifyPlaceholderRuntimeEvents();
    await verifyProviderRuntimeEvents();
    await verifyPlaceholderPrompts();
    await verifyPlaceholderObjectInspection();
    await verifyPlaceholderTabularPreview();
    await verifyActiveDatasetSelection();
    await verifyPlaceholderCellWrite();
    await verifyPlaceholderCellBatchWrite();
    await verifyPlaceholderNameOperations();
    await verifyPlaceholderStructuralOperations();
    await verifyPlaceholderVariableMetadata();
    await verifyPlaceholderVariableMetadataWrite();
    await verifyPlaceholderVariableMetadataKeyWrite();
    await verifyVariableMetadataWriteRequiresCapability();
    await verifyPlaceholderValueLabels();
    await verifyPlaceholderValueLabelWrite();
    await verifyPlaceholderDeclaredMissing();
    await verifyPlaceholderDeclaredMissingWrite();
    await verifyPlaceholderImport();
    await verifyDelimitedImportReadsExistingFile();
    await verifyImportConflictPreservesExistingTarget();
    await verifyImportConflictPreservesProviderTarget();
    await verifyImportOverwriteReplacesExistingTarget();
    await verifyImportOverwriteReplacesProviderTarget();
    await verifyPlaceholderInvisibleQuery();
    await verifyInvisibleQueryRequiresCapability();
    await verifyPlaceholderInvisibleMutation();
    await verifyInvisibleMutationRequiresCapability();
    await verifyPlaceholderDialogExecution();
    await verifySharedImportSourceExecution();
    await verifyDialogSourceExecution();
    await verifyDialogSourceExecutionUsesProductSettingsPackages();
    await verifyDialogExecutionRequiresCapability();
    await verifyPlaceholderHelpTopic();
    await verifyPlaceholderCompletions();
    await verifyPlaceholderDependencyChecks();
    await verifyDependencyChecksRequireCapability();
    await verifyPlaceholderStartupTaskExecution();
    await verifyReservedLifecycle();
    await verifyMissingLifecycle();
    console.log("Runtime session contract verified.");
};
run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
