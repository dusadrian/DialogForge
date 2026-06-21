import type {
    ApplicationComposition,
    DialogDefinition,
    EvaluatedProductCapability,
    EvaluatedStartupTask,
    FeatureEvaluation,
    ProductPackageSourcePolicy
} from "../../../core/contracts/applicationComposition";
import type {
    ActiveDatasetSnapshot,
    ObjectInspectionResult,
    PromptSnapshot,
    RuntimeProviderManifest,
    RuntimeSessionSnapshot,
    TabularPreviewSnapshot,
    TranscriptEvent,
    VariableMetadataFieldKey,
    VariableMetadataSnapshot,
    WorkspaceSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import type {
    OpenFileResult
} from "../../../shell-electron/filesystem/openFileResult";
import type { CopyPayload } from "../../../dataset-editor/clipboard/copyPayload";
import type { PastePayload } from "../../../dataset-editor/clipboard/pastePayload";
import type { DatasetEditorState } from "../../../dataset-editor/state/datasetEditorState";
import { datasetEditorStateApi } from "../../../dataset-editor/state/datasetEditorState";
import { keyboardCommandsApi } from "../../../dataset-editor/commands/keyboardCommands";
import { importFormatApi } from "../../../runtime/tabular-data/importFormat";
import { createConsoleSessionState } from "../../../console/services/consoleSessionState";
import {
    createConsoleToolbarController
} from "../../../console/renderer/consoleToolbarController";
import {
    createConsoleTranscriptController
} from "../../../console/renderer/consoleTranscriptController";
import { runtimePanelsApi } from "../runtime-panels/runtimePanels";
import { importPanelApi } from "../import-panel/importPanel";
import {
    createMainImportController
} from "../import-panel/mainImportController";
import { runtimeToolsPanelApi } from "../runtime-panels/runtimeToolsPanel";
import {
    createMainApplicationPanelController
} from "../composition-panels/mainApplicationPanelController";
import {
    createMainCompositionBootstrapController
} from "../composition-panels/mainCompositionBootstrapController";
import {
    createMainDialogController
} from "../dialog-host/mainDialogController";
import {
    createMainDialogCommandPreviewController
} from "../dialog-host/mainDialogCommandPreviewController";
import { createWorkspacePaneVisibility } from "../workspace-pane/workspacePaneVisibility";
import {
    createMainRendererEventController
} from "./mainRendererEventController";
import {
    createMainStartupController
} from "./mainStartupController";
import {
    createMainUiBindingController
} from "./mainUiBindingController";
import {
    createMainDomLookup
} from "./mainDomLookup";
import {
    createMainDomHelpers
} from "./mainDomHelpers";
import {
    createMainZoomScaling
} from "./mainZoomScaling";
import {
    createMainConsoleServices
} from "./mainConsoleServices";
import {
    createMainRuntimeWorkflows
} from "./mainRuntimeWorkflows";
import {
    createMainCommandFieldAppender,
    createMainPanelRendering
} from "./mainPanelRendering";
import {
    createMainDatasetNavigationSupport
} from "./mainDatasetNavigationSupport";
import {
    createMainCommandHistoryServices
} from "./mainCommandHistoryServices";
import {
    createMainRuntimeSessionServices
} from "./mainRuntimeSessionServices";
import {
    createMainDatasetResultRendering
} from "./mainDatasetResultRendering";
import {
    createMainDatasetInteractionServices
} from "./mainDatasetInteractionServices";
import {
    createMainRuntimeCommandServices
} from "./mainRuntimeCommandServices";
import {
    createMainWorkspaceServices
} from "./mainWorkspaceServices";
import {
    createMainDatasetCommandServices
} from "./mainDatasetCommandServices";
import {
    createMainShellCommandServices
} from "./mainShellCommandServices";
import {
    colorizeConsoleRCodeInto
} from "../../../console/consoleSyntax";


const {
    byId,
    inputById,
    textAreaById,
    buttonById,
    selectById,
    empty
} = createMainDomLookup(window.document);


const mainDomHelpers = createMainDomHelpers(document, byId);
const setBootStage = mainDomHelpers.setBootStage;
const applyControlUpdates = mainDomHelpers.applyControlUpdates;
const setStatusClass = mainDomHelpers.setStatusClass;
const appendCommandField = createMainCommandFieldAppender(document);


const variableMetadataFields: VariableMetadataFieldKey[] = [
    "name",
    "type",
    "role",
    "width",
    "decimals",
    "label",
    "values",
    "align",
    "measure"
];
const {
    createInitialDatasetEditorState
} = datasetEditorStateApi;
const {
    getDatasetEditorKeyboardCommand
} = keyboardCommandsApi;
const {
    renderObjectInspection: renderObjectInspectionPanel,
    renderTranscript: renderTranscriptPanel
} = runtimePanelsApi;
const {
    applyImportPlanToControls,
    applySelectedImportFile
} = importPanelApi;
const {
    readDependencyCheckNames
} = runtimeToolsPanelApi;
const { inferImportFormat } = importFormatApi;

let datasetEditorState: DatasetEditorState = createInitialDatasetEditorState();
let runtimeSessionSnapshot: RuntimeSessionSnapshot | null = null;
let workspaceSnapshot: WorkspaceSnapshot | null = null;
let activeDatasetSnapshot: ActiveDatasetSnapshot | null = null;
let tabularPreviewSnapshot: TabularPreviewSnapshot | null = null;
let variableMetadataSnapshot: VariableMetadataSnapshot | null = null;
let copyPayloadSnapshot: CopyPayload | null = null;
let pastePayloadSnapshot: PastePayload | null = null;
let promptSnapshot: PromptSnapshot | null = null;
let startupTasksSnapshot: EvaluatedStartupTask[] = [];
let productCapabilitiesSnapshot: EvaluatedProductCapability[] = [];
let productDialogsSnapshot: DialogDefinition[] = [];
let productId = "base";
let packageSourcePolicy: ProductPackageSourcePolicy = {};
let applicationI18n: Record<string, string> = {};
let runtimeProviderId = "none";
let uiActionCommandVisibility: "hidden" | "visible" = "hidden";
let consoleWorkingDirectoryPath = "";
let consoleHomeDirectoryPath = "";
const mainZoomScaling = createMainZoomScaling();
const consoleSessionState = createConsoleSessionState(function(): string {
    return String(runtimeSessionSnapshot?.status || "not-started");
});
const mainConsoleServices = createMainConsoleServices({
    document,
    dialogForge: window.dialogForge,
    session: consoleSessionState,
    getRuntimeSession: function() {
        return runtimeSessionSnapshot;
    },
    startRuntimeSession: function() {
        return startRuntimeSession();
    },
    renderStatus: function(snapshot): void {
        renderConsoleStatus(snapshot);
    },
    recordHistory: function(text): void {
        recordVisibleCommandHistory(text);
    },
    navigateFallbackHistory: function(direction): void {
        navigateVisibleCommandHistory(direction);
    }
});
const consoleCompletionModel = mainConsoleServices.completionModel;
const consoleCommandHistory = mainConsoleServices.commandHistory;
const mainConsoleCoordinator = mainConsoleServices.coordinator;
const notifyConsoleSessionPhase = mainConsoleCoordinator.notifySessionPhase;
const setConsolePromptState = mainConsoleCoordinator.setPromptState;
const setConsoleRuntimeBusy = mainConsoleCoordinator.setRuntimeBusy;
const interruptConsoleExecution = mainConsoleCoordinator.interrupt;
const initializeConsoleFlow = mainConsoleCoordinator.initializeFlow;
const initializeVisibleCommandEditor = mainConsoleCoordinator.initializeInput;
const focusVisibleCommandInput = mainConsoleCoordinator.focus;
const setVisibleCommandText = mainConsoleCoordinator.setText;
const executeVisibleCommandText = mainConsoleCoordinator.executeText;
const executeVisibleCommand = mainConsoleCoordinator.executeCurrent;
const handleVisibleCommandKeydown =
    mainConsoleCoordinator.handleFallbackKeydown;

const workspacePaneVisibility = createWorkspacePaneVisibility({
    document,
    storage: window.localStorage,
    readZoomFactor: mainZoomScaling.readZoomFactor,
    readSettings: function() {
        return window.dialogForge.readSettings();
    },
    writeSettings: function(settings) {
        void window.dialogForge.writeSettings(settings);
    },
    setWindowVisible: function(request) {
        return window.dialogForge.setWorkspacePaneVisible(request);
    },
    resizeConsole: function() {
        mainConsoleCoordinator.resize();
    },
    focusConsole: focusVisibleCommandInput
});
const mainRuntimeWorkflows = createMainRuntimeWorkflows({
    dialogForge: window.dialogForge,
    getProductId: function(): string {
        return productId;
    },
    getPackageSourcePolicy: function(): ProductPackageSourcePolicy {
        return packageSourcePolicy;
    },
    executeVisibleCommand: async function(command, source): Promise<void> {
        await executeVisibleCommandText(command, source);
    },
    renderImportFileResult: function(result): void {
        renderImportFileResult(result);
    },
    renderRuntimeMethodResult: function(result): void {
        renderRuntimeMethodResult(result);
    },
    refreshConsoleWorkingDirectory: function(): Promise<void> {
        return refreshConsoleWorkingDirectory();
    },
    refreshWorkspace: function(): Promise<void> {
        return refreshWorkspace();
    }
});
const packageInstallWorkflow = mainRuntimeWorkflows.packageInstallWorkflow;
const runtimeFileWorkflow = mainRuntimeWorkflows.runtimeFileWorkflow;


const applicationPanelController = createMainApplicationPanelController({
    document,
    helpers: {
        appendField: function(parent, name, value): void {
            appendCommandField(parent, name, value);
        },
        empty,
        setStatusClass
    },
    setRuntimeSession: function(snapshot): void {
        runtimeSessionSnapshot = snapshot;
    },
    setPromptSnapshot: function(snapshot): void {
        promptSnapshot = snapshot;
    },
    setStartupTasks: function(tasks): void {
        startupTasksSnapshot = tasks;
    },
    setUiCommandVisibility: function(value): void {
        uiActionCommandVisibility = value;
    },
    renderConsoleToolbar: function(): void {
        renderConsoleToolbar();
    },
    notifyConsoleSessionPhase,
    executeStartupTask: function(task): void {
        void executeStartupTask(task);
    },
    openPlotViewer: window.dialogForge.openPlotViewer,
    writeSettings: window.dialogForge.writeSettings
});


const renderMenu = applicationPanelController.renderMenu;
const renderCapabilities = applicationPanelController.renderCapabilities;
const renderRuntimeSession = applicationPanelController.renderRuntimeSession;
const renderRuntimeEvents = applicationPanelController.renderRuntimeEvents;
const renderPrompts = applicationPanelController.renderPrompts;
const renderFeatures = applicationPanelController.renderFeatures;
const renderProductCapabilities =
    applicationPanelController.renderProductCapabilities;
const renderProductInfo = applicationPanelController.renderProductInfo;
const renderProductSettings = applicationPanelController.renderProductSettings;
const renderApplicationSettings =
    applicationPanelController.renderApplicationSettings;
const updateUiCommandVisibility =
    applicationPanelController.updateUiCommandVisibility;
const renderStartupTasks = applicationPanelController.renderStartupTasks;
const renderStartupTaskResult =
    applicationPanelController.renderStartupTaskResult;

const renderTranscript = function(events: TranscriptEvent[]) {
    if (mainConsoleCoordinator.scrollToBottom()) {
        return;
    }

    renderTranscriptPanel(document, byId("runtimeTranscript"), events, {
        appendField: appendCommandField,
        empty
    });
    byId("consoleTerminal").scrollTop = byId("consoleTerminal").scrollHeight;
};

const renderConsoleStatus = function(session: RuntimeSessionSnapshot): void {
    const status = byId("consoleStatus");
    const coverMessage = byId("consoleCoverMessage");
    const runtimeStatus = String(session.status || "unknown");
    const failure = String(session.message || "").trim();
    const normalizedFailure = failure.toLowerCase();
    const message = runtimeStatus === "starting"
        ? "Starting R runtime..."
        : runtimeStatus === "failed"
            ? normalizedFailure.includes("unable to find r")
                ? `R was not found on this system. ${failure}`
                : `R runtime failed to start: ${failure || "Unknown startup error."}`
            : "";

    status.textContent = [
        session.providerId || "runtime",
        runtimeStatus,
        session.connection || ""
    ].filter(Boolean).join(" - ");
    coverMessage.textContent = message;
    document.body.classList.toggle("console-cover-visible", Boolean(message));
};

const consoleToolbar = createConsoleToolbarController({
    document,
    getRuntimeSession: () => runtimeSessionSnapshot,
    isRuntimeBusy: consoleSessionState.isRuntimeBusy,
    getWorkingDirectoryPath: () => consoleWorkingDirectoryPath,
    getHomeDirectoryPath: () => consoleHomeDirectoryPath,
    getActiveDatasetName: () => (
        activeDatasetSnapshot?.objectName || ""
    ),
    setWorkingDirectoryPaths: (path, home) => {
        consoleWorkingDirectoryPath = path;
        consoleHomeDirectoryPath = home;
    },
    readWorkingDirectory: () => {
        return window.dialogForge.getWorkingDirectory();
    },
    clearTranscriptEvents: () => {
        consoleTranscriptController.clear();
    },
    clearTranscriptIdentity: () => {
        consoleSessionState.clearTranscriptIdentity();
    },
    clearConsoleSurface: () => {
        mainConsoleCoordinator.clear();
    },
    renderTranscript: () => {
        consoleTranscriptController.render();
    },
    setInputText: setVisibleCommandText,
    focusInput: focusVisibleCommandInput,
    restartRuntime: (action) => {
        return window.dialogForge.restartRuntime(action);
    },
    applyRuntimeSession: (snapshot) => {
        renderRuntimeSession(snapshot);
        renderConsoleStatus(snapshot);
    },
    refreshRuntimeEvents: () => {
        void refreshRuntimeEvents();
    },
    refreshPrompts: () => {
        void refreshPrompts();
    },
    refreshWorkspace: () => {
        return refreshWorkspace();
    }
});
const renderConsoleToolbar = consoleToolbar.render;

const workspaceServices = createMainWorkspaceServices({
    document,
    translate: function(key): string {
        return applicationI18n[key] || key;
    },
    getWorkspaceSnapshot: function() {
        return workspaceSnapshot;
    },
    setWorkspaceSnapshot: function(snapshot): void {
        workspaceSnapshot = snapshot;
    },
    getActiveDataset: function() {
        return activeDatasetSnapshot;
    },
    setActiveDatasetSnapshot: function(snapshot): void {
        activeDatasetSnapshot = snapshot;
    },
    ingestCompletionNames: function(names): void {
        consoleCompletionModel.ingestObjectNames(names);
    },
    getRuntimeProviderId: function(): string {
        return runtimeProviderId;
    },
    hasConsoleSurface: mainConsoleCoordinator.hasSurface,
    setConsoleText: mainConsoleCoordinator.setText,
    focusConsole: focusVisibleCommandInput,
    openDatasetEditor: window.dialogForge.openDatasetEditor,
    applyPaneVisibility: function(visible): void {
        workspacePaneVisibility.apply(visible, {
            persist: false
        });
    },
    renderConsoleToolbar,
    renderObjectInspection: function(result): void {
        renderObjectInspection(result);
    },
    refreshRuntimeEvents: function(): void {
        void refreshRuntimeEvents();
    },
    readDatasetDetails: function(objectName): void {
        void readTabularPreview(objectName);
        void readVariableMetadata(objectName);
        void readValueLabels(objectName);
        void readDeclaredMissing(objectName);
    },
    confirmRemove: function(objectName): boolean {
        return window.confirm(`Remove workspace object "${objectName}"?`);
    },
    confirmClear: function(): boolean {
        return window.confirm("Clear all visible objects from the workspace?");
    }
});


const initializeWorkspacePane = workspaceServices.initializeWorkspacePane;
const renderWorkspace = workspaceServices.renderWorkspace;
const renderActiveDataset = workspaceServices.renderActiveDataset;
const refreshWorkspace = workspaceServices.refreshWorkspace;
const inspectWorkspaceObject = workspaceServices.inspectWorkspaceObject;
const removeWorkspaceObject = workspaceServices.removeWorkspaceObject;
const clearWorkspace = workspaceServices.clearWorkspace;
const setActiveDataset = workspaceServices.setActiveDataset;
const applyWorkspaceRuntimeEventsToPane =
    workspaceServices.applyWorkspaceRuntimeEvents;


const refreshConsoleWorkingDirectory =
    consoleToolbar.refreshWorkingDirectory;
const clearConsoleTranscript = consoleToolbar.clearTranscript;
const resetConsoleInput = consoleToolbar.resetInput;
const restartRuntimeClean = consoleToolbar.restartClean;
const restartRuntimeRestoreWorkspace =
    consoleToolbar.restartRestoreWorkspace;

const datasetInteractionServices = createMainDatasetInteractionServices({
    window,
    document,
    contextMenu: byId("datasetEditorContextMenu"),
    variableMetadataFields,
    getState: function() {
        return datasetEditorState;
    },
    setState: function(state): void {
        datasetEditorState = state;
    },
    getPreview: function() {
        return tabularPreviewSnapshot;
    },
    setPreview: function(preview): void {
        tabularPreviewSnapshot = preview;
    },
    getMetadata: function() {
        return variableMetadataSnapshot;
    },
    setMetadata: function(snapshot): void {
        variableMetadataSnapshot = snapshot;
    },
    getActiveDatasetName: function(): string {
        return activeDatasetSnapshot?.objectName || "";
    },
    clearCopyPayload: function(): void {
        copyPayloadSnapshot = null;
    },
    applyControlUpdates,
    appendCommandField,
    empty,
    renderLayoutStatus: function(result): void {
        renderCommandRequestStatus("datasetLayoutStatus", result);
    },
    renderEditStatus: function(result): void {
        renderCommandRequestStatus("cellWriteStatus", result);
    },
    executeCommand: function(command): void {
        executeDatasetCommand(command);
    },
    writeCell: function(): void {
        void writeCell();
    },
    writeVariableMetadata: function(): void {
        void writeVariableMetadata();
    }
});


const applyDatasetViewportControls =
    datasetInteractionServices.applyDatasetViewport;
const shiftDatasetViewport =
    datasetInteractionServices.shiftDatasetViewport;
const applyVariableViewportControls =
    datasetInteractionServices.applyVariableViewport;
const shiftVariableViewport =
    datasetInteractionServices.shiftVariableViewport;
const applySelectedColumnWidth =
    datasetInteractionServices.applySelectedColumnWidth;
const resizeSelectedColumn =
    datasetInteractionServices.resizeSelectedColumn;
const moveSelectedColumn = datasetInteractionServices.moveSelectedColumn;
const renderTabularPreview =
    datasetInteractionServices.renderTabularPreview;
const renderDatasetEditorSelection =
    datasetInteractionServices.renderDatasetEditorSelection;
const hideDatasetEditorContextMenu =
    datasetInteractionServices.hideDatasetEditorContextMenu;
const renderVariableMetadata =
    datasetInteractionServices.renderVariableMetadata;
const renderValueLabels = datasetInteractionServices.renderValueLabels;
const renderDeclaredMissing =
    datasetInteractionServices.renderDeclaredMissing;
const toggleDatasetEditorPane =
    datasetInteractionServices.toggleDatasetEditorPane;
const showDatasetEditorContextMenu =
    datasetInteractionServices.showDatasetEditorContextMenu;
const selectPreviewRow = datasetInteractionServices.selectPreviewRow;
const selectPreviewColumn = datasetInteractionServices.selectPreviewColumn;
const getCurrentDatasetEditorObjectName =
    datasetInteractionServices.getCurrentDatasetEditorObjectName;
const createDatasetEditorStateSnapshot =
    datasetInteractionServices.createDatasetEditorStateSnapshot;
const consumeGoToDialogContext =
    datasetInteractionServices.consumeGoToDialogContext;
const gotoDatasetEditorCase =
    datasetInteractionServices.gotoDatasetEditorCase;
const gotoDatasetEditorVariable =
    datasetInteractionServices.gotoDatasetEditorVariable;
const beginDatasetEdit = datasetInteractionServices.beginDatasetEdit;
const cancelDatasetEdit = datasetInteractionServices.cancelDatasetEdit;
const commitDatasetEdit = datasetInteractionServices.commitDatasetEdit;

const renderObjectInspection = function(result: ObjectInspectionResult): void {
    const host = document.getElementById("workspaceInspectStatus");

    if (!host) {
        return;
    }

    renderObjectInspectionPanel(host, result, {
        appendField: appendCommandField,
        empty
    });
};

const datasetResultRendering = createMainDatasetResultRendering({
    document,
    appendCommandField,
    empty,
    setCopyPayload: function(payload): void {
        copyPayloadSnapshot = payload;
    },
    setPastePayload: function(payload): void {
        pastePayloadSnapshot = payload;
    },
    recordTranscriptEvents: function(events): void {
        recordTranscriptEvents(events);
    }
});


const renderCellUpdate = datasetResultRendering.renderCellUpdate;
const renderColumnRename = datasetResultRendering.renderColumnRename;
const renderColumnStructure = datasetResultRendering.renderColumnStructure;
const renderCommandRequestStatus =
    datasetResultRendering.renderCommandRequestStatus;
const renderRowNameUpdate = datasetResultRendering.renderRowNameUpdate;
const renderRowStructure = datasetResultRendering.renderRowStructure;
const renderCopyPayload = datasetResultRendering.renderCopyPayload;
const renderClipboardResult = datasetResultRendering.renderClipboardResult;
const renderClipboardReadResult =
    datasetResultRendering.renderClipboardReadResult;
const renderPastePayload = datasetResultRendering.renderPastePayload;
const renderPasteApplyResult = datasetResultRendering.renderPasteApplyResult;

const renderVariableMetadataUpdate =
    datasetResultRendering.renderVariableMetadataUpdate;
const renderValueLabelUpdate =
    datasetResultRendering.renderValueLabelUpdate;
const renderDeclaredMissingUpdate =
    datasetResultRendering.renderDeclaredMissingUpdate;

const consoleTranscriptController = createConsoleTranscriptController({
    session: consoleSessionState,
    getTranscript: function() {
        return mainConsoleCoordinator.getTranscript();
    },
    setPromptState: setConsolePromptState,
    setRuntimeBusy: setConsoleRuntimeBusy,
    renderEvents: renderTranscript
});


const recordTranscriptEvents = consoleTranscriptController.record;

const panelRendering = createMainPanelRendering({
    document,
    dialogForge: window.dialogForge,
    selectedCommand: byId("selectedCommand"),
    appendCommandField,
    empty,
    setStatusClass,
    recordTranscriptEvents,
    scrollTo: function(domTarget): void {
        byId(domTarget).scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
});


const renderImportResult = panelRendering.renderImportResult;
const renderImportFileResult = panelRendering.renderImportFileResult;
const renderImportPlan = panelRendering.renderImportPlan;
const renderImportPreview = panelRendering.renderImportPreview;
const renderHelpTopic = panelRendering.renderHelpTopic;
const renderCompletions = panelRendering.renderCompletions;
const checkDependenciesForNames = panelRendering.checkDependencies;
const renderInvisibleQuery = panelRendering.renderInvisibleQuery;
const renderInvisibleMutation = panelRendering.renderInvisibleMutation;
const renderSelectedCommand =
    panelRendering.renderSelectedCommand;
const renderProductCommandResult =
    panelRendering.renderProductCommandResult;
const renderRuntimeMethodResult =
    panelRendering.renderRuntimeMethodResult;
const renderFeatureEntrypointActivation =
    panelRendering.renderFeatureEntrypointActivation;

const mainDialogController = createMainDialogController({
    executeDialog: window.dialogForge.executeDialog
});


const commandHistoryServices = createMainCommandHistoryServices({
    document,
    commandLog: byId("commandLog"),
    appendCommandField,
    empty,
    setStatusClass,
    renderSelectedCommand,
    recordConsoleHistory: consoleCommandHistory.record,
    navigateConsoleHistory: consoleCommandHistory.navigate,
    navigateConsoleSurfaceHistory: function(direction): boolean {
        if (direction < 0) {
            return mainConsoleCoordinator.historyPrevious();
        }

        return mainConsoleCoordinator.historyNext();
    },
    setVisibleCommandText
});


const recordCommand = commandHistoryServices.recordCommand;
const recordVisibleCommandHistory =
    commandHistoryServices.recordVisibleCommandHistory;
const navigateVisibleCommandHistory =
    commandHistoryServices.navigateVisibleCommandHistory;

const runtimeSessionServices = createMainRuntimeSessionServices({
    dialogForge: window.dialogForge,
    promptText: inputById("promptText"),
    promptAnswer: inputById("promptAnswer"),
    getPromptSnapshot: function() {
        return promptSnapshot;
    },
    getStartupTasks: function() {
        return startupTasksSnapshot;
    },
    getRuntimeSession: function() {
        return runtimeSessionSnapshot;
    },
    renderPrompts,
    renderStartupTaskResult,
    renderRuntimeEvents,
    renderRuntimeSession,
    renderConsoleStatus,
    refreshWorkspace: function(): Promise<void> {
        return refreshWorkspace();
    }
});
const refreshRuntimeEvents = runtimeSessionServices.refreshRuntimeEvents;
const refreshPrompts = runtimeSessionServices.refreshPrompts;
const startRuntimeSession = runtimeSessionServices.startRuntimeSession;
const stopRuntimeSession = runtimeSessionServices.stopRuntimeSession;
const queuePrompt = runtimeSessionServices.queuePrompt;
const answerFirstPrompt = runtimeSessionServices.answerFirstPrompt;
const executeStartupTask = runtimeSessionServices.executeStartupTask;

const datasetNavigationSupport = createMainDatasetNavigationSupport({
    getProductCapabilities: function() {
        return productCapabilitiesSnapshot;
    },
    getProductDialogs: function() {
        return productDialogsSnapshot;
    },
    prepareContext: datasetInteractionServices.prepareGoToDialogContext,
    executeGoToDialog: mainDialogController.executeGoTo
});
const findDatasetNavigationDialogId =
    datasetNavigationSupport.findDialogId;
const executeProductGoToDialog =
    datasetNavigationSupport.executeGoToDialog;


const runtimeCommandServices = createMainRuntimeCommandServices({
    getProductId: function(): string {
        return productId;
    },
    installRequired: function(value): Promise<void> {
        return packageInstallWorkflow.installRequired(value);
    },
    updateRequired: function(value): Promise<void> {
        return packageInstallWorkflow.updateRequired(value);
    },
    renderProductCommandResult,
    refreshRuntimeEvents: function(): void {
        void refreshRuntimeEvents();
    },
    checkDependencies: checkDependenciesForNames,
    helpTopic: inputById("helpTopic"),
    completionPrefix: inputById("completionPrefix"),
    dependencyNames: inputById("dependencyNames"),
    invisibleQuery: inputById("invisibleQueryInput"),
    invisibleMutationName: inputById("invisibleMutationName"),
    invisibleMutationValue: inputById("invisibleMutationValue"),
    readDependencyNames: readDependencyCheckNames,
    renderHelpTopic,
    renderCompletions,
    renderInvisibleQuery,
    renderInvisibleMutation
});


const executeProductCommand = runtimeCommandServices.executeProductCommand;
const readHelpTopic = runtimeCommandServices.readHelpTopic;
const readCompletions = runtimeCommandServices.readCompletions;
const checkDependencies = runtimeCommandServices.checkDependencies;
const executeInvisibleQuery = runtimeCommandServices.executeInvisibleQuery;
const executeInvisibleMutation =
    runtimeCommandServices.executeInvisibleMutation;

const importControls = {
    source: inputById("importSource"),
    format: inputById("importFormat"),
    target: inputById("importTarget"),
    overwrite: inputById("importOverwrite")
};


const mainImportController = createMainImportController({
    controls: importControls,
    inferFormat: inferImportFormat,
    applyPlan: function(result): void {
        applyImportPlanToControls(importControls, result);
    },
    applySelectedFile: function(result): boolean {
        return applySelectedImportFile(
            importControls,
            result,
            inferImportFormat
        );
    },
    renderFileResult: renderImportFileResult,
    renderPlan: renderImportPlan,
    renderPreview: renderImportPreview,
    renderResult: renderImportResult,
    getCommandVisibility: function() {
        return uiActionCommandVisibility;
    },
    refreshWorkspace,
    setActiveDataset,
    refreshRuntimeEvents
});

const datasetCommandServices = createMainDatasetCommandServices({
    window,
    document,
    dialogForge: window.dialogForge,
    getState: function() {
        return datasetEditorState;
    },
    setState: function(state): void {
        datasetEditorState = state;
    },
    getPreview: function() {
        return tabularPreviewSnapshot;
    },
    getMetadata: function() {
        return variableMetadataSnapshot;
    },
    getCopyPayload: function() {
        return copyPayloadSnapshot;
    },
    getPastePayload: function() {
        return pastePayloadSnapshot;
    },
    getUiCommandVisibility: function() {
        return uiActionCommandVisibility;
    },
    renderSelection: renderDatasetEditorSelection,
    renderStatus: renderCommandRequestStatus,
    renderTabularPreview,
    renderVariableMetadata,
    renderVariableMetadataUpdate,
    renderValueLabels,
    renderValueLabelUpdate,
    renderDeclaredMissing,
    renderDeclaredMissingUpdate,
    renderCellUpdate,
    renderColumnRename,
    renderColumnStructure,
    renderRowNameUpdate,
    renderRowStructure,
    renderCopyPayload,
    renderClipboardResult,
    renderClipboardReadResult,
    renderPastePayload,
    renderPasteApplyResult,
    refreshRuntimeEvents: function(): void {
        void refreshRuntimeEvents();
    },
    getGoToDialogId: findDatasetNavigationDialogId,
    executeProductGoToDialog: function(dialogId, mode): void {
        void executeProductGoToDialog(dialogId, mode);
    },
    selectRow: selectPreviewRow,
    selectColumn: selectPreviewColumn,
    beginEdit: beginDatasetEdit,
    commitEdit: commitDatasetEdit,
    cancelEdit: cancelDatasetEdit,
    toggleDatasetEditorPane
});
const readTabularPreview = datasetCommandServices.readTabularPreview;
const readVariableMetadata = datasetCommandServices.readVariableMetadata;
const writeVariableMetadata = datasetCommandServices.writeVariableMetadata;
const readValueLabels = datasetCommandServices.readValueLabels;
const writeValueLabels = datasetCommandServices.writeValueLabels;
const readDeclaredMissing = datasetCommandServices.readDeclaredMissing;
const writeDeclaredMissing = datasetCommandServices.writeDeclaredMissing;
const writeCell = datasetCommandServices.writeCell;
const updateRowName = datasetCommandServices.updateRowName;
const executeDatasetCommand = datasetCommandServices.executeDatasetCommand;

const setRuntimeWorkingDirectory = runtimeFileWorkflow.setWorkingDirectory;
const runRuntimeScriptFile = runtimeFileWorkflow.runScriptFile;
const openRuntimeWorkspaceFile = runtimeFileWorkflow.openWorkspaceFile;
const saveRuntimeWorkspaceFile = runtimeFileWorkflow.saveWorkspaceFile;
const openScriptFile = window.dialogForge.openScriptFileInEditor;
const openScriptFilePath = window.dialogForge.openScriptFilePathInEditor;

const shellCommandServices = createMainShellCommandServices({
    dialogForge: window.dialogForge,
    recordCommand,
    startRuntime: function(): void {
        void startRuntimeSession();
    },
    stopRuntime: function(): void {
        void stopRuntimeSession();
    },
    refreshWorkspace,
    openWorkspaceFile: openRuntimeWorkspaceFile,
    saveWorkspaceFile: saveRuntimeWorkspaceFile,
    setWorkingDirectory: setRuntimeWorkingDirectory,
    openScriptFile,
    runScriptFile: runRuntimeScriptFile,
    executeDatasetCommand,
    executeProductCommand,
    executeVisibleCommandText: async function(command, source): Promise<void> {
        await executeVisibleCommandText(command, source);
    },
    renderFeatureEntrypointActivation,
    renderRuntimeResult: renderRuntimeMethodResult,
    refreshWorkingDirectory: refreshConsoleWorkingDirectory,
    openScriptFilePath,
    applyImportFile: mainImportController.applyFile
});


const bindFileDropHandling = shellCommandServices.bindFileDropHandling;
const handleMenuCommand = shellCommandServices.handleMenuCommand;

const dialogCommandPreviewController =
    createMainDialogCommandPreviewController({
        document: window.document,
        window,
        colorize: colorizeConsoleRCodeInto,
        writeClipboardText: async function(text): Promise<void> {
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                    return;
                }
            } catch {
                // The preload fallback remains available when browser clipboard
                // permission is unavailable.
            }

            window.dialogForge.writeClipboardText(text);
        },
        insertScriptEditorCode: async function(text): Promise<void> {
            await window.dialogForge.insertScriptEditorCode({
                code: text
            });
        }
    });

