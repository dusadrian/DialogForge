import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type {
    RuntimeSessionManager,
    UiCommandVisibility
} from "../../runtime/provider-contract/runtimeProvider";
import {
    createCellUpdateRequest,
    createColumnInsertRequest,
    createColumnRemoveRequest,
    createColumnRenameRequest,
    createRowInsertRequest,
    createRowNameUpdateRequest,
    createRowRemoveRequest,
    createRowSortRequest
} from "../../runtime/tabular-data/tabularProtocol";
import {
    datasetEditorIpcChannels
} from "../../dataset-editor/datasetEditorIpc";
import {
    createDatasetViewerCellUpdateResult,
    createDatasetViewerColumnInsertResult,
    createDatasetViewerColumnRemoveResult,
    createDatasetViewerColumnRenameResult,
    createDatasetViewerRowInsertResult,
    createDatasetViewerRowNameResult,
    createDatasetViewerRowRemoveResult,
    createDatasetViewerRowSortResult,
    normalizedDatasetViewerPosition,
    providerRowIndexFromDatasetViewerPayload,
    stringFromDatasetViewerPayload
} from "../../base-app/modules/datasetViewerMutationResults";
import {
    applyRuntimeDatasetVariablePatch
} from "../../runtime/tabular-data/runtimeDatasetVariablePatch";


export interface DatasetViewerMutationIpcControllerOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        | "writeCell"
        | "renameColumn"
        | "updateRowName"
        | "insertRow"
        | "removeRow"
        | "insertColumn"
        | "removeColumn"
        | "sortRows"
        | "executeRuntimeMethod"
    >;
    uiCommandVisibility(): UiCommandVisibility;
    invalidateInitialDatasetPreview(objectName: string): void;
    patchVariableMetadata(
        objectName: string,
        variableName: string,
        value: unknown
    ): void;
    sendDatasetEditorChanges(changes: Array<Record<string, unknown>>): void;
    broadcastRuntimeEvents(options?: { sendDatasetChanges?: boolean }): Promise<void>;
}


const notifyMutation = async function(
    options: DatasetViewerMutationIpcControllerOptions,
    objectName: string,
    changes: Array<Record<string, unknown>>,
    invalidatePreview: boolean
): Promise<void> {
    if (invalidatePreview) {
        options.invalidateInitialDatasetPreview(objectName);
    }

    options.sendDatasetEditorChanges(changes);
    await options.broadcastRuntimeEvents({ sendDatasetChanges: false });
};


