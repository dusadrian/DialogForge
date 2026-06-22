import type {
    EvaluatedMenuItem
} from "../../core/contracts/applicationComposition";
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
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    ClipboardResult
} from "../../shell-electron/clipboard/clipboardResult";
import type {
    PlotViewerState
} from "../../shell-electron/external/plotViewerState";
import {
    onTypedIpcEvent,
    type IpcEventTransport
} from "../../core/ipc/typedIpc";
import {
    scriptEditorEventChannels
} from "../../script-editor/scriptEditorIpc";
import {
    plotExternalEventChannels
} from "../../shell-electron/external/plotExternalIpc";
import {
    shellWindowEventChannels
} from "../../shell-electron/windows/shellWindowIpc";
import type {
    ProductConsoleStateChipSnapshot
} from "../../core/contracts/productContribution";


export const applicationEventChannels = {
    menuCommand: "base-app:menu-command",
    runtimeSession: "base-app:runtime-session",
    runtimeTranscript: "base-app:runtime-transcript",
    workspace: "base-app:workspace",
    runtimeEvents: "base-app:runtime-events",
    activeDataset: "base-app:active-dataset",
    productConsoleStateChips: "base-app:product-console-state-chips",
    tabularPreview: "base-app:tabular-preview",
    cellUpdate: "base-app:cell-update",
    variableMetadata: "base-app:variable-metadata",
    valueLabels: "base-app:value-labels",
    declaredMissing: "base-app:declared-missing",
    importResult: "base-app:import-result",
    clipboardResult: "base-app:clipboard-result",
    dialogCommandPreview: "base-app:dialog-command-preview",
    plotViewerUpdate: plotExternalEventChannels.viewerUpdate,
    datasetEditorOpen: "base-app:dataset-editor-open",
    mainZoomFactor: shellWindowEventChannels.mainZoomFactor,
    languageChanged: "appLanguageChanged",
    terminalSettingsUpdated: "terminalSettingsUpdated",
    scriptEditorInsertCode: scriptEditorEventChannels.publishInsertCode,
    scriptEditorOpenFile: scriptEditorEventChannels.publishOpenFile,
    scriptEditorRequestSaveForClose: scriptEditorEventChannels.requestSaveForClose
} as const;


interface ApplicationEventPayloads {
    "base-app:menu-command": EvaluatedMenuItem;
    "base-app:runtime-session": RuntimeSessionSnapshot;
    "base-app:runtime-transcript": TranscriptEvent[];
    "base-app:workspace": WorkspaceSnapshot;
    "base-app:runtime-events": RuntimeEventSnapshot;
    "base-app:active-dataset": ActiveDatasetSnapshot;
    "base-app:product-console-state-chips": ProductConsoleStateChipSnapshot;
    "base-app:tabular-preview": TabularPreviewSnapshot;
    "base-app:cell-update": CellUpdateResult | CellUpdateBatchResult;
    "base-app:variable-metadata": VariableMetadataSnapshot;
    "base-app:value-labels": ValueLabelSnapshot;
    "base-app:declared-missing": DeclaredMissingSnapshot;
    "base-app:import-result": ImportResult;
    "base-app:clipboard-result": ClipboardResult;
    "base-app:dialog-command-preview": string;
    "base-app:plot-viewer-update": PlotViewerState;
    "base-app:dataset-editor-open": {
        objectName: string;
        title: string;
        message: string;
    };
    "base-app:main-zoom-factor": { zoomFactor: number };
    "appLanguageChanged": Record<string, unknown>;
    "terminalSettingsUpdated": unknown;
    "base-app:script-editor-insert-code": { code?: string };
    "base-app:script-editor-open-file": {
        filePath?: string;
        content?: string;
        message?: string;
    };
    "base-app:script-editor-request-save-for-close": { requestId?: string };
}


export const onApplicationEvent = function<
    Channel extends keyof ApplicationEventPayloads & string
>(
    transport: IpcEventTransport,
    channel: Channel,
    callback: (payload: ApplicationEventPayloads[Channel]) => void
): void {
    onTypedIpcEvent<ApplicationEventPayloads[Channel]>(
        transport,
        channel,
        callback
    );
};
