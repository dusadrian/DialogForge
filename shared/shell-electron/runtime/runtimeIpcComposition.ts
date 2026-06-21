import type {
    Clipboard,
    IpcMain
} from "electron";

import type {
    RuntimeEventSnapshot,
    RuntimeSessionManager,
    RuntimeSessionSnapshot,
    TranscriptEvent,
    VisibleCommandRequest,
    WorkspaceSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import {
    createDatasetEditorWarmCache
} from "../../dataset-editor/main-process/datasetEditorWarmCache";
import {
    createDatasetViewerMutationIpcController
} from "../../dataset-editor/main-process/datasetViewerMutationIpcController";
import {
    createTabularIpcController
} from "../../runtime/tabular-data/tabularIpcController";
import {
    createRuntimeSessionIpcController
} from "../../runtime/session/runtimeSessionIpcController";
import {
    createRuntimeQueryIpcController
} from "../../runtime/queries/runtimeQueryIpcController";
import {
    createShellClipboardController
} from "../clipboard/shellClipboardController";
import {
    createShellClipboardIpcController
} from "../clipboard/shellClipboardIpcController";
import {
    createRuntimeBroadcastBridge
} from "./runtimeBroadcastBridge";


export interface RuntimeIpcCompositionOptions {
    ipcMain: IpcMain;
    clipboard: Clipboard;
    runtimeSessionManager: RuntimeSessionManager;
    datasetWarmCache: ReturnType<typeof createDatasetEditorWarmCache>;
    datasetEditorUiCommandVisibility(): "hidden" | "visible";
    setRuntimeSessionSnapshot(snapshot: RuntimeSessionSnapshot): void;
    captureWorkspaceBaseline(source: string): Promise<void>;
    scriptEditorSessionState(channel: string, payload: unknown): void;
    refreshProductDialogWorkspaceData(
        snapshot: WorkspaceSnapshot
    ): Promise<void>;
    hasDatasetEditorWindow(): boolean;
    sendDatasetEditor(channel: string, payload: unknown): void;
    presentRuntimeEvents(snapshot: RuntimeEventSnapshot): void;
    reportError(error: unknown): void;
}


export const createRuntimeIpcComposition = function(
    options: RuntimeIpcCompositionOptions
) {
    const warmCache = options.datasetWarmCache;
    const bridge = createRuntimeBroadcastBridge({
        runtimeSessionManager: options.runtimeSessionManager,
        scriptEditorSessionState: options.scriptEditorSessionState,
        refreshProductDialogWorkspaceData:
            options.refreshProductDialogWorkspaceData,
        hasDatasetEditorWindow: options.hasDatasetEditorWindow,
        sendDatasetEditor: options.sendDatasetEditor,
        presentRuntimeEvents: options.presentRuntimeEvents,
        warmInitialDatasetPreview: warmCache.warmPreview,
        warmInitialVariableMetadata: warmCache.warmVariableMetadata
    });
    const shellClipboardController = createShellClipboardController({
        clipboard: options.clipboard,
        publish: bridge.sendClipboardResult
    });

    createShellClipboardIpcController({
        ipcMain: options.ipcMain,
        clipboardController: shellClipboardController
    });
    createDatasetViewerMutationIpcController({
        ipcMain: options.ipcMain,
        runtimeSessionManager: options.runtimeSessionManager,
        uiCommandVisibility: options.datasetEditorUiCommandVisibility,
        invalidateInitialDatasetPreview: warmCache.invalidate,
        sendDatasetEditorChanges: bridge.sendDatasetEditorChanges,
        broadcastRuntimeEvents: bridge.broadcastRuntimeEvents
    });
    createTabularIpcController({
        ipcMain: options.ipcMain,
        runtimeSessionManager: options.runtimeSessionManager,
        readInitialDatasetPreview: warmCache.readPreview,
        invalidateInitialDatasetPreview: warmCache.invalidate,
        warmInitialDatasetPreview: warmCache.warmPreview,
        warmInitialVariableMetadata: warmCache.warmVariableMetadata,
        refreshWorkspaceAndBroadcast: bridge.refreshWorkspaceAndBroadcast,
        broadcastRuntimeEvents: bridge.broadcastRuntimeEvents,
        sendTabularPreview: bridge.sendTabularPreview,
        sendCellUpdate: bridge.sendCellUpdate,
        sendVariableMetadata: bridge.sendVariableMetadata,
        sendValueLabels: bridge.sendValueLabels,
        sendDeclaredMissing: bridge.sendDeclaredMissing,
        sendImportResult: bridge.sendImportResult,
        sendActiveDataset: bridge.sendActiveDataset,
        sendTranscriptEvents: bridge.sendTranscriptEvents
    });

    const executeVisibleCommandAndBroadcast = async function(
        request: VisibleCommandRequest
    ): Promise<TranscriptEvent[]> {
        const events = await options.runtimeSessionManager
            .executeVisibleCommand(request);

        warmCache.invalidate();
        bridge.sendTranscriptEvents(events);
        await bridge.refreshWorkspaceAndBroadcast();
        void bridge.broadcastRuntimeEvents().catch(options.reportError);

        return events;
    };

    createRuntimeSessionIpcController({
        ipcMain: options.ipcMain,
        runtimeSessionManager: options.runtimeSessionManager,
        setRuntimeSessionSnapshot: options.setRuntimeSessionSnapshot,
        sendRuntimeSession: bridge.sendRuntimeSession,
        executeVisibleCommand: executeVisibleCommandAndBroadcast,
        captureWorkspaceBaseline: options.captureWorkspaceBaseline,
        refreshWorkspaceAndBroadcast: bridge.refreshWorkspaceAndBroadcast,
        broadcastRuntimeEvents: bridge.broadcastRuntimeEvents,
        invalidateInitialDatasetPreview: warmCache.invalidate,
        sendTranscriptEvents: bridge.sendTranscriptEvents,
        sendWorkspaceSnapshot: bridge.sendWorkspaceSnapshot,
        sendActiveDataset: bridge.sendActiveDataset,
        warmInitialDatasetPreview: warmCache.warmPreview,
        warmInitialVariableMetadata: warmCache.warmVariableMetadata
    });
    createRuntimeQueryIpcController({
        ipcMain: options.ipcMain,
        runtimeSessionManager: options.runtimeSessionManager,
        captureWorkspaceBaseline: options.captureWorkspaceBaseline,
        refreshWorkspaceAndBroadcast: bridge.refreshWorkspaceAndBroadcast
    });

    return {
        ...bridge,
        executeVisibleCommandAndBroadcast
    };
};