const mainRendererEventController = createMainRendererEventController({
    handleMenuCommand,
    getRuntimeSession: function() {
        return runtimeSessionSnapshot;
    },
    renderRuntimeSession,
    recordTranscriptEvents,
    renderWorkspace,
    applyWorkspaceRuntimeEvents: applyWorkspaceRuntimeEventsToPane,
    renderRuntimeEvents,
    setZoomFactor: function(zoomFactor): void {
        mainZoomScaling.setZoomFactor(zoomFactor);
    },
    applyZoomLayout: function(): void {
        byId("consoleCwdText").style.maxWidth =
            mainZoomScaling.scaleLayoutSize(420) + "px";
        void workspacePaneVisibility.syncWindowWidth();
    },
    renderActiveDataset,
    renderTabularPreview,
    renderCellUpdate,
    renderVariableMetadata,
    renderValueLabels,
    renderDeclaredMissing,
    renderImportResult,
    renderClipboardResult,
    renderDialogCommandPreview: dialogCommandPreviewController.render
});

const mainCompositionBootstrapController =
    createMainCompositionBootstrapController({
        title: byId("appTitle"),
        productPill: byId("productPill"),
        runtimePill: byId("runtimePill"),
        output: byId("compositionOutput"),
        loadConsoleHistory: function(scope): Promise<void> {
            return consoleCommandHistory.load(scope);
        },
        setProductId: function(value): void {
            productId = value;
        },
        setPackageSourcePolicy: function(value): void {
            packageSourcePolicy = value;
        },
        setProductCapabilities: function(capabilities): void {
            productCapabilitiesSnapshot = capabilities;
        },
        setProductDialogs: function(dialogs): void {
            productDialogsSnapshot = dialogs;
        },
        setApplicationI18n: function(i18n): void {
            applicationI18n = i18n;
        },
        setRuntimeProviderId: function(value): void {
            runtimeProviderId = value;
        },
        setMainWindowTitle: function(title): Promise<void> {
            return window.dialogForge.setMainWindowTitle(title);
        }
    });


