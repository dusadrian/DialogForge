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
    MainRendererEventBindings
} from "./mainRendererEventBindings";


export interface MainRendererEventControllerBindings {
    handleMenuCommand(command: EvaluatedMenuItem): void;
    getRuntimeSession(): RuntimeSessionSnapshot | null;
    renderRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    recordTranscriptEvents(events: TranscriptEvent[]): void;
    renderWorkspace(snapshot: WorkspaceSnapshot): void;
    applyWorkspaceRuntimeEvents(snapshot: RuntimeEventSnapshot): void;
    renderRuntimeEvents(snapshot: RuntimeEventSnapshot): void;
    setZoomFactor(zoomFactor: number): void;
    applyZoomLayout(zoomFactor: number): void;
    renderActiveDataset(snapshot: ActiveDatasetSnapshot): void;
    renderTabularPreview(snapshot: TabularPreviewSnapshot): void;
    renderCellUpdate(result: CellUpdateResult | CellUpdateBatchResult): void;
    renderVariableMetadata(snapshot: VariableMetadataSnapshot): void;
    renderValueLabels(snapshot: ValueLabelSnapshot): void;
    renderDeclaredMissing(snapshot: DeclaredMissingSnapshot): void;
    renderImportResult(result: ImportResult): void;
    renderClipboardResult(result: ClipboardResult): void;
    renderDialogCommandPreview(command: string): void;
}


export const createMainRendererEventController = function(
    bindings: MainRendererEventControllerBindings
): MainRendererEventBindings {
    return {
        handleMenuCommand: bindings.handleMenuCommand,
        handleRuntimeSession: function(snapshot): void {
            const current = bindings.getRuntimeSession();

            if (!current || current.status !== snapshot.status) {
                bindings.renderRuntimeSession(snapshot);
            }
        },
        handleRuntimeTranscript: bindings.recordTranscriptEvents,
        handleWorkspace: bindings.renderWorkspace,
        handleRuntimeEvents: function(snapshot): void {
            bindings.applyWorkspaceRuntimeEvents(snapshot);
            bindings.renderRuntimeEvents(snapshot);
        },
        handleMainZoomFactor: function(state): void {
            const next = Number(state?.zoomFactor || 1);
            const zoomFactor = Number.isFinite(next)
                ? Math.max(0.5, Math.min(3, next))
                : 1;

            bindings.setZoomFactor(zoomFactor);
            bindings.applyZoomLayout(zoomFactor);
        },
        handleActiveDataset: bindings.renderActiveDataset,
        handleTabularPreview: bindings.renderTabularPreview,
        handleCellUpdate: bindings.renderCellUpdate,
        handleVariableMetadata: bindings.renderVariableMetadata,
        handleValueLabels: bindings.renderValueLabels,
        handleDeclaredMissing: bindings.renderDeclaredMissing,
        handleImportResult: bindings.renderImportResult,
        handleClipboardResult: bindings.renderClipboardResult,
        handleDialogCommandPreview: bindings.renderDialogCommandPreview
    };
};
