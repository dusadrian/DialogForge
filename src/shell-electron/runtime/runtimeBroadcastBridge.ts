import { BrowserWindow } from "electron";
import { warmDatasetEditorFirstScreens } from "../../dataset-editor/datasetEditorWarmCache";
import {
    createWorkspaceSnapshotDelivery,
    type WorkspaceSnapshotDeliveryOptions
} from "../../runtime/workspace/workspaceSnapshotDelivery";
import {
    createTranscriptEvent
} from "../../runtime/commands/commandProtocol";
import {
    readProductDialogWorkspaceDeliveryWarning,
    type ProductDialogWorkspaceDeliveryResult
} from "../../dialog-runtime/dialog-builder/productDialogWorkspaceDelivery";

import {
    applicationEventChannels
} from "../../base-app/bootstrap/applicationEvents";
import {
    datasetEditorEventChannels
} from "../../dataset-editor/datasetEditorIpc";
import {
    scriptEditorEventChannels
} from "../../script-editor/scriptEditorIpc";
import {
    createRuntimeEventDelivery,
    createRuntimeSessionPublication
} from "../../runtime/events/runtimeEventDelivery";
import type {
    ClipboardResult
} from "../../base-app/clipboard/clipboardResult";
import type {
    ActiveDatasetSnapshot,
    CellUpdateBatchResult,
    CellUpdateResult,
    DeclaredMissingSnapshot,
    ImportResult,
    RuntimeEventSnapshot,
    RuntimeSessionManager,
    RuntimeSessionSnapshot,
    TabularPreviewSnapshot,
    TranscriptEvent,
    ValueLabelSnapshot,
    VariableMetadataSnapshot,
    WorkspaceListOptions,
    WorkspaceSnapshot
} from "../../runtime/provider-contract/runtimeProvider";


export interface RuntimeBroadcastBridge {
    deferRuntimeSessionReady(): () => void;
    sendRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    sendTranscriptEvents(events: TranscriptEvent[]): void;
    sendWorkspaceSnapshot(
        snapshot: WorkspaceSnapshot,
        options?: {
            warmActiveDataset?: boolean;
            refreshProductDialogs?: boolean;
            metadataRefreshes?: WorkspaceSnapshotDeliveryOptions["metadataRefreshes"];
            reportMetadataError?: WorkspaceSnapshotDeliveryOptions["reportMetadataError"];
        }
    ): Promise<boolean>;
    refreshWorkspaceAndBroadcast(
        options?: WorkspaceListOptions
    ): Promise<WorkspaceSnapshot>;
    sendRuntimeEvents(snapshot: RuntimeEventSnapshot): void;
    sendActiveDataset(snapshot: ActiveDatasetSnapshot): void;
    sendTabularPreview(preview: TabularPreviewSnapshot): void;
    sendCellUpdate(result: CellUpdateResult | CellUpdateBatchResult): void;
    sendVariableMetadata(snapshot: VariableMetadataSnapshot): void;
    sendValueLabels(snapshot: ValueLabelSnapshot): void;
    sendDeclaredMissing(snapshot: DeclaredMissingSnapshot): void;
    sendImportResult(result: ImportResult): void;
    sendClipboardResult(result: ClipboardResult): void;
    sendDatasetEditorChanges(changes: Array<Record<string, unknown>>): void;
    broadcastRuntimeEvents(options?: { sendDatasetChanges?: boolean }): Promise<void>;
}

export interface RuntimeBroadcastBridgeOptions {
    runtimeSessionManager: RuntimeSessionManager;
    updateDatasetRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    scriptEditorSessionState(channel: string, payload: unknown): void;
    refreshProductDialogWorkspaceData(snapshot: WorkspaceSnapshot): Promise<ProductDialogWorkspaceDeliveryResult | void>;
    hasDatasetEditorWindow(): boolean;
    sendDatasetEditor(channel: string, payload: unknown): void;
    presentRuntimeEvents(snapshot: RuntimeEventSnapshot): void;
    warmInitialDatasetPreview(objectName: string): void;
    warmInitialVariableMetadata(objectName: string): void;
}


const sendToAllWindows = function(channel: string, payload: unknown): void {
    BrowserWindow.getAllWindows().forEach((win) => {
        if (win.isDestroyed() || win.webContents.isDestroyed()) {
            return;
        }

        try {
            win.webContents.send(channel, payload);
        }
        catch (error) {
            if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                throw error;
            }
        }
    });
};