const mainUiBindingController = createMainUiBindingController({
    mainWindowInput: {
        hideDatasetContextMenu: hideDatasetEditorContextMenu,
        openDeveloperDiagnostics: function(): void {
            window.dialogForge.openDevDiagnostics();
        },
        focusConsolePrompt: function(): void {
            mainConsoleCoordinator.scrollToBottom();
            mainConsoleCoordinator.focus();
        },
        getDatasetCommand: function(event): string | null {
            const target = event.target as HTMLElement | null;

            return getDatasetEditorKeyboardCommand({
                key: event.key,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                targetTagName: target ? target.tagName : "",
                targetId: target ? target.id : "",
                targetIsContentEditable: Boolean(target?.isContentEditable),
                selectionKind: datasetEditorState.selection.kind
            });
        },
        executeDatasetCommand
    },
    mainControls: {
        startRuntime: startRuntimeSession,
        stopRuntime: stopRuntimeSession,
        interruptRuntime: interruptConsoleExecution,
        restartRuntimeClean,
        restartRuntimeWithWorkspace: restartRuntimeRestoreWorkspace,
        clearConsole: clearConsoleTranscript,
        navigateConsoleHistory: navigateVisibleCommandHistory,
        openDeveloperDiagnostics: function(): void {
            window.dialogForge.openDevDiagnostics();
        },
        toggleWorkspacePane: function(button): void {
            void workspacePaneVisibility.toggle(button);
        },
        setWorkingDirectory: setRuntimeWorkingDirectory,
        updateCommandVisibility: updateUiCommandVisibility,
        refreshRuntimeEvents,
        queuePrompt,
        answerPrompt: answerFirstPrompt,
        refreshPrompts,
        executeVisibleCommand,
        handleVisibleCommandKeydown,
        executeInvisibleQuery,
        executeInvisibleMutation,
        readHelpTopic,
        readCompletions,
        checkDependencies,
        inferImportFormat: mainImportController.inferFormatFromSource,
        selectImportFile: mainImportController.selectFile,
        planImportFile: mainImportController.planFile,
        previewImportFile: mainImportController.previewFile,
        importData: mainImportController.importData,
        refreshWorkspace,
        clearWorkspace
    },
    datasetPanel: {
        executeCommand: executeDatasetCommand,
        applyDataViewport: applyDatasetViewportControls,
        shiftDataViewport: shiftDatasetViewport,
        getDataVisibleRows: function(): number {
            return datasetEditorState.viewport.dataVisibleRows;
        },
        getDataVisibleColumns: function(): number {
            return datasetEditorState.viewport.dataVisibleColumns;
        },
        applyColumnWidth: applySelectedColumnWidth,
        resizeColumn: resizeSelectedColumn,
        moveColumn: moveSelectedColumn,
        updateRowName,
        refreshVariableMetadata: function(): void {
            void readVariableMetadata("");
        },
        applyVariableViewport: applyVariableViewportControls,
        shiftVariableViewport,
        getVariableVisibleRows: function(): number {
            return datasetEditorState.viewport.variableVisibleRows;
        },
        refreshValueLabels: function(): void {
            void readValueLabels("");
        },
        refreshDeclaredMissing: function(): void {
            void readDeclaredMissing("");
        }
    },
    rendererEvents: mainRendererEventController
});

