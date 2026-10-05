import type {
    Clipboard,
    IpcMain
} from "electron";

import type {
    RuntimeEventSnapshot,
    RuntimeSessionManager,
    RuntimeSessionSnapshot,
    VisibleCommandRequest,
    WorkspaceSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import {
    createDatasetEditorWarmCache
} from "../../dataset-editor/datasetEditorWarmCache";
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
    prepareWorkspaceDatasetCacheEffects,
    warmWorkspaceDatasetCacheEffects,
    workspaceUpdateChangesDialogVariables
} from "../../runtime/workspace/workspaceUpdateEffects";
import { createRuntimeVisibleCommandDelivery } from "../../runtime/commands/runtimeVisibleCommandDelivery";
import { createRuntimeCommandReceipt } from "../../runtime/commands/runtimeCommandReceipt";
import {
    applyDatasetMutationCacheEffects,
    type DatasetMutationCacheEffect
} from "../../dataset-editor/datasetMutationCacheEffects";
import type {
    ProductDialogWorkspaceDeliveryResult
} from "../../dialog-runtime/dialog-builder/productDialogWorkspaceDelivery";


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
    ): Promise<ProductDialogWorkspaceDeliveryResult | void>;
    hasDatasetEditorWindow(): boolean;
    sendDatasetEditor(channel: string, payload: unknown): void;
    presentRuntimeEvents(snapshot: RuntimeEventSnapshot): void;
    reportError(error: unknown): void;
}


export const createRuntimeIpcComposition = function(
    options: RuntimeIpcCompositionOptions
) {
    const warmCache = options.datasetWarmCache;
    warmCache.updateRuntimeSession(options.runtimeSessionManager.getSnapshot());
    const invalidateMutationCache = function(
        objectName: string,
        effect: DatasetMutationCacheEffect
    ): void {
        applyDatasetMutationCacheEffects(warmCache, objectName, effect);
    };
    const bridge = createRuntimeBroadcastBridge({
        runtimeSessionManager: options.runtimeSessionManager,
        updateDatasetRuntimeSession: warmCache.updateRuntimeSession,
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
        invalidateInitialDatasetPreview: invalidateMutationCache,
        patchVariableMetadata: warmCache.patchVariableMetadata,
        sendDatasetEditorChanges: bridge.sendDatasetEditorChanges,
        sendWorkspaceSnapshot: bridge.sendWorkspaceSnapshot,
        broadcastRuntimeEvents: bridge.broadcastRuntimeEvents
    });
    createTabularIpcController({
        ipcMain: options.ipcMain,
        runtimeSessionManager: options.runtimeSessionManager,
        readInitialDatasetPreview: warmCache.readPreview,
        invalidateInitialDatasetPreview: invalidateMutationCache,
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

    const deliverVisibleCommand = createRuntimeVisibleCommandDelivery({
        runtime: options.runtimeSessionManager,
        publishTranscript: bridge.sendTranscriptEvents,
        refreshRuntimeEvents: bridge.broadcastRuntimeEvents,
        reportRuntimeEventError: options.reportError,
        async publishWorkspace(update, snapshot) {
            const prepared = prepareWorkspaceDatasetCacheEffects(
                update,
                warmCache
            );

            const delivered = await bridge.sendWorkspaceSnapshot(
                snapshot,
                {
                    warmActiveDataset: false,
                    metadataRefreshes: prepared.metadataRefreshes,
                    reportMetadataError: options.reportError,
                    refreshProductDialogs:
                        workspaceUpdateChangesDialogVariables(prepared.effects)
                }
            );
            if (!delivered) {
                return false;
            }
            bridge.sendActiveDataset(options.runtimeSessionManager.getActiveDataset());

            warmWorkspaceDatasetCacheEffects(
                prepared.effects,
                options.runtimeSessionManager.getActiveDataset().objectName,
                warmCache
            );
            return true;
        }
    });

    const executeVisibleCommandReceiptAndBroadcast = async function(
        request: VisibleCommandRequest
    ) {
        const { accepted, result } = await deliverVisibleCommand(request);
        return createRuntimeCommandReceipt(result, accepted);
    };

    createRuntimeSessionIpcController({
        ipcMain: options.ipcMain,
        runtimeSessionManager: options.runtimeSessionManager,
        setRuntimeSessionSnapshot: options.setRuntimeSessionSnapshot,
        sendRuntimeSession: bridge.sendRuntimeSession,
        executeVisibleCommand: executeVisibleCommandReceiptAndBroadcast,
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
        executeVisibleCommandReceiptAndBroadcast
    };
};
