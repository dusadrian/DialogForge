import { BrowserWindow } from "electron";

import {
    applicationEventChannels
} from "../../base-app/bootstrap/applicationEvents";
import {
    datasetEditorEventChannels
} from "../../dataset-editor/datasetEditorIpc";
import {
    scriptEditorEventChannels
} from "../../script-editor/scriptEditorIpc";
import type {
    ClipboardResult
} from "../clipboard/clipboardResult";
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
    WorkspaceSnapshot
} from "../../runtime/provider-contract/runtimeProvider";


export interface RuntimeBroadcastBridge {
    sendRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    sendTranscriptEvents(events: TranscriptEvent[]): void;
    sendWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void;
    refreshWorkspaceAndBroadcast(options?: {
        forceRefresh?: boolean;
    }): Promise<WorkspaceSnapshot>;
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
    scriptEditorSessionState(channel: string, payload: unknown): void;
    refreshProductDialogWorkspaceData(snapshot: WorkspaceSnapshot): Promise<void>;
    hasDatasetEditorWindow(): boolean;
    sendDatasetEditor(channel: string, payload: unknown): void;
    presentRuntimeEvents(snapshot: RuntimeEventSnapshot): void;
    warmInitialDatasetPreview(objectName: string): void;
    warmInitialVariableMetadata(objectName: string): void;
}


const sendToAllWindows = function(channel: string, payload: unknown): void {
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(channel, payload);
    });
};


export const createRuntimeBroadcastBridge = function(
    options: RuntimeBroadcastBridgeOptions
): RuntimeBroadcastBridge {
    const sendRuntimeSession = function(snapshot: RuntimeSessionSnapshot): void {
        sendToAllWindows(applicationEventChannels.runtimeSession, snapshot);

        options.scriptEditorSessionState(
            scriptEditorEventChannels.sessionState,
            { phase: snapshot.status }
        );
    };

    const sendTranscriptEvents = function(events: TranscriptEvent[]): void {
        sendToAllWindows(applicationEventChannels.runtimeTranscript, events);
    };

    const sendWorkspaceSnapshot = function(snapshot: WorkspaceSnapshot): void {
        const datasetNames = snapshot.objects.filter((object) => {
            return object.capabilities.includes("tabular.read");
        }).map((object) => {
            return object.name;
        });
        const activeDataset = options.runtimeSessionManager.getActiveDataset();

        if (
            activeDataset.status === "selected" &&
            datasetNames.includes(activeDataset.objectName)
        ) {
            options.warmInitialDatasetPreview(activeDataset.objectName);
            options.warmInitialVariableMetadata(activeDataset.objectName);
        }

        sendToAllWindows(applicationEventChannels.workspace, snapshot);
        void options.refreshProductDialogWorkspaceData(snapshot).catch((error) => {
            console.error(
                "Unable to refresh product dialog workspace data.",
                error
            );
        });

        options.sendDatasetEditor(
            datasetEditorEventChannels.setDatasetList,
            { datasetNames }
        );
    };

    const sendActiveDataset = function(snapshot: ActiveDatasetSnapshot): void {
        sendToAllWindows(applicationEventChannels.activeDataset, snapshot);
    };

    const refreshWorkspaceAndBroadcast = async function(refreshOptions?: {
        forceRefresh?: boolean;
    }): Promise<WorkspaceSnapshot> {
        const snapshot = await options.runtimeSessionManager.listWorkspaceObjects(
            refreshOptions
        );

        sendWorkspaceSnapshot(snapshot);
        sendActiveDataset(options.runtimeSessionManager.getActiveDataset());

        return snapshot;
    };

    const sendRuntimeEvents = function(snapshot: RuntimeEventSnapshot): void {
        sendToAllWindows(applicationEventChannels.runtimeEvents, snapshot);

        if (options.hasDatasetEditorWindow()) {
            options.sendDatasetEditor(
                datasetEditorEventChannels.applyChanges,
                {
                    changes: snapshot.events.map((event) => {
                        const payload = event.payload || {};
                        const type = String(event.type || "");
                        const kind = type.includes("column.renamed")
                            ? "dataset_column_renamed"
                            : type.includes("column.removed")
                                ? "dataset_column_removed"
                                : type.includes("column")
                                    ? "dataset_columns_changed"
                                    : type.includes("variable")
                                        ? "dataset_variable_meta_changed"
                                        : type.includes("row")
                                            ? "dataset_rows_changed"
                                            : type.includes("cell")
                                                ? "dataset_cells_changed"
                                                : "dataset_changed_unknown";

                        return Object.assign({}, payload, {
                            name: event.objectName,
                            kind
                        });
                    })
                }
            );
        }
    };

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
        const snapshot = await options.runtimeSessionManager.listRuntimeEvents();

        if (broadcastOptions?.sendDatasetChanges === false) {
            sendToAllWindows(applicationEventChannels.runtimeEvents, snapshot);
        }
        else {
            sendRuntimeEvents(snapshot);
        }

        options.presentRuntimeEvents(snapshot);
    };

    return {
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
