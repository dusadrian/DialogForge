"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createVisibleCommandRequest } = require("../../shared/runtime/commands/commandProtocol");
const { createCompletionRequest } = require("../../shared/runtime/completions/completionProtocol");
const { createDependencyCheckRequest } = require("../../shared/runtime/dependencies/dependencyProtocol");
const { createHelpTopicRequest } = require("../../shared/runtime/help/helpProtocol");
const { createInvisibleMutationRequest } = require("../../shared/runtime/queries/invisibleMutationProtocol");
const { createInvisibleQueryRequest } = require("../../shared/runtime/queries/invisibleQueryProtocol");
const { createRuntimeExtensionMethodRequest, createWorkspaceFileLoadRequest, createWorkspaceFileSaveRequest } = require("../../shared/runtime/extensions/runtimeExtensionProtocol");
const { createProductCommandRequest } = require("../../shared/runtime/product-commands/productCommandProtocol");
const { createImportRequest } = require("../../shared/runtime/tabular-data/importProtocol");
const { createCellUpdateRequest, createColumnInsertRequest, createColumnRemoveRequest, createColumnRenameRequest, createDeclaredMissingUpdateRequest, createRowInsertRequest, createRowNameUpdateRequest, createRowRemoveRequest, createRowSortRequest, createValueLabelUpdateRequest, createVariableMetadataUpdateRequest } = require("../../shared/runtime/tabular-data/tabularProtocol");
const { getRuntimeProvider } = require("../../shared/runtime/providers/runtimeProviderRegistry");
const { createRuntimeSessionManager } = require("../../shared/runtime/session/runtimeSessionManager");
const verifyLocalRExists = function () {
    execFileSync("R", ["--version"], {
        stdio: "ignore"
    });
};
const assertVisibleTranscript = function (result, text) {
    assert.ok(Array.isArray(result.transcriptEvents));
    assert.ok(result.transcriptEvents.some((event) => {
        return event.commandKind === "commands.visible" &&
            String(event.text || "").includes(text);
    }));
};
const rawRows = function (rows) {
    return rows.map((row) => {
        return Object.fromEntries(Object.entries(row).map(([name, value]) => {
            const cell = value && typeof value === "object"
                ? value
                : null;
            return [
                name,
                cell && Object.prototype.hasOwnProperty.call(cell, "raw")
                    ? cell.raw
                    : value
            ];
        }));
    });
};
const parseRuntimePayload = function (value) {
    if (typeof value !== "string") {
        return value;
    }

    try {
        return JSON.parse(value);
    }
    catch {
        return value;
    }
};
const verifyRWorkspaceRuntimeControl = async function () {
    verifyLocalRExists();
    process.env.DIALOGFORGE_R_PROCESS = "1";
    const manager = createRuntimeSessionManager(getRuntimeProvider("r"));
    await manager.start();
    await manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "forge_data <- data.frame(case = c('A', 'B'), score = c(1, 0)); attr(forge_data$score, 'labels') <- c(Low = 0, High = 1); attr(forge_data$score, 'na_values') <- c(-9)",
        source: "contract-test"
    }));
    await manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "forge_matrix <- matrix(c(1, 2, 3, 4), nrow = 2, byrow = TRUE); colnames(forge_matrix) <- c('left', 'right'); rownames(forge_matrix) <- c('r1', 'r2')",
        source: "contract-test"
    }));
    await manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "forge_wide <- as.data.frame(setNames(replicate(40, seq_len(100), simplify = FALSE), paste0('v', seq_len(40))))",
        source: "contract-test"
    }));
    await manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "if (requireNamespace('QCA', quietly = TRUE)) { qca_data <- data.frame(A = c(1, 1, 0, 0), B = c(1, 0, 1, 0), Y = c(1, 1, 0, 0)); tt_runtime <- QCA::truthTable(qca_data, outcome = 'Y', conditions = 'A, B') }",
        source: "contract-test"
    }));
    const workspace = await manager.listWorkspaceObjects();
    const runtimeEventsAfterSetup = await manager.listRuntimeEvents();
    const forgeData = workspace.objects.find((object) => {
        return object.name === "forge_data";
    });
    assert.ok(forgeData);
    assert.ok(runtimeEventsAfterSetup.events.some((event) => {
        return event.type === "workspace.update" &&
            String(event.detail || "").includes("added");
    }));
    assert.strictEqual(forgeData.kind, "table");
    assert.strictEqual(forgeData.hasViewer, true);
    assert.ok(forgeData.capabilities.includes("tabular.read"));
    const forgeMatrix = workspace.objects.find((object) => {
        return object.name === "forge_matrix";
    });
    assert.ok(forgeMatrix);
    assert.strictEqual(forgeMatrix.kind, "table");
    assert.strictEqual(forgeMatrix.hasViewer, true);
    assert.ok(forgeMatrix.capabilities.includes("tabular.read"));
    const inspectedForgeData = await manager.inspectObject("forge_data");
    assert.strictEqual(inspectedForgeData.status, "ready");
    assert.strictEqual(inspectedForgeData.kind, "table");
    assert.ok(inspectedForgeData.summary.some((entry) => {
        return entry.name === "dim" && entry.value === "2 x 2";
    }));
    const selectedForgeData = await manager.setActiveDataset("forge_data");
    assert.strictEqual(selectedForgeData.status, "selected");
    const preview = await manager.readTabularPreview("forge_data");
    const matrixPreview = await manager.readTabularPreview("forge_matrix");
    const widePreview = await manager.readTabularPreview({
        objectName: "forge_wide",
        rowStart: 11,
        rowCount: 5,
        columns: ["v3", "v4"]
    });
    assert.strictEqual(preview.status, "ready");
    assert.deepStrictEqual(preview.columns.map((column) => {
        return column.name;
    }), ["case", "score"]);
    assert.deepStrictEqual(rawRows(preview.rows), [
        { case: "A", score: 1 },
        { case: "B", score: 0 }
    ]);
    assert.strictEqual(matrixPreview.status, "ready");
    assert.deepStrictEqual(matrixPreview.columns.map((column) => {
        return column.name;
    }), ["left", "right"]);
    assert.deepStrictEqual(matrixPreview.rowNames, ["r1", "r2"]);
    assert.deepStrictEqual(rawRows(matrixPreview.rows), [
        { left: 1, right: 2 },
        { left: 3, right: 4 }
    ]);
    assert.strictEqual(widePreview.status, "ready");
    assert.deepStrictEqual(widePreview.columns.map((column) => {
        return column.name;
    }), ["v3", "v4"]);
    assert.strictEqual(widePreview.rows.length, 5);
    assert.strictEqual(rawRows(widePreview.rows)[0].v3, 11);
    assert.strictEqual(rawRows(widePreview.rows)[4].v4, 15);
    assert.strictEqual(widePreview.rowOffset, 10);
    assert.strictEqual(widePreview.totalRowCount, 100);
    assert.strictEqual(widePreview.totalColumnCount, 40);
    const update = await manager.writeCell(createCellUpdateRequest({
        objectName: "forge_data",
        rowIndex: 1,
        columnName: "score",
        value: 7,
        uiCommandVisibility: "visible"
    }));
    const updatedPreview = await manager.readTabularPreview("forge_data");
    const metadata = await manager.readVariableMetadata("forge_data");
    const valueLabels = await manager.readValueLabels("forge_data");
    const declaredMissing = await manager.readDeclaredMissing("forge_data");
    const hiddenValueLabelUpdate = await manager.writeValueLabels(createValueLabelUpdateRequest({
        objectName: "forge_data",
        variableName: "score",
        labels: [
            { value: 0, label: "No" },
            { value: 7, label: "Seven" }
        ]
    }));
    const hiddenDeclaredMissingUpdate = await manager.writeDeclaredMissing(createDeclaredMissingUpdateRequest({
        objectName: "forge_data",
        variableName: "score",
        values: [
            { value: -7, label: "Refused" }
        ]
    }));
    const hiddenValueLabels = await manager.readValueLabels("forge_data");
    const hiddenDeclaredMissing = await manager.readDeclaredMissing("forge_data");
    const labelUpdate = await manager.writeVariableMetadata(createVariableMetadataUpdateRequest({
        objectName: "forge_data",
        variableName: "score",
        metadataKey: "label",
        value: "Updated score",
        uiCommandVisibility: "visible"
    }));
    const updatedMetadata = await manager.readVariableMetadata("forge_data");
    const renamed = await manager.renameColumn(createColumnRenameRequest({
        objectName: "forge_data",
        fromName: "score",
        toName: "score2"
    }));
    const visibleRename = await manager.renameColumn(createColumnRenameRequest({
        objectName: "forge_data",
        fromName: "score2",
        toName: "score_visible",
        uiCommandVisibility: "visible"
    }));
    const visibleValueLabelUpdate = await manager.writeValueLabels(createValueLabelUpdateRequest({
        objectName: "forge_data",
        variableName: "score_visible",
        labels: [
            { value: 1, label: "One" },
            { value: 7, label: "Seven" }
        ],
        uiCommandVisibility: "visible"
    }));
    const visibleDeclaredMissingUpdate = await manager.writeDeclaredMissing(createDeclaredMissingUpdateRequest({
        objectName: "forge_data",
        variableName: "score_visible",
        values: [
            { value: -8, label: "Unknown" }
        ],
        uiCommandVisibility: "visible"
    }));
    const visibleValueLabels = await manager.readValueLabels("forge_data");
    const visibleDeclaredMissing = await manager.readDeclaredMissing("forge_data");
    const visibleMeasureUpdate = await manager.writeVariableMetadata(createVariableMetadataUpdateRequest({
        objectName: "forge_data",
        variableName: "score_visible",
        metadataKey: "measure",
        value: "scale",
        uiCommandVisibility: "visible"
    }));
    const visibleMeasureMetadata = await manager.readVariableMetadata("forge_data");
    const insertedColumn = await manager.insertColumn(createColumnInsertRequest({
        objectName: "forge_data",
        referenceName: "case",
        newName: "note",
        position: "after",
        uiCommandVisibility: "visible"
    }));
    const removedColumn = await manager.removeColumn(createColumnRemoveRequest({
        objectName: "forge_data",
        columnName: "note",
        uiCommandVisibility: "visible"
    }));
    const insertedRow = await manager.insertRow(createRowInsertRequest({
        objectName: "forge_data",
        rowIndex: 0,
        position: "after",
        uiCommandVisibility: "visible"
    }));
    const rowName = await manager.updateRowName(createRowNameUpdateRequest({
        objectName: "forge_data",
        rowIndex: 1,
        name: "inserted",
        uiCommandVisibility: "visible"
    }));
    const removedRow = await manager.removeRow(createRowRemoveRequest({
        objectName: "forge_data",
        rowIndex: 1,
        uiCommandVisibility: "visible"
    }));
    const sortedRows = await manager.sortRows(createRowSortRequest({
        objectName: "forge_data",
        columnName: "score_visible",
        direction: "descending",
        uiCommandVisibility: "visible"
    }));
    const structuralPreview = await manager.readTabularPreview("forge_data");
    const importDir = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-r-import-"));
    const importPath = path.join(importDir, "input.csv");
    const rdsPath = path.join(importDir, "input.rds");
    const rdataPath = path.join(importDir, "input.RData");
    const dtaPath = path.join(importDir, "input.dta");
    fs.writeFileSync(importPath, "case,value\nC,3\nD,4\n", "utf8");
    await manager.executeVisibleCommand(createVisibleCommandRequest({
        text: [
            "saveRDS(data.frame(case = c('E', 'F'), value = c(5, 6)), file = " + JSON.stringify(rdsPath) + ")",
            "rdata_source <- data.frame(case = c('G', 'H'), value = c(7, 8))",
            "save(rdata_source, file = " + JSON.stringify(rdataPath) + ")",
            "foreign::write.dta(data.frame(case = c('I', 'J'), value = c(9, 10)), file = " + JSON.stringify(dtaPath) + ")",
            "rm(rdata_source)"
        ].join("; "),
        source: "contract-test"
    }));
    const imported = await manager.importData(createImportRequest({
        source: importPath,
        format: "csv",
        targetName: "imported_runtime_data",
        overwrite: false
    }));
    const importedPreview = await manager.readTabularPreview("imported_runtime_data");
    const importedRds = await manager.importData(createImportRequest({
        source: rdsPath,
        format: "rds",
        targetName: "imported_rds_data",
        overwrite: false
    }));
    const importedRdsPreview = await manager.readTabularPreview("imported_rds_data");
    const importedRdata = await manager.importData(createImportRequest({
        source: rdataPath,
        format: "rdata",
        targetName: "imported_rdata_data",
        overwrite: false
    }));
    const importedRdataPreview = await manager.readTabularPreview("imported_rdata_data");
    const visibleImport = await manager.importData(createImportRequest({
        source: importPath,
        format: "csv",
        targetName: "imported_visible_data",
        overwrite: false,
        uiCommandVisibility: "visible"
    }));
    const visibleImportPreview = await manager.readTabularPreview("imported_visible_data");
    const importedStata = await manager.importData(createImportRequest({
        source: dtaPath,
        format: "stata",
        targetName: "imported_stata_data",
        overwrite: false
    }));
    const importedStataPreview = await manager.readTabularPreview("imported_stata_data");
    const rdsImportPreview = await manager.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
        method: "workspace.import_file_preview",
        params: {
            path: rdsPath,
            reader: "readRDS",
            nrows: 2,
            header: true
        },
        source: "contract-test"
    }));
    const stataImportPreview = await manager.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
        method: "workspace.import_file_preview",
        params: {
            path: dtaPath,
            reader: "convert",
            binary: true,
            nrows: 2,
            header: true
        },
        source: "contract-test"
    }));
    const completions = await manager.readCompletions(createCompletionRequest({
        prefix: "mea",
        source: "contract-test"
    }));
    const dependencies = await manager.checkDependencies(createDependencyCheckRequest({
        kind: "package",
        names: ["stats", "definitely_missing_dialogforge_package"],
        source: "contract-test"
    }));
    const help = await manager.readHelpTopic(createHelpTopicRequest({
        topic: "mean",
        source: "contract-test"
    }));
    const invisibleQuery = await manager.executeInvisibleQuery(createInvisibleQueryRequest({
        query: "1 + 1",
        source: "contract-test"
    }));
    const invisibleMutation = await manager.executeInvisibleMutation(createInvisibleMutationRequest({
        mutation: "hidden_value",
        value: 123,
        source: "contract-test"
    }));
    const mutatedQuery = await manager.executeInvisibleQuery(createInvisibleQueryRequest({
        query: "hidden_value",
        source: "contract-test"
    }));
    const productCommand = await manager.executeProductCommand(createProductCommandRequest({
        productId: "TestProduct",
        command: "TestProduct.packages.installRequired",
        label: "Install required R packages",
        capability: "TestProduct.packages.required",
        rPackages: ["stats", "definitely_missing_dialogforge_package"],
        source: "contract-test"
    }));
    const productUpdateCommand = await manager.executeProductCommand(createProductCommandRequest({
        productId: "TestProduct",
        command: "TestProduct.packages.updateRequired",
        label: "Update development versions",
        capability: "TestProduct.packages.required",
        rPackages: ["QCA", "admisc", "venn"],
        source: "contract-test"
    }));
    const dialogRUpdateCommand = await manager.executeProductCommand(createProductCommandRequest({
        productId: "StatsProduct",
        command: "StatsProduct.packages.updateRequired",
        label: "Update development versions",
        capability: "StatsProduct.packages.required",
        rPackages: ["httpgd", "jsonlite", "askpass", "later", "digest", "admisc", "declared", "DDIwR", "statistics"],
        source: "contract-test"
    }));
    const dialogRInstallCommand = await manager.executeProductCommand(createProductCommandRequest({
        productId: "StatsProduct",
        command: "StatsProduct.packages.installRequired",
        label: "Install required R packages",
        capability: "StatsProduct.packages.required",
        rPackages: ["httpgd", "jsonlite", "askpass", "later", "digest", "admisc", "declared", "DDIwR", "statistics", "definitely_missing_dialogforge_package"],
        source: "contract-test"
    }));
    const workingDirectoryPath = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-r-wd-"));
    const workingDirectoryUpdate = await manager.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
        method: "runtime.set_working_directory",
        params: {
            path: workingDirectoryPath
        },
        source: "contract-test"
    }));
    const scriptFilePath = path.join(workingDirectoryPath, "script-file.R");
    fs.writeFileSync(scriptFilePath, "script_file_value <- 456\n", "utf8");
    const scriptFileResult = await manager.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
        method: "runtime.run_script_file",
        params: {
            path: scriptFilePath
        },
        source: "contract-test"
    }));
    const workspaceFilePath = path.join(workingDirectoryPath, "workspace-file.RData");
    await manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "workspace_file_value <- data.frame(value = c(8, 9)); save(workspace_file_value, file = " + JSON.stringify(workspaceFilePath) + "); rm(workspace_file_value)",
        source: "contract-test"
    }));
    const workspaceFileResult = await manager.executeRuntimeMethod(createWorkspaceFileLoadRequest(workspaceFilePath, "contract-test"));
    const savedWorkspacePath = path.join(workingDirectoryPath, "saved-workspace.RData");
    const savedWorkspaceResult = await manager.executeRuntimeMethod(createWorkspaceFileSaveRequest(savedWorkspacePath, "contract-test"));
    await manager.removeWorkspaceObjects(["workspace_file_value"]);
    const reloadedWorkspaceResult = await manager.executeRuntimeMethod(createWorkspaceFileLoadRequest(savedWorkspacePath, "contract-test"));
    const workspaceFileQuery = await manager.executeInvisibleQuery(createInvisibleQueryRequest({
        query: "nrow(workspace_file_value)",
        source: "contract-test"
    }));
    const renamedWorkspaceObjects = await manager.renameWorkspaceObject({
        oldName: "workspace_file_value",
        newName: "workspace_file_value_renamed",
        source: "contract-test"
    });
    const renamedWorkspaceQuery = await manager.executeInvisibleQuery(createInvisibleQueryRequest({
        query: "nrow(workspace_file_value_renamed)",
        source: "contract-test"
    }));
    const scriptFileQuery = await manager.executeInvisibleQuery(createInvisibleQueryRequest({
        query: "script_file_value",
        source: "contract-test"
    }));
    const runtimeMethod = await manager.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
        method: "workspace.dataset_content",
        params: {
            name: "forge_data"
        },
        source: "contract-test"
    }));
    const truthTableResult = await manager.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
        method: "workspace.truth_tables",
        params: {},
        source: "contract-test"
    }));
    const truthTables = Array.isArray(parseRuntimePayload(truthTableResult.value))
        ? parseRuntimePayload(truthTableResult.value)
        : [];
    await manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "rm(forge_data)",
        source: "contract-test"
    }));
    const workspaceAfterConsoleRemove = await manager.listWorkspaceObjects();
    const activeAfterConsoleRemove = manager.getActiveDataset();
    const removedWorkspaceObjects = await manager.removeWorkspaceObjects(["workspace_file_value_renamed"]);
    const removedWorkspaceQuery = await manager.executeInvisibleQuery(createInvisibleQueryRequest({
        query: "exists('workspace_file_value_renamed', inherits = FALSE)",
        source: "contract-test"
    }));
    const clearedWorkspace = await manager.clearWorkspace();
    await manager.stop();
    assert.strictEqual(update.status, "updated");
    assertVisibleTranscript(update, ".data[.row, .column] <- .value");
    assert.strictEqual(rawRows(updatedPreview.rows)[1].score, 7);
    assert.deepStrictEqual(metadata.variables.map((variable) => {
        return variable.name;
    }), ["case", "score"]);
    assert.deepStrictEqual(valueLabels.valueLabels, [
        {
            variable: "score",
            labels: [
                { value: "0", label: "Low" },
                { value: "1", label: "High" }
            ]
        }
    ]);
    assert.deepStrictEqual(declaredMissing.declaredMissing, [
        {
            variable: "score",
            values: [
                { value: "-9", label: "" }
            ]
        }
    ]);
    assert.strictEqual(hiddenValueLabelUpdate.status, "updated");
    assert.deepStrictEqual(hiddenValueLabels.valueLabels, [
        {
            variable: "score",
            labels: [
                { value: "0", label: "No" },
                { value: "7", label: "Seven" }
            ]
        }
    ]);
    assert.strictEqual(hiddenDeclaredMissingUpdate.status, "updated");
    assert.deepStrictEqual(hiddenDeclaredMissing.declaredMissing, [
        {
            variable: "score",
            values: [
                { value: "-7", label: "Refused" }
            ]
        }
    ]);
    assert.strictEqual(labelUpdate.status, "updated");
    assertVisibleTranscript(labelUpdate, "attr(.column, \"label\") <- if (nzchar(.value)) .value else NULL");
    assert.strictEqual(updatedMetadata.variables.find((variable) => {
        return variable.name === "score";
    }).label, "Updated score");
    assert.strictEqual(renamed.status, "updated");
    assert.strictEqual(visibleRename.status, "updated");
    assertVisibleTranscript(visibleRename, "names(.data)[names(.data) == .column] <- .next");
    assert.strictEqual(visibleValueLabelUpdate.status, "updated");
    assertVisibleTranscript(visibleValueLabelUpdate, "attr(.data[[.variable]], \"labels\") <- .values");
    assert.deepStrictEqual(visibleValueLabels.valueLabels, [
        {
            variable: "score_visible",
            labels: [
                { value: "1", label: "One" },
                { value: "7", label: "Seven" }
            ]
        }
    ]);
    assert.strictEqual(visibleDeclaredMissingUpdate.status, "updated");
    assertVisibleTranscript(visibleDeclaredMissingUpdate, "attr(.data[[.variable]], \"na_values\") <- .values");
    assert.deepStrictEqual(visibleDeclaredMissing.declaredMissing, [
        {
            variable: "score_visible",
            values: [
                { value: "-8", label: "Unknown" }
            ]
        }
    ]);
    assert.strictEqual(visibleMeasureUpdate.status, "updated");
    assertVisibleTranscript(visibleMeasureUpdate, "attr(.column, \"measurement\") <- if (nzchar(.value)) .value else NULL");
    assert.strictEqual(visibleMeasureMetadata.variables.find((variable) => {
        return variable.name === "score_visible";
    }).measure, "scale");
    assert.strictEqual(insertedColumn.status, "updated");
    assertVisibleTranscript(insertedColumn, ".data[[.new]] <- NA");
    assert.strictEqual(removedColumn.status, "updated");
    assertVisibleTranscript(removedColumn, ".data[[.column]] <- NULL");
    assert.strictEqual(insertedRow.status, "updated");
    assertVisibleTranscript(insertedRow, ".data <- rbind");
    assert.strictEqual(rowName.status, "updated");
    assertVisibleTranscript(rowName, "rownames(.data)[.row] <- .next");
    assert.strictEqual(removedRow.status, "updated");
    assertVisibleTranscript(removedRow, ".data <- .data[-.row, , drop = FALSE]");
    assert.strictEqual(sortedRows.status, "updated");
    assertVisibleTranscript(sortedRows, ".data <- .data[order(.data[[.column]], decreasing = .decreasing, na.last = TRUE), , drop = FALSE]");
    assert.deepStrictEqual(structuralPreview.columns.map((column) => {
        return column.name;
    }), ["case", "score_visible"]);
    assert.deepStrictEqual(structuralPreview.rows.map((row) => {
        return rawRows([row])[0].score_visible;
    }), [7, 1]);
    assert.strictEqual(imported.status, "imported");
    assert.deepStrictEqual(rawRows(importedPreview.rows), [
        { case: "C", value: 3 },
        { case: "D", value: 4 }
    ]);
    assert.strictEqual(importedRds.status, "imported");
    assert.deepStrictEqual(rawRows(importedRdsPreview.rows), [
        { case: "E", value: 5 },
        { case: "F", value: 6 }
    ]);
    assert.strictEqual(importedRdata.status, "imported");
    assert.deepStrictEqual(rawRows(importedRdataPreview.rows), [
        { case: "G", value: 7 },
        { case: "H", value: 8 }
    ]);
    assert.strictEqual(visibleImport.status, "imported");
    assert.ok(visibleImport.transcriptEvents.some((event) => {
        return event.type === "submitted" && event.source === "ui.data.import" && event.text.includes("read.csv");
    }));
    assert.deepStrictEqual(rawRows(visibleImportPreview.rows), [
        { case: "C", value: 3 },
        { case: "D", value: 4 }
    ]);
    assert.strictEqual(importedStata.status, "imported");
    assert.deepStrictEqual(rawRows(importedStataPreview.rows), [
        { case: "I", value: 9 },
        { case: "J", value: 10 }
    ]);
    assert.strictEqual(rdsImportPreview.status, "ready");
    assert.deepStrictEqual(rdsImportPreview.value.colnames, ["case", "value"]);
    assert.deepStrictEqual(rdsImportPreview.value.vdata, [
        ["E", "F"],
        ["5", "6"]
    ]);
    assert.strictEqual(stataImportPreview.status, "ready");
    assert.deepStrictEqual(stataImportPreview.value.colnames, ["case", "value"]);
    assert.deepStrictEqual(stataImportPreview.value.vdata, [
        ["I", "J"],
        ["9", "10"]
    ]);
    assert.ok(completions.items.some((item) => {
        return item.label === "mean";
    }));
    assert.deepStrictEqual(dependencies.items.map((item) => {
        return item.status;
    }), ["available", "missing"]);
    assert.strictEqual(help.status, "ready");
    assert.strictEqual(help.kind, "single");
    assert.ok(String(help.path || "").includes("/html/"));
    assert.ok(String(help.body || "").includes("<html"));
    assert.ok(String(help.body || "").includes("mean"));
    assert.strictEqual(invisibleQuery.status, "ready");
    assert.ok(String(invisibleQuery.value).includes("2"));
    assert.strictEqual(invisibleMutation.status, "updated");
    assert.strictEqual(mutatedQuery.status, "ready");
    assert.ok(String(mutatedQuery.value).includes("123"));
    assert.strictEqual(productCommand.status, "partial");
    assert.ok(productCommand.message.includes("definitely_missing_dialogforge_package"));
    assert.strictEqual(productCommand.transcriptEvents.length, 3);
    assert.ok(productCommand.transcriptEvents.some((event) => {
        return String(event.message || "").includes("install.packages");
    }));
    assert.strictEqual(productUpdateCommand.status, "ready");
    assert.ok(productUpdateCommand.message.includes("admisc"));
    assert.ok(productUpdateCommand.transcriptEvents.some((event) => {
        const message = String(event.message || "");
        return message.includes("dusadrian.r-universe.dev") && !message.includes("QCA");
    }));
    assert.strictEqual(dialogRUpdateCommand.status, "ready");
    assert.ok(dialogRUpdateCommand.message.includes("statistics"));
    assert.ok(dialogRUpdateCommand.transcriptEvents.some((event) => {
        const message = String(event.message || "");
        return message.includes("admisc") &&
            message.includes("declared") &&
            message.includes("DDIwR") &&
            message.includes("statistics") &&
            message.includes("dusadrian.r-universe.dev") &&
            !message.includes("jsonlite");
    }));
    assert.strictEqual(dialogRInstallCommand.status, "partial");
    assert.ok(dialogRInstallCommand.message.includes("definitely_missing_dialogforge_package"));
    assert.ok(dialogRInstallCommand.transcriptEvents.some((event) => {
        const message = String(event.message || "");
        return message.includes("install command:") &&
            message.includes("install.packages(") &&
            message.includes("dependencies = TRUE") &&
            message.includes("https://dusadrian.r-universe.dev") &&
            message.includes("https://cloud.r-project.org") &&
            message.includes("definitely_missing_dialogforge_package");
    }));
    assert.strictEqual(workingDirectoryUpdate.status, "ready");
    assert.strictEqual(fs.realpathSync(workingDirectoryUpdate.value.path), fs.realpathSync(workingDirectoryPath));
    assert.strictEqual(scriptFileResult.status, "ready");
    assert.strictEqual(fs.realpathSync(scriptFileResult.value.path), fs.realpathSync(scriptFilePath));
    assert.strictEqual(scriptFileQuery.status, "ready");
    assert.ok(String(scriptFileQuery.value).includes("456"));
    assert.strictEqual(workspaceFileResult.status, "ready");
    assert.deepStrictEqual(workspaceFileResult.value.objects, ["workspace_file_value"]);
    assert.strictEqual(savedWorkspaceResult.status, "ready");
    assert.ok(fs.existsSync(savedWorkspacePath));
    assert.ok(savedWorkspaceResult.value.objects.includes("workspace_file_value"));
    assert.strictEqual(reloadedWorkspaceResult.status, "ready");
    assert.ok(reloadedWorkspaceResult.value.objects.includes("workspace_file_value"));
    assert.strictEqual(workspaceFileQuery.status, "ready");
    assert.ok(String(workspaceFileQuery.value).includes("2"));
    assert.strictEqual(renamedWorkspaceObjects.status, "ready");
    assert.ok(renamedWorkspaceObjects.objects.some((object) => {
        return object.name === "workspace_file_value_renamed";
    }));
    assert.ok(!renamedWorkspaceObjects.objects.some((object) => {
        return object.name === "workspace_file_value";
    }));
    assert.strictEqual(renamedWorkspaceQuery.status, "ready");
    assert.ok(String(renamedWorkspaceQuery.value).includes("2"));
    assert.strictEqual(removedWorkspaceObjects.status, "ready");
    assert.strictEqual(removedWorkspaceObjects.objects.some((object) => {
        return object.name === "workspace_file_value_renamed";
    }), false);
    assert.strictEqual(removedWorkspaceQuery.status, "ready");
    assert.ok(String(removedWorkspaceQuery.value).includes("FALSE"));
    assert.strictEqual(clearedWorkspace.status, "ready");
    assert.strictEqual(clearedWorkspace.objects.length, 0);
    assert.strictEqual(runtimeMethod.status, "ready");
    assert.strictEqual(runtimeMethod.method, "workspace.dataset_content");
    assert.ok(String(JSON.stringify(runtimeMethod.value)).includes("score_visible"));
    assert.ok(truthTables.some((entry) => {
        return entry.name === "tt_runtime";
    }));
    assert.ok(!workspaceAfterConsoleRemove.objects.some((object) => {
        return object.name === "forge_data";
    }));
    assert.notStrictEqual(activeAfterConsoleRemove.objectName, "forge_data");
    assert.ok(workspaceAfterConsoleRemove.objects.some((object) => {
        return object.name === activeAfterConsoleRemove.objectName &&
            object.capabilities.includes("tabular.read");
    }));
};
verifyRWorkspaceRuntimeControl()
    .then(() => {
    console.log("R workspace runtime-control contract verified.");
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
