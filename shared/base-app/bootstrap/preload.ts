import { clipboard, contextBridge, ipcRenderer } from "electron";
import {
    invokeRuntimeSessionRoute,
    runtimeSessionIpcChannels
} from "../../core/ipc/runtimeSessionIpc";
import {
    invokeRuntimeCommandRoute,
    runtimeCommandIpcChannels
} from "../../core/ipc/runtimeCommandIpc";
import {
    invokeTabularRoute,
    tabularIpcChannels
} from "../../core/ipc/tabularIpc";
import {
    invokeWorkspaceRoute,
    workspaceIpcChannels
} from "../../core/ipc/workspaceIpc";
import {
    invokeRuntimeQueryRoute,
    runtimeQueryIpcChannels
} from "../../core/ipc/runtimeQueryIpc";
import {
    invokeApplicationCompositionRoute
} from "./applicationCompositionIpc";
import {
    consoleHistoryIpcChannels,
    invokeConsoleHistoryRoute
} from "../../console/services/consoleHistoryIpc";
import {
    helpIpcChannels,
    invokeHelpRoute
} from "../../runtime/help/helpIpc";
import {
    invokePackageInstallRoute,
    packageInstallIpcChannels
} from "../../runtime/providers/r/dependencies/packageInstallIpc";
import {
    importFileIpcChannels,
    invokeImportFileRoute
} from "../../runtime/tabular-data/importFileIpc";
import {
    invokeShellFileDialogRoute,
    shellFileDialogIpcChannels
} from "../../shell-electron/filesystem/shellFileDialogIpc";
import {
    invokeShellClipboardRoute,
    shellClipboardIpcChannels
} from "../../shell-electron/clipboard/shellClipboardIpc";
import {
    invokeShellWindowRoute,
    shellWindowIpcChannels
} from "../../shell-electron/windows/shellWindowIpc";
import {
    invokePlotExternalRoute,
    plotExternalIpcChannels
} from "../../shell-electron/external/plotExternalIpc";
import {
    applicationSettingsIpcChannels,
    invokeApplicationSettingsRoute
} from "../../shell-electron/settings/applicationSettingsIpc";
import {
    applicationEventChannels,
    onApplicationEvent,
    type ApplicationEventChannel,
    type ApplicationEventPayloads
} from "./applicationEvents";
import {
    datasetEditorIpcChannels,
    invokeDatasetEditorRoute,
    type DatasetEditorIpcRoutes
} from "../../dataset-editor/datasetEditorIpc";
import {
    dialogRuntimeIpcChannels,
    invokeDialogRuntimeRoute
} from "../../dialog-runtime/dialogRuntimeIpc";
import type {
    DatasetCellUpdatePatch,
    DatasetViewerContentRequest,
    DatasetVariableUpdatePatch
} from "../../base-app/modules/datasetViewer.types";
import type { CopyPayload } from "../../dataset-editor/clipboard/copyPayload";
import type {
    DatasetEditorInitMessage,
    DatasetEditorLanguageMessage
} from "../../dataset-editor/renderer/datasetEditorIpcBindings";
import type { DialogExternalCallResult } from "../../dialog-runtime/custom-js/externalCallHost";
import type {
    CellUpdateRequest,
    ColumnInsertRequest,
    ColumnRemoveRequest,
    ColumnRenameRequest,
    CompletionRequest,
    DependencyCheckRequest,
    DeclaredMissingUpdateRequest,
    DialogExecutionRequest,
    HelpTopicRequest,
    ImportPlanRequest,
    ImportRequest,
    InvisibleMutationRequest,
    InvisibleQueryRequest,
    PromptAnswerRequest,
    PromptRequest,
    ProductCommandRequest,
    RuntimeExtensionMethodRequest,
    RowInsertRequest,
    RowNameUpdateRequest,
    RowRemoveRequest,
    RowSortRequest,
    StartupTaskExecutionRequest,
    TabularPreviewRequest,
    ValueLabelUpdateRequest,
    VariableMetadataUpdateRequest,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    ScriptEditorInitPayload,
    ScriptEditorLanguagePayload,
    ScriptEditorOpenFilePayload
} from "../../script-editor/renderer/scriptEditorIpcBindings";
import {
    invokeScriptEditorRoute,
    sendScriptEditorCommand,
    type ScriptEditorCommands,
    type ScriptEditorIpcRoutes,
    scriptEditorEventChannels,
    scriptEditorIpcChannels
} from "../../script-editor/scriptEditorIpc";
import {
    createDialogForgeHostBridge
} from "./dialogForgeHostBridge";