export const createRuntimeBroadcastBridge = function(
    options: RuntimeBroadcastBridgeOptions
): RuntimeBroadcastBridge {
    const runtimeEventDelivery = createRuntimeEventDelivery({
        getRuntime: () => options.runtimeSessionManager,
        publish: function(snapshot, changes): void {
            sendToAllWindows(applicationEventChannels.runtimeEvents, snapshot);
            if (options.hasDatasetEditorWindow() && changes.length > 0) {
                options.sendDatasetEditor(datasetEditorEventChannels.applyChanges, { changes });
            }
        },
        publishEffects: options.presentRuntimeEvents
    });

    const sessionPublication = createRuntimeSessionPublication({
        publishSession: value => sendToAllWindows(applicationEventChannels.runtimeSession, value),
        publishScriptPhase: value => options.scriptEditorSessionState(
            scriptEditorEventChannels.sessionState, value
        )
    });
    const sendRuntimeSession = function(snapshot: RuntimeSessionSnapshot): void {
        options.updateDatasetRuntimeSession(snapshot);
        sessionPublication.publish(snapshot);
    };

    const sendTranscriptEvents = function(events: TranscriptEvent[]): void {
        sendToAllWindows(applicationEventChannels.runtimeTranscript, events);
    };

    const refreshWorkspaceDialogs = async function(snapshot: WorkspaceSnapshot): Promise<void> {
        try {
            const result = await options.refreshProductDialogWorkspaceData(snapshot);
            const warning = readProductDialogWorkspaceDeliveryWarning(result);

            if (warning) {
                sendTranscriptEvents([createTranscriptEvent("output", {
                    kind: "workspace.notification",
                    source: "workspace",
                    text: ""
                }, {
                    id: `dialog-workspace-warning-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    streamName: "warning",
                    message: `Warning: ${warning}\n`
                })]);
            }
        }
        catch (error) {
            console.error("Unable to refresh product dialog workspace data.", error);
        }
    };

    const workspaceDelivery = createWorkspaceSnapshotDelivery({
        getRuntime: () => options.runtimeSessionManager,
        getActiveDataset: () => options.runtimeSessionManager.getActiveDataset(),
        warmDatasetFirstScreens(objectName) {
            warmDatasetEditorFirstScreens(
                options.warmInitialDatasetPreview,
                options.warmInitialVariableMetadata,
                objectName
            );
        },
        publishWorkspace(current) {
            sendToAllWindows(applicationEventChannels.workspace, current);
        },
        publishDatasetNames(names) {
            options.sendDatasetEditor(datasetEditorEventChannels.setDatasetList, {
                datasetNames: names
            });
        }
    });

    const sendWorkspaceSnapshot = function(
        snapshot: WorkspaceSnapshot,
        sendOptions: {
            warmActiveDataset?: boolean;
            refreshProductDialogs?: boolean;
            metadataRefreshes?: WorkspaceSnapshotDeliveryOptions["metadataRefreshes"];
            reportMetadataError?: WorkspaceSnapshotDeliveryOptions["reportMetadataError"];
        } = {}
    ): Promise<boolean> {
        return workspaceDelivery.deliver(snapshot, {
            warmActiveDataset: sendOptions.warmActiveDataset,
            metadataRefreshes: sendOptions.metadataRefreshes,
            reportMetadataError: sendOptions.reportMetadataError,
            refreshDialogs: sendOptions.refreshProductDialogs !== false
                ? refreshWorkspaceDialogs
                : undefined
        });
    };

    const sendActiveDataset = function(snapshot: ActiveDatasetSnapshot): void {
        sendToAllWindows(applicationEventChannels.activeDataset, snapshot);
    };

    const refreshWorkspaceAndBroadcast = async function(
        refreshOptions?: WorkspaceListOptions
    ): Promise<WorkspaceSnapshot> {
        const snapshot = await options.runtimeSessionManager.listWorkspaceObjects(
            refreshOptions
        );

        if (!await sendWorkspaceSnapshot(snapshot)) {
            return options.runtimeSessionManager.getWorkspaceSnapshot();
        }
        sendActiveDataset(options.runtimeSessionManager.getActiveDataset());

        return snapshot;
    };

    const sendRuntimeEvents = runtimeEventDelivery.publishSnapshot;

    const sendTabularPreview = function(preview: TabularPreviewSnapshot): void {
        sendToAllWindows(applicationEventChannels.tabularPreview, preview);
    };

    const sendCellUpdate = function(result: CellUpdateResult | CellUpdateBatchResult): void {
        sendToAllWindows(applicationEventChannels.cellUpdate, result);
    };

    const sendVariableMetadata = function(snapshot: VariableMetadataSnapshot): void {
        sendToAllWindows(applicationEventChannels.variableMetadata, snapshot);
    };

    const sendValueLabels = function(snapshot: ValueLabelSnapshot): void {
        sendToAllWindows(applicationEventChannels.valueLabels, snapshot);
    };

    const sendDeclaredMissing = function(snapshot: DeclaredMissingSnapshot): void {
        sendToAllWindows(applicationEventChannels.declaredMissing, snapshot);
    };

    const sendImportResult = function(result: ImportResult): void {
        sendToAllWindows(applicationEventChannels.importResult, result);
    };

    const sendClipboardResult = function(result: ClipboardResult): void {
        sendToAllWindows(applicationEventChannels.clipboardResult, result);
    };

    const sendDatasetEditorChanges = function(
        changes: Array<Record<string, unknown>>
    ): void {
        if (
            !options.hasDatasetEditorWindow()
            || changes.length === 0
        ) {
            return;
        }

        options.sendDatasetEditor(
            datasetEditorEventChannels.applyChanges,
            { changes }
        );
    };

    const broadcastRuntimeEvents = async function(
        broadcastOptions?: { sendDatasetChanges?: boolean }
    ): Promise<void> {
        await runtimeEventDelivery.refresh(broadcastOptions);
    };

    return {
        deferRuntimeSessionReady: sessionPublication.deferReady,
        sendRuntimeSession,
        sendTranscriptEvents,
        sendWorkspaceSnapshot,
        refreshWorkspaceAndBroadcast,
        sendRuntimeEvents,
        sendActiveDataset,
        sendTabularPreview,
        sendCellUpdate,
        sendVariableMetadata,
        sendValueLabels,
        sendDeclaredMissing,
        sendImportResult,
        sendClipboardResult,
        sendDatasetEditorChanges,
        broadcastRuntimeEvents
    };
};
