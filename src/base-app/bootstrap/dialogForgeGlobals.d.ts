// Global ambient declarations for DialogForge renderer bridges.
// This file is picked up automatically because tsconfig.json includes "src/**/*.ts".

import type { CopyPayload } from "../../dataset-editor/clipboard/copyPayload";
import type { DatasetEditorIpcBridge } from "../../dataset-editor/renderer/datasetEditorIpcBindings";
import type { DatasetEditorTransportBridge } from "../../dataset-editor/renderer/datasetEditorRendererTransport";
import type {
    OpenFileResult,
    PathInfoResult
} from "../features/files/openFileResult";
import type { ScriptEditorIpcBridge } from "../../script-editor/renderer/scriptEditorIpcBindings";
import type { ScriptEditorTransportBridge } from "../../script-editor/renderer/scriptEditorRendererTransport";
import type { ScriptFileResult } from "../../script-editor/files/scriptFileResult";
import type { LiveScriptRendererBridge } from "../../script-editor/collaboration/liveScriptIpc";
import type { ApplicationSettingsRendererBridge } from "../features/settings/applicationSettingsIpc";
import type { ProductDialogRuntimeHostBridge } from "../../dialog-runtime/dialogRuntimeIpc";
import type { ExternalUrlOpenRequest } from "../features/external-url/externalUrl";
import type {
    PlotCopyResult,
    PlotSaveRequest,
    PlotSaveResult,
    PlotViewerState
} from "../features/plot-viewer/plotViewerState";
import type { ClipboardResult } from "../clipboard/clipboardResult";
import type {
    EvaluatedMenuItem,
    ApplicationComposition
} from "../../core/contracts/applicationComposition";
import type { ImportPreviewResult } from "../../runtime/tabular-data/importPreview";
import type { DialogExternalCallResult } from "../../core/contracts/dialogExternalCall";
import type {
    ActiveDatasetSnapshot,
    CellUpdateBatchResult,
    CellUpdateRequest,
    CellUpdateResult,
    ColumnInsertRequest,
    ColumnInsertResult,
    ColumnRemoveRequest,
    ColumnRemoveResult,
    ColumnRenameRequest,
    ColumnRenameResult,
    CompletionRequest,
    CompletionResult,
    DeclaredMissingSnapshot,
    DeclaredMissingUpdateRequest,
    DeclaredMissingUpdateResult,
    DependencyCheckRequest,
    DependencyCheckResult,
    DialogExecutionRequest,
    DialogExecutionResult,
    HelpTopicRequest,
    HelpTopicResult,
    ImportPlanRequest,
    ImportPlanResult,
    ImportRequest,
    ImportResult,
    InvisibleMutationRequest,
    InvisibleMutationResult,
    InvisibleQueryRequest,
    InvisibleQueryResult,
    ObjectInspectionResult,
    PromptAnswerRequest,
    PromptResult,
    PromptRequest,
    PromptSnapshot,
    ProductCommandRequest,
    ProductCommandResult,
    RuntimeExtensionMethodRequest,
    RuntimeExtensionMethodResult,
    RowInsertRequest,
    RowInsertResult,
    RowNameUpdateRequest,
    RowNameUpdateResult,
    RowRemoveRequest,
    RowRemoveResult,
    RowSortRequest,
    RowSortResult,
    RuntimeEventSnapshot,
    RuntimeSessionSnapshot,
    StartupTaskExecutionRequest,
    StartupTaskExecutionResult,
    TabularPreviewRequest,
    TabularPreviewSnapshot,
    TabularSchemaSnapshot,
    TranscriptEvent,
    ValueLabelSnapshot,
    ValueLabelUpdateRequest,
    ValueLabelUpdateResult,
    VariableMetadataSnapshot,
    VariableMetadataUpdateRequest,
    VariableMetadataUpdateResult,
    VisibleCommandRequest,
    WorkspaceRenameRequest,
    WorkspaceSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    ProductConsoleStateChip,
    ProductConsoleStateChipSnapshot
} from "../../core/contracts/productContribution";
import type {
    DatasetCellUpdatePatch,
    DatasetViewerCell,
    DatasetViewerContentPage,
    DatasetViewerContentRequest,
    DatasetViewerFilterMaskPage,
    DatasetViewerSchema,
    DatasetVariableMetadata,
    DatasetVariableMetadataBatch,
    DatasetVariableUpdatePatch
} from "../modules/datasetViewer.types";