const asRecord = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
};


// Keep the host bridge as the single Electron compatibility seam.
const hostBridge = createDialogForgeHostBridge(ipcRenderer);


const onAppEvent = function<Channel extends ApplicationEventChannel>(
    channel: Channel,
    callback: (payload: ApplicationEventPayloads[Channel]) => void
) {
    onApplicationEvent(ipcRenderer, channel, callback);
};


const invokeDatasetEditor = function<
    Channel extends keyof DatasetEditorIpcRoutes & string
>(
    channel: Channel,
    ...args: DatasetEditorIpcRoutes[Channel]["input"]
): Promise<DatasetEditorIpcRoutes[Channel]["result"]> {
    return invokeDatasetEditorRoute(ipcRenderer, channel, ...args);
};


const invokeScriptEditor = function<
    Channel extends keyof ScriptEditorIpcRoutes & string
>(
    channel: Channel,
    ...args: ScriptEditorIpcRoutes[Channel]["input"]
): Promise<ScriptEditorIpcRoutes[Channel]["result"]> {
    return invokeScriptEditorRoute(ipcRenderer, channel, ...args);
};


const sendScriptEditor = function<
    Channel extends keyof ScriptEditorCommands & string
>(
    channel: Channel,
    ...args: ScriptEditorCommands[Channel]
) {
    sendScriptEditorCommand(ipcRenderer, channel, ...args);
};


