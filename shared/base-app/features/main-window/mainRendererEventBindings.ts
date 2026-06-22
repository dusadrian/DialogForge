import type {
    ActiveDatasetSnapshot,
    CellUpdateBatchResult,
    CellUpdateResult,
    DeclaredMissingSnapshot,
    ImportResult,
    RuntimeEventSnapshot,
    RuntimeSessionSnapshot,
    TabularPreviewSnapshot,
    TranscriptEvent,
    ValueLabelSnapshot,
    VariableMetadataSnapshot,
    WorkspaceSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import type {
    ClipboardResult
} from "../../../shell-electron/clipboard/clipboardResult";
import type {
    EvaluatedMenuItem
} from "../../../core/contracts/applicationComposition";
import type {
    ProductConsoleStateChipSnapshot
} from "../../../core/contracts/productContribution";


export interface MainRendererEventBindings {
    handleMenuCommand(command: EvaluatedMenuItem): void;
    handleRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    handleRuntimeTranscript(events: TranscriptEvent[]): void;
    handleWorkspace(snapshot: WorkspaceSnapshot): void;
    handleRuntimeEvents(snapshot: RuntimeEventSnapshot): void;
    handleMainZoomFactor(state: { zoomFactor?: number }): void;
    handleActiveDataset(snapshot: ActiveDatasetSnapshot): void;
    handleLanguageChanged(payload: Record<string, unknown>): void;
    handleProductConsoleStateChips(snapshot: ProductConsoleStateChipSnapshot): void;
    handleTabularPreview(snapshot: TabularPreviewSnapshot): void;
    handleCellUpdate(result: CellUpdateResult | CellUpdateBatchResult): void;
    handleVariableMetadata(snapshot: VariableMetadataSnapshot): void;
    handleValueLabels(snapshot: ValueLabelSnapshot): void;
    handleDeclaredMissing(snapshot: DeclaredMissingSnapshot): void;
    handleImportResult(result: ImportResult): void;
    handleClipboardResult(result: ClipboardResult): void;
    handleDialogCommandPreview(command: string): void;
}


export const bindMainRendererEvents = function(
    bindings: MainRendererEventBindings
): void {
    window.dialogForge.onMenuCommand(bindings.handleMenuCommand);
    window.dialogForge.onRuntimeSession(bindings.handleRuntimeSession);
    window.dialogForge.onRuntimeTranscript(bindings.handleRuntimeTranscript);
    window.dialogForge.onWorkspace(bindings.handleWorkspace);
    window.dialogForge.onRuntimeEvents(bindings.handleRuntimeEvents);
    window.dialogForge.onMainZoomFactor(bindings.handleMainZoomFactor);
    window.dialogForge.onActiveDataset(bindings.handleActiveDataset);
    window.dialogForge.onLanguageChanged(bindings.handleLanguageChanged);
    window.dialogForge.onProductConsoleStateChips(
        bindings.handleProductConsoleStateChips
    );
    window.dialogForge.onTabularPreview(bindings.handleTabularPreview);
    window.dialogForge.onCellUpdate(bindings.handleCellUpdate);
    window.dialogForge.onVariableMetadata(bindings.handleVariableMetadata);
    window.dialogForge.onValueLabels(bindings.handleValueLabels);
    window.dialogForge.onDeclaredMissing(bindings.handleDeclaredMissing);
    window.dialogForge.onImportResult(bindings.handleImportResult);
    window.dialogForge.onClipboardResult(bindings.handleClipboardResult);
    window.dialogForge.onDialogCommandPreview(
        bindings.handleDialogCommandPreview
    );
};