export {};

declare global {
    interface DialogForgeApi {
        loadMainPage?(): void;
        loadDatasetEditorPage?(): void;
        loadScriptEditorPage?(): void;
        loadSettingsPage?(): void;
        loadDialogBuilderPage?(): void;
        registerConsoleSyntaxMonacoLoader?(syntaxModule?: unknown): void;
        getComposition(): Promise<ApplicationComposition>;
        setMainWindowTitle(title: string): Promise<void>;
        readSettings(): Promise<Record<string, unknown>>;
        writeSettings(input: Record<string, unknown>): Promise<Record<string, unknown>>;
        readConsoleHistory(input: { productId?: string; runtimeId?: string }): Promise<string[]>;
        writeConsoleHistory(input: { productId?: string; runtimeId?: string; history?: string[] }): Promise<string[]>;
        getRuntimeSession(): Promise<RuntimeSessionSnapshot>;
        startRuntime(): Promise<RuntimeSessionSnapshot>;
        stopRuntime(): Promise<RuntimeSessionSnapshot>;
        restartRuntime(action: "clean" | "restore"): Promise<RuntimeSessionSnapshot>;
        executeVisibleCommand(input: Partial<VisibleCommandRequest>): Promise<TranscriptEvent[]>;
        checkScriptFragment(input: { code?: string }): Promise<{ ok: boolean; state: string; message?: string }>;
        runScriptCodeBatch(input: { chunks?: string[] }): Promise<{ status: string; events: TranscriptEvent[] }>;
        executeProductCommand(input: Partial<ProductCommandRequest>): Promise<ProductCommandResult>;
        confirmPackageRestart(packages: string[]): Promise<{ action: "clean" | "restore" | "cancel" }>;
        choosePackageInstallLibrary(input: {
            userLibrary?: string;
            defaultLibrary?: string;
        }): Promise<{ action: "user" | "default" | "cancel" }>;
        restartRuntimeForPackages(action: "clean" | "restore"): Promise<RuntimeSessionSnapshot>;
        refreshWorkspace(): Promise<WorkspaceSnapshot>;
        removeWorkspaceObjects(objectNames: string[]): Promise<WorkspaceSnapshot>;
        renameWorkspaceObject(input: Partial<WorkspaceRenameRequest>): Promise<WorkspaceSnapshot>;
        clearWorkspace(): Promise<WorkspaceSnapshot>;
        listRuntimeEvents(): Promise<RuntimeEventSnapshot>;
        listPrompts(): Promise<PromptSnapshot>;
        requestPrompt(input: Partial<PromptRequest>): Promise<PromptResult>;
        answerPrompt(input: Partial<PromptAnswerRequest>): Promise<PromptResult>;
        executeStartupTask(input: Partial<StartupTaskExecutionRequest>): Promise<StartupTaskExecutionResult>;
        inspectObject(objectName: string): Promise<ObjectInspectionResult>;
        getActiveDataset(): Promise<ActiveDatasetSnapshot>;
        setActiveDataset(objectName: string): Promise<ActiveDatasetSnapshot>;
        readTabularSchema(objectName: string): Promise<TabularSchemaSnapshot>;
        readTabularPreview(input: string | Partial<TabularPreviewRequest>): Promise<TabularPreviewSnapshot>;
        writeCell(input: Partial<CellUpdateRequest>): Promise<CellUpdateResult>;
        writeCells(inputs: Partial<CellUpdateRequest>[]): Promise<CellUpdateBatchResult>;
        renameColumn(input: Partial<ColumnRenameRequest>): Promise<ColumnRenameResult>;
        insertColumn(input: Partial<ColumnInsertRequest>): Promise<ColumnInsertResult>;
        removeColumn(input: Partial<ColumnRemoveRequest>): Promise<ColumnRemoveResult>;
        insertRow(input: Partial<RowInsertRequest>): Promise<RowInsertResult>;
        removeRow(input: Partial<RowRemoveRequest>): Promise<RowRemoveResult>;
        sortRows(input: Partial<RowSortRequest>): Promise<RowSortResult>;
        updateRowName(input: Partial<RowNameUpdateRequest>): Promise<RowNameUpdateResult>;
        readVariableMetadata(objectName: string): Promise<VariableMetadataSnapshot>;
        writeVariableMetadata(input: Partial<VariableMetadataUpdateRequest>): Promise<VariableMetadataUpdateResult>;
        readValueLabels(objectName: string): Promise<ValueLabelSnapshot>;
        writeValueLabels(input: Partial<ValueLabelUpdateRequest>): Promise<ValueLabelUpdateResult>;
        readDeclaredMissing(objectName: string): Promise<DeclaredMissingSnapshot>;
        writeDeclaredMissing(input: Partial<DeclaredMissingUpdateRequest>): Promise<DeclaredMissingUpdateResult>;
        importData(input: Partial<ImportRequest>): Promise<ImportResult>;
        planImportFile(input: Partial<ImportPlanRequest>): Promise<ImportPlanResult>;
        previewImportFile(input: Record<string, unknown>): Promise<ImportPreviewResult>;
        getWorkingDirectory(): Promise<{ path: string; home: string }>;
        readHelpTopic(input: Partial<HelpTopicRequest>): Promise<HelpTopicResult>;
        openHelpTopic(input: Partial<HelpTopicRequest>): Promise<HelpTopicResult>;
        getHelpDocument(): Promise<{ title: string; body: string }>;
        openHelpCommandUrl(url: string): Promise<unknown>;
        fetchHelpPage(url: string): Promise<unknown>;
        fetchRHelpPage(url: string): Promise<unknown>;
        runHelpExample(input: { topic?: string; package?: string }): Promise<unknown>;
        readCompletions(input: Partial<CompletionRequest>): Promise<CompletionResult>;
        checkDependencies(input: Partial<DependencyCheckRequest>): Promise<DependencyCheckResult>;
        executeInvisibleQuery(input: Partial<InvisibleQueryRequest>): Promise<InvisibleQueryResult>;
        executeInvisibleMutation(input: Partial<InvisibleMutationRequest>): Promise<InvisibleMutationResult>;
        executeRuntimeMethod(input: Partial<RuntimeExtensionMethodRequest>): Promise<RuntimeExtensionMethodResult>;
        callDialogExternal(name: string, parameters?: Record<string, unknown>): Promise<DialogExternalCallResult>;
        readConsoleStateChips(dataset: string): Promise<ProductConsoleStateChip[]>;
        executeDialog(input: Partial<DialogExecutionRequest>): Promise<DialogExecutionResult>;
        copyPayloadToClipboard(payload: CopyPayload): Promise<ClipboardResult>;
        readClipboardText(): Promise<ClipboardResult>;
        selectImportFile(): Promise<OpenFileResult>;
        selectWorkingDirectory(): Promise<OpenFileResult>;
        selectWorkspaceOpenFile(): Promise<OpenFileResult>;
        selectWorkspaceSaveFile(): Promise<OpenFileResult>;
        selectScriptFile(): Promise<OpenFileResult>;
        getScriptEditorDocument(): Promise<{ filePath: string; content: string; message: string }>;
        openScriptEditor(): Promise<ScriptFileResult>;
        insertScriptEditorCode(input: { code?: string }): Promise<{ status: string; message: string }>;
        writeClipboardText(text: string): void;
        getDatasetEditorDocument(): Promise<{ objectName: string; title: string; message: string }>;
        openDatasetEditor(objectName: string): Promise<{ objectName: string; title: string; message: string }>;
        setWorkspacePaneVisible(input: { visible: boolean; paneWidth?: number; restoreExistingExpansion?: boolean }): Promise<{ ok: boolean; skipped?: boolean; reason?: string; addedWidth?: number; restored?: boolean }>;
        openScriptFileInEditor(): Promise<ScriptFileResult>;
        openScriptFilePathInEditor(filePath: string): Promise<ScriptFileResult>;
        inspectPath(filePath: string): Promise<PathInfoResult>;
        openScriptFile(): Promise<ScriptFileResult>;
        openScriptFilePath(filePath: string): Promise<ScriptFileResult>;
        listScriptDirectory(input: { dirPath?: string }): Promise<{
            status: string;
            dirPath?: string;
            entries?: Array<{
                name: string;
                isDirectory: boolean;
                isFile: boolean;
            }>;
            message?: string;
        }>;
        readDroppedFilePath(file: File): string;
        getDroppedFilePaths(files: File[]): string[];
        datasetViewer: {
            getSchema(name: string): Promise<DatasetViewerSchema | null>;
            updateCell(name: string, patch: DatasetCellUpdatePatch): Promise<DatasetViewerCell | null>;
            sortRows(
                name: string,
                column: string,
                options?: { decreasing?: boolean; naLast?: boolean; emptyLast?: boolean }
            ): Promise<{ name: string; column: string; decreasing: boolean; rowCount: number; command: string } | null>;
            updateColumnName(
                name: string,
                column: string,
                nextName: string
            ): Promise<{ column: string; name: string } | null>;
            updateRowName(
                name: string,
                row: number,
                nextName: string
            ): Promise<{ row: number; name: string } | null>;
            insertRow(
                name: string,
                row: number,
                nextName: string,
                position: "before" | "after"
            ): Promise<{ name: string; row: number; nextName: string; position: "before" | "after"; rowCount: number } | null>;
            removeRow(
                name: string,
                row: number
            ): Promise<{ name: string; row: number; rowCount: number } | null>;
            removeColumn(
                name: string,
                column: string
            ): Promise<{ column: string; columnCount: number } | null>;
            insertColumn(
                name: string,
                column: string,
                nextName: string,
                position: "before" | "after"
            ): Promise<{ name: string; column: string; nextName: string; columnIndex: number; columnCount: number; position: "before" | "after" } | null>;
            getContent(name: string, request?: DatasetViewerContentRequest): Promise<DatasetViewerContentPage | null>;
            getFilterMask(name: string, rowStart: number, rowCount: number): Promise<DatasetViewerFilterMaskPage | null>;
            getVariables(name: string): Promise<DatasetVariableMetadata[] | null>;
            getVariablesBatch(name: string, start: number, count: number): Promise<DatasetVariableMetadataBatch | null>;
            updateVariable(
                name: string,
                variableName: string,
                patch: DatasetVariableUpdatePatch
            ): Promise<DatasetVariableMetadata | null>;
        };
        settings: ApplicationSettingsRendererBridge;
        menuCustomization: {
            onLoaded(callback: (payload: unknown) => void): void;
            onSaved(callback: (payload: unknown) => void): void;
            onBrowsed(callback: (payload: unknown) => void): void;
            save(input: unknown): void;
            browseDialog(): void;
        };
        dialogRuntimeRequirements: {
            onLoaded(callback: (payload: unknown) => void): void;
            onSaved(callback: (payload: unknown) => void): void;
            save(input: unknown): void;
        };
        dialogRuntime: ProductDialogRuntimeHostBridge;
        scriptEditor: ScriptEditorIpcBridge & ScriptEditorTransportBridge & {
            live: LiveScriptRendererBridge;
        };
        datasetEditor: DatasetEditorIpcBridge & DatasetEditorTransportBridge;
        saveScriptFile(input: { filePath?: string; content?: string }): Promise<ScriptFileResult>;
        saveScriptFileAs(input: { filePath?: string; content?: string }): Promise<ScriptFileResult>;
        updateScriptEditorDirtyState(input: { dirty?: boolean; filePath?: string; content?: string }): void;
        confirmScriptEditorSave(input: { filePath?: string }): Promise<{ action?: string }>;
        sendScriptEditorCloseSaveResult(input: { requestId?: string; ok?: boolean }): void;
        openExternalUrl(url: string): Promise<ExternalUrlOpenRequest>;
        openPlotViewer(url: string): Promise<PlotViewerState>;
        savePlot(input: Partial<PlotSaveRequest> & { data?: Uint8Array }): Promise<PlotSaveResult>;
        copyPlot(url: string): Promise<PlotCopyResult>;
        openSettingsWindow(): Promise<{ status: string }>;
        openMenuCustomizationWindow(): Promise<{ status: string }>;
        openDialogRuntimeRequirementsWindow(): Promise<{ status: string }>;
        openAboutWindow(): Promise<{ status: string }>;
        openProductDialog(dialogId: string): Promise<{ status: string; dialogId: string }>;
        openDevDiagnostics(): Promise<{ status: string; message: string }>;
        onMenuCommand(callback: (command: EvaluatedMenuItem) => void): void;
        onRuntimeSession(callback: (snapshot: RuntimeSessionSnapshot) => void): void;
        onRuntimeTranscript(callback: (events: TranscriptEvent[]) => void): void;
        onWorkspace(callback: (snapshot: WorkspaceSnapshot) => void): void;
        onRuntimeEvents(callback: (snapshot: RuntimeEventSnapshot) => void): void;
        onActiveDataset(callback: (snapshot: ActiveDatasetSnapshot) => void): void;
        onLanguageChanged(callback: (payload: Record<string, unknown>) => void): void;
        onTerminalSettingsUpdated(callback: (settings: Record<string, unknown>) => void): void;
        onProductConsoleStateChips(callback: (snapshot: ProductConsoleStateChipSnapshot) => void): void;
        onTabularPreview(callback: (preview: TabularPreviewSnapshot) => void): void;
        onCellUpdate(callback: (result: CellUpdateResult | CellUpdateBatchResult) => void): void;
        onVariableMetadata(callback: (snapshot: VariableMetadataSnapshot) => void): void;
        onValueLabels(callback: (snapshot: ValueLabelSnapshot) => void): void;
        onDeclaredMissing(callback: (snapshot: DeclaredMissingSnapshot) => void): void;
        onImportResult(callback: (result: ImportResult) => void): void;
        onClipboardResult(callback: (result: ClipboardResult) => void): void;
        onDialogCommandPreview(callback: (command: string) => void): void;
        onPlotViewerUpdate(callback: (state: PlotViewerState) => void): void;
        onDatasetEditorOpen(callback: (state: { objectName: string; title: string; message: string }) => void): void;
        onMainZoomFactor(callback: (state: { zoomFactor: number }) => void): void;
        onUpdateDownloadProgress(callback: (state: {
            active: boolean;
            percent: number;
            productName?: string;
        }) => void): void;
        onScriptEditorInsertCode(callback: (payload: { code?: string }) => void): void;
        onScriptEditorOpenFile(callback: (payload: { filePath?: string; content?: string; message?: string }) => void): void;
        onScriptEditorRequestSaveForClose(callback: (payload: { requestId?: string }) => void): void;
    }

    interface Window {
        dialogForge: DialogForgeApi;
    }
}