window.addEventListener("focus", function(): void {
    mainConsoleCoordinator.focus();
});


const bindMainUi = function(): void {
    dialogCommandPreviewController.bind();
    bindFileDropHandling();
    mainUiBindingController.bind();
};


const mainStartupController = createMainStartupController({
    getComposition: window.dialogForge.getComposition,
    applyComposition: mainCompositionBootstrapController.apply,
    readPersistedWorkspacePaneVisible: workspacePaneVisibility.readPersisted,
    setWorkspacePaneVisible: workspacePaneVisibility.set,
    initializeWorkspacePane,
    readApplicationSettings: window.dialogForge.readSettings,
    readActiveDataset: window.dialogForge.getActiveDataset,
    refreshConsoleWorkingDirectory,
    initializeConsoleFlow,
    bindMainUi,
    refreshWorkspace,
    initializeVisibleCommandEditor,
    focusVisibleCommandInput,
    markReady: function(): void {
        document.body.dataset.dialogForgeReady = "1";
    },
    startRuntimeSession: function(): void {
        startRuntimeSession();
    },
    setBootStage,
    renderMenu: function(composition): void {
        renderMenu(composition.menu || []);
    },
    renderProductInfo,
    renderProductSettings,
    renderApplicationSettings,
    renderCapabilities,
    renderRuntimeSession,
    renderConsoleStatus,
    renderRuntimeEvents,
    renderPrompts,
    renderFeatures: function(composition): void {
        renderFeatures(composition.features || []);
    },
    renderProductCapabilities: function(composition): void {
        renderProductCapabilities(composition.productCapabilities || []);
    },
    renderStartupTasks: function(composition): void {
        renderStartupTasks(composition.startupTasks || []);
    },
    renderActiveDataset,
    renderDatasetEditorSelection
});


const start = async function(): Promise<void> {
    await mainStartupController.start();
};

start().catch((error) => {
    const output = byId("compositionOutput");
    output.textContent = String(error && error.stack ? error.stack : error);
});
