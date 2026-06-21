import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type {
    CellUpdateBatchResult,
    CellUpdateRequest,
    ColumnInsertRequest,
    ColumnRemoveRequest,
    ColumnRenameRequest,
    DeclaredMissingSnapshot,
    DeclaredMissingUpdateRequest,
    ImportRequest,
    ImportResult,
    RuntimeSessionManager,
    RowInsertRequest,
    RowNameUpdateRequest,
    RowRemoveRequest,
    RowSortRequest,
    TabularPreviewRequest,
    TabularPreviewSnapshot,
    ValueLabelSnapshot,
    ValueLabelUpdateRequest,
    VariableMetadataSnapshot,
    VariableMetadataUpdateRequest
} from "../provider-contract/runtimeProvider";
import {
    tabularIpcChannels
} from "../../core/ipc/tabularIpc";
import {
    createCellUpdateRequest,
    createColumnInsertRequest,
    createColumnRemoveRequest,
    createColumnRenameRequest,
    createDeclaredMissingUpdateRequest,
    createRowInsertRequest,
    createRowNameUpdateRequest,
    createRowRemoveRequest,
    createRowSortRequest,
    createValueLabelUpdateRequest,
    createVariableMetadataUpdateRequest
} from "./tabularProtocol";
import {
    createImportRequest
} from "./importProtocol";


export interface TabularIpcControllerOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        | "readTabularSchema"
        | "writeCell"
        | "writeCells"
        | "renameColumn"
        | "insertColumn"
        | "removeColumn"
        | "insertRow"
        | "removeRow"
        | "sortRows"
        | "updateRowName"
        | "readVariableMetadata"
        | "writeVariableMetadata"
        | "readValueLabels"
        | "writeValueLabels"
        | "readDeclaredMissing"
        | "writeDeclaredMissing"
        | "importData"
        | "getActiveDataset"
    >;
    readInitialDatasetPreview(
        request: string | Partial<TabularPreviewRequest>
    ): Promise<TabularPreviewSnapshot>;
    invalidateInitialDatasetPreview(objectName?: string): void;
    warmInitialDatasetPreview(objectName: string): void;
    warmInitialVariableMetadata(objectName: string): void;
    refreshWorkspaceAndBroadcast(): Promise<unknown>;
    broadcastRuntimeEvents(): Promise<void>;
    sendTabularPreview(preview: TabularPreviewSnapshot): void;
    sendCellUpdate(result: CellUpdateBatchResult | Awaited<ReturnType<RuntimeSessionManager["writeCell"]>>): void;
    sendVariableMetadata(snapshot: VariableMetadataSnapshot): void;
    sendValueLabels(snapshot: ValueLabelSnapshot): void;
    sendDeclaredMissing(snapshot: DeclaredMissingSnapshot): void;
    sendImportResult(result: ImportResult): void;
    sendActiveDataset(snapshot: ReturnType<RuntimeSessionManager["getActiveDataset"]>): void;
    sendTranscriptEvents(events: ImportResult["transcriptEvents"]): void;
}


const uniqueObjectNames = function(requests: CellUpdateRequest[]): string[] {
    return Array.from(new Set(requests.map((request) => {
        return request.objectName;
    }).filter(Boolean)));
};