export const createDatasetViewerMutationIpcController = function(
    options: DatasetViewerMutationIpcControllerOptions
): void {
    options.ipcMain.handle(
        datasetEditorIpcChannels.updateCell,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                name?: string;
                row?: number;
                column?: string;
                value?: unknown;
            }
        ) => {
            const result = await options.runtimeSessionManager.writeCell(createCellUpdateRequest({
                objectName: stringFromDatasetViewerPayload(payload?.name),
                rowIndex: providerRowIndexFromDatasetViewerPayload(payload?.row),
                columnName: stringFromDatasetViewerPayload(payload?.column),
                value: payload?.value,
                uiCommandVisibility: options.uiCommandVisibility()
            }));

            if (result.status === "updated") {
                await notifyMutation(
                    options,
                    result.objectName,
                    [{
                        name: result.objectName,
                        kind: "dataset_cells_changed",
                        rows: [result.rowIndex + 1],
                        columns: [result.columnName]
                    }],
                    true
                );
            }

            return createDatasetViewerCellUpdateResult(result);
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.updateColumnName,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                name?: string;
                column?: string;
                nextName?: string;
            }
        ) => {
            const result = await options.runtimeSessionManager.renameColumn(createColumnRenameRequest({
                objectName: stringFromDatasetViewerPayload(payload?.name),
                fromName: stringFromDatasetViewerPayload(payload?.column),
                toName: stringFromDatasetViewerPayload(payload?.nextName),
                uiCommandVisibility: options.uiCommandVisibility()
            }));

            if (result.status !== "updated") {
                return null;
            }

            await notifyMutation(
                options,
                result.objectName,
                [{
                    name: result.objectName,
                    kind: "dataset_column_renamed",
                    columns: [result.fromName, result.toName]
                }],
                true
            );

            return createDatasetViewerColumnRenameResult(result);
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.updateRowName,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                name?: string;
                row?: number;
                nextName?: string;
            }
        ) => {
            const result = await options.runtimeSessionManager.updateRowName(createRowNameUpdateRequest({
                objectName: stringFromDatasetViewerPayload(payload?.name),
                rowIndex: providerRowIndexFromDatasetViewerPayload(payload?.row),
                name: stringFromDatasetViewerPayload(payload?.nextName),
                uiCommandVisibility: options.uiCommandVisibility()
            }));

            if (result.status === "updated") {
                await notifyMutation(
                    options,
                    result.objectName,
                    [{
                        name: result.objectName,
                        kind: "dataset_rows_changed",
                        rows: [result.rowIndex + 1]
                    }],
                    true
                );
            }

            return createDatasetViewerRowNameResult(result);
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.insertRow,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                name?: string;
                row?: number;
                nextName?: string;
                position?: "before" | "after";
            }
        ) => {
            const position = normalizedDatasetViewerPosition(payload?.position);
            const result = await options.runtimeSessionManager.insertRow(createRowInsertRequest({
                objectName: stringFromDatasetViewerPayload(payload?.name),
                rowIndex: providerRowIndexFromDatasetViewerPayload(payload?.row),
                name: stringFromDatasetViewerPayload(payload?.nextName),
                position,
                uiCommandVisibility: options.uiCommandVisibility()
            }));

            if (result.status === "updated") {
                await notifyMutation(
                    options,
                    result.objectName,
                    [{
                        name: result.objectName,
                        kind: "dataset_rows_changed",
                        rows: [result.rowIndex + 1],
                        rowCount: result.rowCount,
                        schemaChanged: true
                    }],
                    true
                );
            }

            return createDatasetViewerRowInsertResult(result, {
                name: payload?.nextName,
                position
            });
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.removeRow,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                name?: string;
                row?: number;
            }
        ) => {
            const result = await options.runtimeSessionManager.removeRow(createRowRemoveRequest({
                objectName: stringFromDatasetViewerPayload(payload?.name),
                rowIndex: providerRowIndexFromDatasetViewerPayload(payload?.row),
                uiCommandVisibility: options.uiCommandVisibility()
            }));

            if (result.status === "updated") {
                await notifyMutation(
                    options,
                    result.objectName,
                    [{
                        name: result.objectName,
                        kind: "dataset_rows_changed",
                        rows: [result.rowIndex + 1],
                        rowCount: result.rowCount,
                        schemaChanged: true
                    }],
                    true
                );
            }

            return createDatasetViewerRowRemoveResult(result);
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.insertColumn,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                name?: string;
                column?: string;
                nextName?: string;
                position?: "before" | "after";
            }
        ) => {
            const position = normalizedDatasetViewerPosition(payload?.position);
            const result = await options.runtimeSessionManager.insertColumn(createColumnInsertRequest({
                objectName: stringFromDatasetViewerPayload(payload?.name),
                referenceName: stringFromDatasetViewerPayload(payload?.column),
                newName: stringFromDatasetViewerPayload(payload?.nextName),
                position,
                uiCommandVisibility: options.uiCommandVisibility()
            }));

            if (result.status === "updated") {
                await notifyMutation(
                    options,
                    result.objectName,
                    [{
                        name: result.objectName,
                        kind: "dataset_columns_changed",
                        columns: [result.columnName],
                        columnIndex: result.columnIndex,
                        columnCount: result.columnCount,
                        schemaChanged: true
                    }],
                    true
                );
            }

            return createDatasetViewerColumnInsertResult(result, {
                column: payload?.column,
                position
            });
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.removeColumn,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                name?: string;
                column?: string;
            }
        ) => {
            const result = await options.runtimeSessionManager.removeColumn(createColumnRemoveRequest({
                objectName: stringFromDatasetViewerPayload(payload?.name),
                columnName: stringFromDatasetViewerPayload(payload?.column),
                uiCommandVisibility: options.uiCommandVisibility()
            }));

            if (result.status === "updated") {
                await notifyMutation(
                    options,
                    result.objectName,
                    [{
                        name: result.objectName,
                        kind: "dataset_column_removed",
                        columns: [result.columnName],
                        columnCount: result.columnCount
                    }],
                    true
                );
            }

            return createDatasetViewerColumnRemoveResult(result);
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.sortRows,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                name?: string;
                column?: string;
                decreasing?: boolean;
                naLast?: boolean;
                emptyLast?: boolean;
            }
        ) => {
            const result = await options.runtimeSessionManager.sortRows(createRowSortRequest({
                objectName: stringFromDatasetViewerPayload(payload?.name),
                columnName: stringFromDatasetViewerPayload(payload?.column),
                direction: payload?.decreasing === true ? "descending" : "ascending",
                naLast: payload?.naLast !== false,
                emptyLast: payload?.emptyLast !== false,
                uiCommandVisibility: options.uiCommandVisibility()
            }));

            if (result.status === "updated") {
                await notifyMutation(
                    options,
                    result.objectName,
                    [{
                        name: result.objectName,
                        kind: "dataset_rows_changed",
                        rowCount: result.rowCount
                    }],
                    false
                );
            }

            return createDatasetViewerRowSortResult(result);
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.updateVariable,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                name?: string;
                variableName?: string;
                type?: string;
                measure?: string;
                label?: string;
                width?: number;
                decimals?: number;
                align?: string;
                categories?: Array<{
                    value?: unknown;
                    label?: unknown;
                    isMissing?: boolean;
                }>;
                missingRange?: null | {
                    min?: unknown;
                    max?: unknown;
                };
            }
        ) => {
            const result = await applyRuntimeDatasetVariablePatch(
                options.runtimeSessionManager,
                payload
            );

            if (!result) {
                return null;
            }

            options.patchVariableMetadata(
                result.objectName,
                result.variableName,
                result.value
            );

            await notifyMutation(
                options,
                result.objectName,
                [{
                    name: result.objectName,
                    kind: "dataset_variable_meta_changed",
                    columns: [result.variableName]
                }],
                false
            );

            return result.value;
        }
    );
};