const api: DialogForgeApi = {
    getComposition: function() {
        return invokeApplicationCompositionRoute(ipcRenderer);
    },
    setMainWindowTitle: function(title: string) {
        return invokeShellWindowRoute(
            ipcRenderer,
            shellWindowIpcChannels.setMainWindowTitle,
            { title }
        );
    },
    readSettings: function() {
        return invokeApplicationSettingsRoute(
            ipcRenderer,
            applicationSettingsIpcChannels.read
        );
    },
    writeSettings: function(input: Record<string, unknown>) {
        return invokeApplicationSettingsRoute(
            ipcRenderer,
            applicationSettingsIpcChannels.write,
            input
        );
    },
    readConsoleHistory: function(input: { productId?: string; runtimeId?: string }) {
        return invokeConsoleHistoryRoute(
            ipcRenderer,
            consoleHistoryIpcChannels.read,
            input
        );
    },
    writeConsoleHistory: function(input: { productId?: string; runtimeId?: string; history?: string[] }) {
        return invokeConsoleHistoryRoute(
            ipcRenderer,
            consoleHistoryIpcChannels.write,
            input
        );
    },
    getRuntimeSession: function() {
        return invokeRuntimeSessionRoute(
            ipcRenderer,
            runtimeSessionIpcChannels.get
        );
    },
    startRuntime: function() {
        return invokeRuntimeSessionRoute(
            ipcRenderer,
            runtimeSessionIpcChannels.start
        );
    },
    stopRuntime: function() {
        return invokeRuntimeSessionRoute(
            ipcRenderer,
            runtimeSessionIpcChannels.stop
        );
    },
    restartRuntime: function(action: "clean" | "restore") {
        return invokeRuntimeSessionRoute(
            ipcRenderer,
            runtimeSessionIpcChannels.restart,
            { action }
        );
    },
    executeVisibleCommand: function(input: Partial<VisibleCommandRequest>) {
        return invokeRuntimeCommandRoute(
            ipcRenderer,
            runtimeCommandIpcChannels.executeVisible,
            input
        );
    },
    checkScriptFragment: function(input: { code?: string }) {
        return invokeScriptEditor(scriptEditorIpcChannels.checkFragment,
            input
        );
    },
    runScriptCodeBatch: function(input: { chunks?: string[] }) {
        return invokeScriptEditor(scriptEditorIpcChannels.runCodeBatch,
            input
        );
    },
    executeProductCommand: function(input: Partial<ProductCommandRequest>) {
        return invokeRuntimeCommandRoute(
            ipcRenderer,
            runtimeCommandIpcChannels.executeProduct,
            input
        );
    },
    confirmPackageRestart: function(packages: string[]) {
        return invokePackageInstallRoute(
            ipcRenderer,
            packageInstallIpcChannels.confirmRestart,
            { packages }
        );
    },
    choosePackageInstallLibrary: function(input: {
        userLibrary?: string;
        defaultLibrary?: string;
    }) {
        return invokePackageInstallRoute(
            ipcRenderer,
            packageInstallIpcChannels.chooseLibrary,
            input
        );
    },
    restartRuntimeForPackages: function(action: "clean" | "restore") {
        return invokeRuntimeSessionRoute(
            ipcRenderer,
            runtimeSessionIpcChannels.restartForPackages,
            { action }
        );
    },
    refreshWorkspace: function() {
        return invokeWorkspaceRoute(
            ipcRenderer,
            workspaceIpcChannels.refresh
        );
    },
    removeWorkspaceObjects: function(objectNames: string[]) {
        return invokeWorkspaceRoute(
            ipcRenderer,
            workspaceIpcChannels.removeObjects,
            { objectNames }
        );
    },
    renameWorkspaceObject: function(input: { oldName?: string; newName?: string; source?: string }) {
        return invokeWorkspaceRoute(
            ipcRenderer,
            workspaceIpcChannels.renameObject,
            input
        );
    },
    clearWorkspace: function() {
        return invokeWorkspaceRoute(
            ipcRenderer,
            workspaceIpcChannels.clear
        );
    },
    listRuntimeEvents: function() {
        return invokeRuntimeSessionRoute(
            ipcRenderer,
            runtimeSessionIpcChannels.listEvents
        );
    },
    listPrompts: function() {
        return invokeRuntimeSessionRoute(
            ipcRenderer,
            runtimeSessionIpcChannels.listPrompts
        );
    },
    requestPrompt: function(input: Partial<PromptRequest>) {
        return invokeRuntimeSessionRoute(
            ipcRenderer,
            runtimeSessionIpcChannels.requestPrompt,
            input
        );
    },
    answerPrompt: function(input: Partial<PromptAnswerRequest>) {
        return invokeRuntimeSessionRoute(
            ipcRenderer,
            runtimeSessionIpcChannels.answerPrompt,
            input
        );
    },
    executeStartupTask: function(input: Partial<StartupTaskExecutionRequest>) {
        return invokeRuntimeSessionRoute(
            ipcRenderer,
            runtimeSessionIpcChannels.executeStartupTask,
            input
        );
    },
    inspectObject: function(objectName: string) {
        return invokeWorkspaceRoute(
            ipcRenderer,
            workspaceIpcChannels.inspectObject,
            objectName
        );
    },
    getActiveDataset: function() {
        return invokeWorkspaceRoute(
            ipcRenderer,
            workspaceIpcChannels.getActiveDataset
        );
    },
    setActiveDataset: function(objectName: string) {
        return invokeWorkspaceRoute(
            ipcRenderer,
            workspaceIpcChannels.setActiveDataset,
            objectName
        );
    },
    readTabularSchema: function(objectName: string) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.readSchema,
            objectName
        );
    },
    readTabularPreview: function(input: string | Partial<TabularPreviewRequest>) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.readPreview,
            input
        );
    },
    writeCell: function(input: Partial<CellUpdateRequest>) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.writeCell,
            input
        );
    },
    writeCells: function(inputs: Partial<CellUpdateRequest>[]) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.writeCells,
            inputs
        );
    },
    renameColumn: function(input: Partial<ColumnRenameRequest>) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.renameColumn,
            input
        );
    },
    insertColumn: function(input: Partial<ColumnInsertRequest>) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.insertColumn,
            input
        );
    },
    removeColumn: function(input: Partial<ColumnRemoveRequest>) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.removeColumn,
            input
        );
    },
    insertRow: function(input: Partial<RowInsertRequest>) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.insertRow,
            input
        );
    },
    removeRow: function(input: Partial<RowRemoveRequest>) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.removeRow,
            input
        );
    },
    sortRows: function(input: Partial<RowSortRequest>) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.sortRows,
            input
        );
    },
    updateRowName: function(input: Partial<RowNameUpdateRequest>) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.updateRowName,
            input
        );
    },
    readVariableMetadata: function(objectName: string) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.readVariableMetadata,
            objectName
        );
    },
    writeVariableMetadata: function(input: Partial<VariableMetadataUpdateRequest>) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.writeVariableMetadata,
            input
        );
    },
    readValueLabels: function(objectName: string) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.readValueLabels,
            objectName
        );
    },
    writeValueLabels: function(input: Partial<ValueLabelUpdateRequest>) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.writeValueLabels,
            input
        );
    },
    readDeclaredMissing: function(objectName: string) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.readDeclaredMissing,
            objectName
        );
    },
    writeDeclaredMissing: function(input: Partial<DeclaredMissingUpdateRequest>) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.writeDeclaredMissing,
            input
        );
    },
    importData: function(input: Partial<ImportRequest>) {
        return invokeTabularRoute(
            ipcRenderer,
            tabularIpcChannels.importData,
            input
        );
    },
    planImportFile: function(input: Partial<ImportPlanRequest>) {
        return invokeImportFileRoute(
            ipcRenderer,
            importFileIpcChannels.plan,
            input
        );
    },
    previewImportFile: function(input: Record<string, unknown>) {
        return invokeImportFileRoute(
            ipcRenderer,
            importFileIpcChannels.preview,
            input
        );
    },
    getWorkingDirectory: function() {
        return invokeShellWindowRoute(
            ipcRenderer,
            shellWindowIpcChannels.getWorkingDirectory
        );
    },
    readHelpTopic: function(input: Partial<HelpTopicRequest>) {
        return invokeHelpRoute(ipcRenderer, helpIpcChannels.readTopic, input);
    },
    openHelpTopic: function(input: Partial<HelpTopicRequest>) {
        return invokeHelpRoute(ipcRenderer, helpIpcChannels.openTopic, input);
    },
    getHelpDocument: function() {
        return invokeHelpRoute(ipcRenderer, helpIpcChannels.getDocument);
    },
    openHelpCommandUrl: function(url: string) {
        return invokeHelpRoute(ipcRenderer, helpIpcChannels.openCommandUrl, url);
    },
    fetchRHelpPage: function(url: string) {
        return invokeHelpRoute(ipcRenderer, helpIpcChannels.fetchRPage, url);
    },
    runHelpExample: function(input: { topic?: string; package?: string }) {
        return invokeHelpRoute(ipcRenderer, helpIpcChannels.runExample, input);
    },
    readCompletions: function(input: Partial<CompletionRequest>) {
        return invokeRuntimeQueryRoute(
            ipcRenderer,
            runtimeQueryIpcChannels.readCompletions,
            input
        );
    },
    checkDependencies: function(input: Partial<DependencyCheckRequest>) {
        return invokeRuntimeQueryRoute(
            ipcRenderer,
            runtimeQueryIpcChannels.checkDependencies,
            input
        );
    },
    executeInvisibleQuery: function(input: Partial<InvisibleQueryRequest>) {
        return invokeRuntimeQueryRoute(
            ipcRenderer,
            runtimeQueryIpcChannels.executeInvisibleQuery,
            input
        );
    },
    executeInvisibleMutation: function(input: Partial<InvisibleMutationRequest>) {
        return invokeRuntimeQueryRoute(
            ipcRenderer,
            runtimeQueryIpcChannels.executeInvisibleMutation,
            input
        );
    },
    executeRuntimeMethod: function(input: Partial<RuntimeExtensionMethodRequest>) {
        return invokeRuntimeQueryRoute(
            ipcRenderer,
            runtimeQueryIpcChannels.executeRuntimeMethod,
            input
        );
    },
    callDialogExternal: function(name: string, parameters?: Record<string, unknown>): Promise<DialogExternalCallResult> {
        return invokeDialogRuntimeRoute(
            ipcRenderer,
            dialogRuntimeIpcChannels.callExternal,
            name,
            parameters || {}
        );
    },
    readConsoleStateChips: function(dataset: string) {
        return invokeDialogRuntimeRoute(
            ipcRenderer,
            dialogRuntimeIpcChannels.readConsoleStateChips,
            dataset
        );
    },
    executeDialog: function(input: Partial<DialogExecutionRequest>) {
        return invokeDialogRuntimeRoute(
            ipcRenderer,
            dialogRuntimeIpcChannels.executeDialog,
            input
        );
    },
    copyPayloadToClipboard: function(payload: CopyPayload) {
        return invokeShellClipboardRoute(
            ipcRenderer,
            shellClipboardIpcChannels.copyPayload,
            payload
        );
    },
    readClipboardText: function() {
        return invokeShellClipboardRoute(
            ipcRenderer,
            shellClipboardIpcChannels.readText
        );
    },
    selectImportFile: function() {
        return invokeShellFileDialogRoute(
            ipcRenderer,
            shellFileDialogIpcChannels.selectImportFile
        );
    },
    selectWorkingDirectory: function() {
        return invokeShellFileDialogRoute(
            ipcRenderer,
            shellFileDialogIpcChannels.selectWorkingDirectory
        );
    },
    selectWorkspaceOpenFile: function() {
        return invokeShellFileDialogRoute(
            ipcRenderer,
            shellFileDialogIpcChannels.selectWorkspaceOpenFile
        );
    },
    selectWorkspaceSaveFile: function() {
        return invokeShellFileDialogRoute(
            ipcRenderer,
            shellFileDialogIpcChannels.selectWorkspaceSaveFile
        );
    },
    selectScriptFile: function() {
        return invokeShellFileDialogRoute(
            ipcRenderer,
            shellFileDialogIpcChannels.selectScriptFile
        );
    },
    getScriptEditorDocument: function() {
        return invokeScriptEditor(scriptEditorIpcChannels.getDocument);
    },
    openScriptEditor: function() {
        return invokeScriptEditor(scriptEditorIpcChannels.openEditor);
    },
    insertScriptEditorCode: function(input: { code?: string }) {
        return invokeScriptEditor(scriptEditorIpcChannels.insertCode, input);
    },
    getDatasetEditorDocument: function() {
        return invokeDatasetEditor(datasetEditorIpcChannels.getDocument);
    },
    openDatasetEditor: function(objectName: string) {
        return invokeDatasetEditor(
            datasetEditorIpcChannels.openEditor,
            objectName
        );
    },
    setWorkspacePaneVisible: function(input: { visible: boolean; paneWidth?: number; restoreExistingExpansion?: boolean }) {
        return invokeShellWindowRoute(
            ipcRenderer,
            shellWindowIpcChannels.setWorkspacePaneVisible,
            input
        );
    },
    openScriptFileInEditor: function() {
        return invokeScriptEditor(scriptEditorIpcChannels.openFileInEditor);
    },
    openScriptFilePathInEditor: function(filePath: string) {
        return invokeScriptEditor(
            scriptEditorIpcChannels.openFilePathInEditor,
            filePath
        );
    },
    inspectPath: function(filePath: string) {
        return invokeShellFileDialogRoute(
            ipcRenderer,
            shellFileDialogIpcChannels.inspectPath,
            filePath
        );
    },
    openScriptFile: function() {
        return invokeScriptEditor(scriptEditorIpcChannels.openFile);
    },
    openScriptFilePath: function(filePath: string) {
        return invokeScriptEditor(scriptEditorIpcChannels.openFilePath, filePath);
    },
    listScriptDirectory: function(input: { dirPath?: string }) {
        return invokeScriptEditor(scriptEditorIpcChannels.listDirectory, input);
    },
    datasetViewer: {
        getSchema: function(name: string) {
            return invokeDatasetEditor(
                datasetEditorIpcChannels.getSchema,
                { name }
            );
        },
        updateCell: function(name: string, patch: DatasetCellUpdatePatch) {
            return invokeDatasetEditor(datasetEditorIpcChannels.updateCell, {
                name,
                row: patch?.row,
                column: patch?.column,
                value: patch?.value
            });
        },
        sortRows: function(
            name: string,
            column: string,
            options?: { decreasing?: boolean; naLast?: boolean; emptyLast?: boolean }
        ) {
            return invokeDatasetEditor(datasetEditorIpcChannels.sortRows, {
                name,
                column,
                decreasing: options?.decreasing === true,
                naLast: options?.naLast !== false,
                emptyLast: options?.emptyLast !== false
            });
        },
        updateColumnName: function(
            name: string,
            column: string,
            nextName: string
        ) {
            return invokeDatasetEditor(datasetEditorIpcChannels.updateColumnName, {
                name,
                column,
                nextName
            });
        },
        updateRowName: function(
            name: string,
            row: number,
            nextName: string
        ) {
            return invokeDatasetEditor(datasetEditorIpcChannels.updateRowName, {
                name,
                row,
                nextName
            });
        },
        insertRow: function(
            name: string,
            row: number,
            nextName: string,
            position: "before" | "after"
        ) {
            return invokeDatasetEditor(datasetEditorIpcChannels.insertRow, {
                name,
                row,
                nextName,
                position
            });
        },
        removeRow: function(name: string, row: number) {
            return invokeDatasetEditor(datasetEditorIpcChannels.removeRow, {
                name,
                row
            });
        },
        removeColumn: function(name: string, column: string) {
            return invokeDatasetEditor(datasetEditorIpcChannels.removeColumn, {
                name,
                column
            });
        },
        insertColumn: function(
            name: string,
            column: string,
            nextName: string,
            position: "before" | "after"
        ) {
            return invokeDatasetEditor(datasetEditorIpcChannels.insertColumn, {
                name,
                column,
                nextName,
                position
            });
        },
        getContent: function(name: string, request?: DatasetViewerContentRequest) {
            return invokeDatasetEditor(datasetEditorIpcChannels.getContent, {
                name,
                ...request
            });
        },
        getFilterMask: function(name: string, rowStart: number, rowCount: number) {
            return invokeDatasetEditor(datasetEditorIpcChannels.getFilterMask, {
                name,
                rowStart,
                rowCount
            });
        },
        getVariables: function(name: string) {
            return invokeDatasetEditor(
                datasetEditorIpcChannels.getVariables,
                { name }
            );
        },
        getVariablesBatch: function(name: string, start: number, count: number) {
            return invokeDatasetEditor(datasetEditorIpcChannels.getVariablesBatch, {
                name,
                start,
                count
            });
        },
        updateVariable: function(
            name: string,
            variableName: string,
            patch: DatasetVariableUpdatePatch
        ) {
            return invokeDatasetEditor(datasetEditorIpcChannels.updateVariable, {
                name,
                variableName,
                ...patch
            });
        }
    },
    saveScriptFile: function(input: { filePath?: string; content?: string }) {
        return invokeScriptEditor(scriptEditorIpcChannels.saveFile, input);
    },
    saveScriptFileAs: function(input: { filePath?: string; content?: string }) {
        return invokeScriptEditor(scriptEditorIpcChannels.saveFileAs, input);
    },
    updateScriptEditorDirtyState: function(input: { dirty?: boolean; filePath?: string; content?: string }) {
        sendScriptEditor(
            scriptEditorEventChannels.updateDirtyState,
            input
        );
    },
    confirmScriptEditorSave: function(input: { filePath?: string }) {
        return invokeScriptEditor(scriptEditorIpcChannels.confirmSave, input);
    },
    sendScriptEditorCloseSaveResult: function(input: { requestId?: string; ok?: boolean }) {
        sendScriptEditor(
            scriptEditorEventChannels.closeSaveResult,
            input
        );
    },
    openExternalUrl: function(url: string) {
        return invokePlotExternalRoute(
            ipcRenderer,
            plotExternalIpcChannels.openExternalUrl,
            url
        );
    },
    openPlotViewer: function(url: string) {
        return invokePlotExternalRoute(
            ipcRenderer,
            plotExternalIpcChannels.openPlotViewer,
            url
        );
    },
    savePlot: function(input: { url?: string; format?: "png" | "jpeg" | "svg" | "pdf" | "tiff" }) {
        return invokePlotExternalRoute(
            ipcRenderer,
            plotExternalIpcChannels.savePlot,
            input
        );
    },
    copyPlot: function(url: string) {
        return invokePlotExternalRoute(
            ipcRenderer,
            plotExternalIpcChannels.copyPlot,
            url
        );
    },
    openSettingsWindow: function() {
        return invokeApplicationSettingsRoute(
            ipcRenderer,
            applicationSettingsIpcChannels.openSettings
        );
    },
    openMenuCustomizationWindow: function() {
        return invokeApplicationSettingsRoute(
            ipcRenderer,
            applicationSettingsIpcChannels.openMenuCustomization
        );
    },
    openDialogRuntimeRequirementsWindow: function() {
        return invokeApplicationSettingsRoute(
            ipcRenderer,
            applicationSettingsIpcChannels.openDialogRuntimeRequirements
        );
    },
    openAboutWindow: function() {
        return invokeApplicationSettingsRoute(
            ipcRenderer,
            applicationSettingsIpcChannels.openAbout
        );
    },
    openProductDialog: function(dialogId: string) {
        return invokeDialogRuntimeRoute(
            ipcRenderer,
            dialogRuntimeIpcChannels.openProductDialog,
            { dialogId }
        );
    },
    openDevDiagnostics: function() {
        return invokeShellWindowRoute(
            ipcRenderer,
            shellWindowIpcChannels.openDevDiagnostics
        );
    },
    onMenuCommand: function(callback) {
        onAppEvent(applicationEventChannels.menuCommand, callback);
    },
    onRuntimeSession: function(callback) {
        onAppEvent(applicationEventChannels.runtimeSession, callback);
    },
    onRuntimeTranscript: function(callback) {
        onAppEvent(applicationEventChannels.runtimeTranscript, callback);
    },
    onWorkspace: function(callback) {
        onAppEvent(applicationEventChannels.workspace, callback);
    },
    onRuntimeEvents: function(callback) {
        onAppEvent(applicationEventChannels.runtimeEvents, callback);
    },
    onActiveDataset: function(callback) {
        onAppEvent(applicationEventChannels.activeDataset, callback);
    },
    onLanguageChanged: function(callback) {
        onAppEvent(applicationEventChannels.languageChanged, callback);
    },
    onProductConsoleStateChips: function(callback) {
        onAppEvent(applicationEventChannels.productConsoleStateChips, callback);
    },
    onTabularPreview: function(callback) {
        onAppEvent(applicationEventChannels.tabularPreview, callback);
    },
    onCellUpdate: function(callback) {
        onAppEvent(applicationEventChannels.cellUpdate, callback);
    },
    onVariableMetadata: function(callback) {
        onAppEvent(applicationEventChannels.variableMetadata, callback);
    },
    onValueLabels: function(callback) {
        onAppEvent(applicationEventChannels.valueLabels, callback);
    },
    onDeclaredMissing: function(callback) {
        onAppEvent(applicationEventChannels.declaredMissing, callback);
    },
    onImportResult: function(callback) {
        onAppEvent(applicationEventChannels.importResult, callback);
    },
    onClipboardResult: function(callback) {
        onAppEvent(applicationEventChannels.clipboardResult, callback);
    },
    onDialogCommandPreview: function(callback) {
        onAppEvent(applicationEventChannels.dialogCommandPreview, callback);
    },
    onPlotViewerUpdate: function(callback) {
        onAppEvent(applicationEventChannels.plotViewerUpdate, callback);
    },
    onDatasetEditorOpen: function(callback) {
        onAppEvent(applicationEventChannels.datasetEditorOpen, callback);
    },
    onMainZoomFactor: function(callback) {
        onAppEvent(applicationEventChannels.mainZoomFactor, callback);
    },
    onScriptEditorInsertCode: function(callback) {
        onAppEvent(applicationEventChannels.scriptEditorInsertCode, callback);
    },
    onScriptEditorOpenFile: function(callback) {
        onAppEvent(applicationEventChannels.scriptEditorOpenFile, callback);
    },
    onScriptEditorRequestSaveForClose: function(callback) {
        onAppEvent(applicationEventChannels.scriptEditorRequestSaveForClose, callback);
    },
    ...hostBridge
};


if (process.contextIsolated) {
    contextBridge.exposeInMainWorld("dialogForge", api);
}
else {
    window.dialogForge = api;
}