export const createTabularIpcController = function(
    options: TabularIpcControllerOptions
): void {
    const invalidateAndBroadcast = async function(objectName: string): Promise<void> {
        options.invalidateInitialDatasetPreview(objectName);
        await options.broadcastRuntimeEvents();
    };

    options.ipcMain.handle(
        tabularIpcChannels.readSchema,
        async (_event: IpcMainInvokeEvent, objectName: string) => {
            const targetName = String(objectName || "").trim();

            return options.runtimeSessionManager.readTabularSchema(targetName);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.readPreview,
        async (
            _event: IpcMainInvokeEvent,
            input: string | Partial<TabularPreviewRequest>
        ) => {
            const request = typeof input === "string"
                ? { objectName: input }
                : input;
            const preview = await options.readInitialDatasetPreview(request);

            options.sendTabularPreview(preview);

            return preview;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.writeCell,
        async (_event: IpcMainInvokeEvent, input: Partial<CellUpdateRequest>) => {
            const request = createCellUpdateRequest(input || {});
            const result = await options.runtimeSessionManager.writeCell(request);

            options.sendCellUpdate(result);
            if (result.status === "updated") {
                await invalidateAndBroadcast(result.objectName);
            }

            return result;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.writeCells,
        async (_event: IpcMainInvokeEvent, inputs: Partial<CellUpdateRequest>[]) => {
            const requests = (inputs || []).map((input) => {
                return createCellUpdateRequest(input || {});
            });
            const result = await options.runtimeSessionManager.writeCells(requests);

            options.sendCellUpdate(result);
            if (result.updated > 0) {
                uniqueObjectNames(requests).forEach((objectName) => {
                    options.invalidateInitialDatasetPreview(objectName);
                });
                await options.broadcastRuntimeEvents();
            }

            return result;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.renameColumn,
        async (_event: IpcMainInvokeEvent, input: Partial<ColumnRenameRequest>) => {
            const request = createColumnRenameRequest(input || {});
            const result = await options.runtimeSessionManager.renameColumn(request);

            if (result.status === "updated") {
                await invalidateAndBroadcast(result.objectName);
            }

            return result;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.insertColumn,
        async (_event: IpcMainInvokeEvent, input: Partial<ColumnInsertRequest>) => {
            const request = createColumnInsertRequest(input || {});
            const result = await options.runtimeSessionManager.insertColumn(request);

            if (result.status === "updated") {
                await invalidateAndBroadcast(result.objectName);
            }

            return result;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.removeColumn,
        async (_event: IpcMainInvokeEvent, input: Partial<ColumnRemoveRequest>) => {
            const request = createColumnRemoveRequest(input || {});
            const result = await options.runtimeSessionManager.removeColumn(request);

            if (result.status === "updated") {
                await invalidateAndBroadcast(result.objectName);
            }

            return result;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.insertRow,
        async (_event: IpcMainInvokeEvent, input: Partial<RowInsertRequest>) => {
            const request = createRowInsertRequest(input || {});
            const result = await options.runtimeSessionManager.insertRow(request);

            if (result.status === "updated") {
                await invalidateAndBroadcast(result.objectName);
            }

            return result;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.removeRow,
        async (_event: IpcMainInvokeEvent, input: Partial<RowRemoveRequest>) => {
            const request = createRowRemoveRequest(input || {});
            const result = await options.runtimeSessionManager.removeRow(request);

            if (result.status === "updated") {
                await invalidateAndBroadcast(result.objectName);
            }

            return result;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.sortRows,
        async (_event: IpcMainInvokeEvent, input: Partial<RowSortRequest>) => {
            const request = createRowSortRequest(input || {});
            const result = await options.runtimeSessionManager.sortRows(request);

            if (result.status === "updated") {
                await invalidateAndBroadcast(result.objectName);
            }

            return result;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.updateRowName,
        async (_event: IpcMainInvokeEvent, input: Partial<RowNameUpdateRequest>) => {
            const request = createRowNameUpdateRequest(input || {});
            const result = await options.runtimeSessionManager.updateRowName(request);

            if (result.status === "updated") {
                await invalidateAndBroadcast(result.objectName);
            }

            return result;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.readVariableMetadata,
        async (_event: IpcMainInvokeEvent, objectName: string) => {
            const snapshot = await options.runtimeSessionManager.readVariableMetadata(objectName);

            options.sendVariableMetadata(snapshot);

            return snapshot;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.writeVariableMetadata,
        async (_event: IpcMainInvokeEvent, input: Partial<VariableMetadataUpdateRequest>) => {
            const request = createVariableMetadataUpdateRequest(input || {});
            const result = await options.runtimeSessionManager.writeVariableMetadata(request);

            if (result.status === "updated") {
                await invalidateAndBroadcast(result.objectName);
            }

            return result;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.readValueLabels,
        async (_event: IpcMainInvokeEvent, objectName: string) => {
            const snapshot = await options.runtimeSessionManager.readValueLabels(objectName);

            options.sendValueLabels(snapshot);

            return snapshot;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.writeValueLabels,
        async (_event: IpcMainInvokeEvent, input: Partial<ValueLabelUpdateRequest>) => {
            const request = createValueLabelUpdateRequest(input || {});
            const result = await options.runtimeSessionManager.writeValueLabels(request);

            if (result.status === "updated") {
                await invalidateAndBroadcast(result.objectName);
            }

            return result;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.readDeclaredMissing,
        async (_event: IpcMainInvokeEvent, objectName: string) => {
            const snapshot = await options.runtimeSessionManager.readDeclaredMissing(objectName);

            options.sendDeclaredMissing(snapshot);

            return snapshot;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.writeDeclaredMissing,
        async (_event: IpcMainInvokeEvent, input: Partial<DeclaredMissingUpdateRequest>) => {
            const request = createDeclaredMissingUpdateRequest(input || {});
            const result = await options.runtimeSessionManager.writeDeclaredMissing(request);

            if (result.status === "updated") {
                await invalidateAndBroadcast(result.objectName);
            }

            return result;
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.importData,
        async (_event: IpcMainInvokeEvent, input: Partial<ImportRequest>) => {
            const request = createImportRequest(input || {});
            const result = await options.runtimeSessionManager.importData(request);

            options.sendImportResult(result);
            options.sendActiveDataset(options.runtimeSessionManager.getActiveDataset());
            if (result.status === "imported") {
                options.warmInitialDatasetPreview(result.targetName);
                options.warmInitialVariableMetadata(result.targetName);
                await options.refreshWorkspaceAndBroadcast();
            }
            if (result.transcriptEvents.length > 0) {
                options.sendTranscriptEvents(result.transcriptEvents);
            }
            if (result.status === "planned") {
                await options.broadcastRuntimeEvents();
            }

            return result;
        }
    );
};
