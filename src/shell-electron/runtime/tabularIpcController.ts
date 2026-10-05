import { warmDatasetEditorFirstScreens } from "../../dataset-editor/datasetEditorWarmCache";
import {
    createRuntimeCellBatchMutation,
    createRuntimeCellMutation
} from "../../runtime/tabular-data/runtimeCellBatchMutation";
import { createRuntimeTabularMetadataMutation } from "../../runtime/tabular-data/runtimeTabularMetadataMutation";
import { createRuntimeTabularReadActions } from "../../runtime/tabular-data/runtimeTabularReadActions";
import { createRuntimeColumnMutationActions } from "../../runtime/tabular-data/runtimeColumnMutationActions";
import { createRuntimeRowMutationActions } from "../../runtime/tabular-data/runtimeRowMutationActions";
import { createRuntimeTabularMetadataReads } from "../../runtime/tabular-data/runtimeTabularMetadataReads";
import { deliverDatasetMutationEffects } from "../../dataset-editor/datasetMutationDelivery";
import { captureWorkspaceRuntimeScope } from "../../runtime/workspace/workspaceSnapshotDelivery";
import {
    createDatasetMutationCacheEffect,
    type DatasetMutationCacheEffect
} from "../../dataset-editor/datasetMutationCacheEffects";
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
} from "../../runtime/provider-contract/runtimeProvider";
import {
    tabularIpcChannels
} from "../../core/ipc/tabularIpc";
import {
    createImportRequest
} from "../../runtime/tabular-data/importProtocol";


export interface TabularIpcControllerOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        | "readTabularSchema"
        | "getSnapshot"
        | "getWorkspaceSnapshot"
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
    invalidateInitialDatasetPreview(objectName: string, effect: DatasetMutationCacheEffect): void;
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


export const createTabularIpcController = function(
    options: TabularIpcControllerOptions
): void {
    const reads = createRuntimeTabularReadActions({
        runtimeSessionManager: options.runtimeSessionManager,
        readPreview: options.readInitialDatasetPreview,
        previewRead: options.sendTabularPreview
    });
    const metadataReads = createRuntimeTabularMetadataReads({
        runtimeSessionManager: options.runtimeSessionManager,
        publishVariableMetadata: options.sendVariableMetadata,
        publishValueLabels: options.sendValueLabels,
        publishDeclaredMissing: options.sendDeclaredMissing
    });
    const cellBatch = createRuntimeCellBatchMutation({
        runtimeSessionManager: options.runtimeSessionManager,
        completed: options.sendCellUpdate,
        updated: async (_result, objectNames, isCurrent) => {
            await deliverDatasetMutationEffects({
                isCurrent,
                objectNames,
                updateCache: name => options.invalidateInitialDatasetPreview(name, createDatasetMutationCacheEffect([
                    { kind: "dataset_cells_changed" }
                ])),
                refreshConsumers: options.broadcastRuntimeEvents
            });
        }
    });
    const invalidateAndBroadcast = async function(
        objectName: string,
        effect: DatasetMutationCacheEffect
    ): Promise<void> {
        await deliverDatasetMutationEffects({
            isCurrent: captureWorkspaceRuntimeScope(() => options.runtimeSessionManager),
            objectNames: [objectName],
            updateCache: name => options.invalidateInitialDatasetPreview(name, effect),
            refreshConsumers: options.broadcastRuntimeEvents
        });
    };
    const metadata = createRuntimeTabularMetadataMutation({
        runtimeSessionManager: options.runtimeSessionManager,
        updated: result => invalidateAndBroadcast(result.objectName, createDatasetMutationCacheEffect([
            { kind: "dataset_variable_meta_changed" }
        ]))
    });
    const columns = createRuntimeColumnMutationActions({
        runtimeSessionManager: options.runtimeSessionManager,
        updated: result => invalidateAndBroadcast(result.objectName, createDatasetMutationCacheEffect([
            { kind: "dataset_columns_changed", schemaChanged: true }
        ]))
    });
    const rows = createRuntimeRowMutationActions({
        runtimeSessionManager: options.runtimeSessionManager,
        updated: (result, changes) => invalidateAndBroadcast(
            result.objectName, createDatasetMutationCacheEffect(changes)
        )
    });
    const cell = createRuntimeCellMutation({
        runtimeSessionManager: options.runtimeSessionManager,
        completed: options.sendCellUpdate,
        updated: result => invalidateAndBroadcast(result.objectName, createDatasetMutationCacheEffect([
            { kind: "dataset_cells_changed" }
        ]))
    });

    options.ipcMain.handle(
        tabularIpcChannels.readSchema,
        async (_event: IpcMainInvokeEvent, objectName: string) => {
            return reads.readTabularSchema(objectName);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.readPreview,
        async (
            _event: IpcMainInvokeEvent,
            input: string | Partial<TabularPreviewRequest>
        ) => {
            return reads.readTabularPreview(input);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.writeCell,
        async (_event: IpcMainInvokeEvent, input: Partial<CellUpdateRequest>) => {
            return cell.writeCell(input);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.writeCells,
        async (_event: IpcMainInvokeEvent, inputs: Partial<CellUpdateRequest>[]) => {
            return cellBatch.writeCells(inputs);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.renameColumn,
        async (_event: IpcMainInvokeEvent, input: Partial<ColumnRenameRequest>) => {
            return columns.renameColumn(input);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.insertColumn,
        async (_event: IpcMainInvokeEvent, input: Partial<ColumnInsertRequest>) => {
            return columns.insertColumn(input);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.removeColumn,
        async (_event: IpcMainInvokeEvent, input: Partial<ColumnRemoveRequest>) => {
            return columns.removeColumn(input);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.insertRow,
        async (_event: IpcMainInvokeEvent, input: Partial<RowInsertRequest>) => {
            return rows.insertRow(input);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.removeRow,
        async (_event: IpcMainInvokeEvent, input: Partial<RowRemoveRequest>) => {
            return rows.removeRow(input);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.sortRows,
        async (_event: IpcMainInvokeEvent, input: Partial<RowSortRequest>) => {
            return rows.sortRows(input);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.updateRowName,
        async (_event: IpcMainInvokeEvent, input: Partial<RowNameUpdateRequest>) => {
            return rows.updateRowName(input);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.readVariableMetadata,
        async (_event: IpcMainInvokeEvent, objectName: string) => {
            return metadataReads.readVariableMetadata(objectName);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.writeVariableMetadata,
        async (_event: IpcMainInvokeEvent, input: Partial<VariableMetadataUpdateRequest>) => {
            return metadata.writeVariableMetadata(input);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.readValueLabels,
        async (_event: IpcMainInvokeEvent, objectName: string) => {
            return metadataReads.readValueLabels(objectName);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.writeValueLabels,
        async (_event: IpcMainInvokeEvent, input: Partial<ValueLabelUpdateRequest>) => {
            return metadata.writeValueLabels(input);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.readDeclaredMissing,
        async (_event: IpcMainInvokeEvent, objectName: string) => {
            return metadataReads.readDeclaredMissing(objectName);
        }
    );

    options.ipcMain.handle(
        tabularIpcChannels.writeDeclaredMissing,
        async (_event: IpcMainInvokeEvent, input: Partial<DeclaredMissingUpdateRequest>) => {
            return metadata.writeDeclaredMissing(input);
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
                warmDatasetEditorFirstScreens(
                    options.warmInitialDatasetPreview,
                    options.warmInitialVariableMetadata,
                    result.targetName
                );
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
