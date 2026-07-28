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
} from "../dataset-editor/datasetEditorWarmCache";
import {
    createDatasetViewerMutationIpcController
} from "../dataset-editor/datasetViewerMutationIpcController";
import {
    createTabularIpcController
} from "./tabularIpcController";
import {
    createRuntimeSessionIpcController
} from "./runtimeSessionIpcController";
import {
    createRuntimeQueryIpcController
} from "./runtimeQueryIpcController";
import {
    createShellClipboardController
} from "../clipboard/shellClipboardController";
import {
    createShellClipboardIpcController
} from "../clipboard/shellClipboardIpcController";
import {
    createRuntimeBroadcastBridge
} from "./runtimeBroadcastBridge";
import {
    createWorkspaceDatasetCacheEffects,
    workspaceUpdateChangesDialogVariables
} from "../../runtime/workspace/workspaceUpdateEffects";
import {
    workspaceUpdateHasChanges
} from "../../runtime/workspace/workspaceUpdate";


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
        const result = await options.runtimeSessionManager
            .executeVisibleCommandWithEffects(request);

        bridge.sendTranscriptEvents(result.transcriptEvents);

        if (workspaceUpdateHasChanges(result.workspaceUpdate)) {
            const effects = createWorkspaceDatasetCacheEffects(
                result.workspaceUpdate
            );
            const activeDataset = options.runtimeSessionManager
                .getActiveDataset()
                .objectName;

            effects.forEach(function(effect) {
                if (effect.preview) {
                    warmCache.invalidatePreview(effect.name);
                }

                if (effect.variableMetadata) {
                    warmCache.invalidateVariableMetadata(effect.name);
                }
            });

            bridge.sendWorkspaceSnapshot(
                options.runtimeSessionManager.getWorkspaceSnapshot(),
                {
                    warmActiveDataset: false,
                    refreshProductDialogs:
                        workspaceUpdateChangesDialogVariables(effects)
                }
            );

            const activeEffect = effects.find(function(effect) {
                return effect.name === activeDataset && !effect.removed;
            });

            if (activeEffect?.preview) {
                warmCache.warmPreview(activeDataset);
            }

            if (activeEffect?.variableMetadata) {
                warmCache.warmVariableMetadata(activeDataset);
            }
        }

        void bridge.broadcastRuntimeEvents().catch(options.reportError);

        return result.transcriptEvents;
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
