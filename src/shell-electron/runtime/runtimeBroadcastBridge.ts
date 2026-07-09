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
} from "../../base-app/clipboard/clipboardResult";
import type {
    ActiveDatasetSnapshot,
    CellUpdateBatchResult,
    CellUpdateResult,
    DeclaredMissingSnapshot,
    ImportResult,
    RuntimeEventRecord,
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


const recordFromPayload = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


const stringArrayFromPayload = function(value: unknown): string[] {
    return Array.isArray(value)
        ? value.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
};


const datasetChangeFromPayload = function(value: unknown): Record<string, unknown> | null {
    const record = recordFromPayload(value);
    const name = String(record.name || "").trim();
    const kind = String(record.kind || "").trim();

    if (!name || !kind) {
        return null;
    }

    return {
        name,
        kind,
        columns: stringArrayFromPayload(record.columns),
        rows: Array.isArray(record.rows) ? record.rows : [],
        rowCount: record.rowCount,
        columnCount: record.columnCount,
        columnIndex: record.columnIndex,
        schemaChanged: record.schemaChanged === true
    };
};


const datasetChangesFromWorkspaceEvent = function(
    event: RuntimeEventRecord
): Array<Record<string, unknown>> {
    if (event.type !== "workspace.update") {
        return [];
    }

    const payload = recordFromPayload(event.payload);
    const datasets = recordFromPayload(payload.datasets);
    const changes: Array<Record<string, unknown>> = [];

    stringArrayFromPayload(datasets.added).forEach((name) => {
        changes.push({ name, kind: "dataset_added" });
    });
    stringArrayFromPayload(datasets.removed).forEach((name) => {
        changes.push({ name, kind: "dataset_removed" });
    });
    if (Array.isArray(datasets.changed)) {
        datasets.changed.forEach((entry) => {
            const change = datasetChangeFromPayload(entry);

            if (change) {
                changes.push(change);
            }
        });
    }

    return changes;
};


const datasetChangeFromTabularEvent = function(
    event: RuntimeEventRecord
): Record<string, unknown> | null {
    const name = String(event.objectName || "").trim();
    const type = String(event.type || "");
    const payload = recordFromPayload(event.payload);

    if (!name || !type.startsWith("tabular.")) {
        return null;
    }

    if (type.includes("column.renamed")) {
        return {
            name,
            kind: "dataset_column_renamed",
            columns: [
                String(payload.fromName || "").trim(),
                String(payload.toName || "").trim()
            ].filter(Boolean),
            columnIndex: payload.columnIndex
        };
    }

    if (type.includes("column.removed")) {
        return {
            name,
            kind: "dataset_column_removed",
            columns: stringArrayFromPayload([payload.columnName])
        };
    }

    if (type.includes("column")) {
        return {
            name,
            kind: "dataset_columns_changed",
            columns: stringArrayFromPayload([payload.columnName]),
            columnIndex: payload.columnIndex,
            schemaChanged: true
        };
    }

    if (type.includes("row")) {
        return {
            name,
            kind: "dataset_rows_changed",
            rows: Array.isArray(payload.rows) ? payload.rows : [payload.rowIndex]
        };
    }

    if (type.includes("cell")) {
        return {
            name,
            kind: "dataset_cells_changed",
            columns: stringArrayFromPayload([payload.columnName]),
            rows: Array.isArray(payload.rows) ? payload.rows : [payload.rowIndex]
        };
    }

    if (
        type.includes("variableMetadata")
        || type.includes("valueLabels")
        || type.includes("declaredMissing")
    ) {
        return {
            name,
            kind: "dataset_variable_meta_changed",
            columns: stringArrayFromPayload([payload.variableName])
        };
    }

    return null;
};


const datasetChangesFromRuntimeEvent = function(
    event: RuntimeEventRecord
): Array<Record<string, unknown>> {
    const workspaceChanges = datasetChangesFromWorkspaceEvent(event);

    if (workspaceChanges.length > 0) {
        return workspaceChanges;
    }

    const tabularChange = datasetChangeFromTabularEvent(event);

    return tabularChange ? [tabularChange] : [];
};


const runtimeEventKey = function(event: RuntimeEventRecord): string {
    return [
        event.providerId,
        event.type,
        event.objectName,
        event.createdAt,
        JSON.stringify(event.payload || {})
    ].join("\u001f");
};


export const createRuntimeBroadcastBridge = function(
    options: RuntimeBroadcastBridgeOptions
): RuntimeBroadcastBridge {
    const datasetEditorRuntimeEventKeys = new Set<string>();

    const newDatasetEditorChanges = function(
        events: RuntimeEventRecord[]
    ): Array<Record<string, unknown>> {
        const changes: Array<Record<string, unknown>> = [];

        events.slice().reverse().forEach((event) => {
            const key = runtimeEventKey(event);

            if (datasetEditorRuntimeEventKeys.has(key)) {
                return;
            }

            datasetEditorRuntimeEventKeys.add(key);
            changes.push(...datasetChangesFromRuntimeEvent(event));
        });

        return changes;
    };

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

        const changes = newDatasetEditorChanges(snapshot.events);

        if (
            options.hasDatasetEditorWindow()
            && changes.length > 0
        ) {
            options.sendDatasetEditor(
                datasetEditorEventChannels.applyChanges,
                { changes }
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
