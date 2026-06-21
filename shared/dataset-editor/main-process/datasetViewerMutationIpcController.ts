import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type {
    RuntimeSessionManager,
    UiCommandVisibility
} from "../../runtime/provider-contract/runtimeProvider";
import {
    createRuntimeExtensionMethodRequest
} from "../../runtime/extensions/runtimeExtensionProtocol";
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
} from "../datasetEditorIpc";


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
    sendDatasetEditorChanges(changes: Array<Record<string, unknown>>): void;
    broadcastRuntimeEvents(options?: { sendDatasetChanges?: boolean }): Promise<void>;
}


const providerRowIndexFromPayload = function(value: unknown): number {
    const rowNumber = Number(value);

    if (!Number.isFinite(rowNumber) || rowNumber < 1) {
        return Number.NaN;
    }

    return Math.floor(rowNumber) - 1;
};


const stringFromPayload = function(value: unknown): string {
    return String(value || "");
};


const normalizedPosition = function(value: unknown): "before" | "after" {
    return value === "after" ? "after" : "before";
};


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


const createCellFallback = function(value: unknown): { display: string; raw: string } {
    const text = value === null || typeof value === "undefined"
        ? ""
        : String(value);

    return {
        display: text,
        raw: text
    };
};


const collectVariablePatchParams = function(payload: Record<string, unknown>): Record<string, unknown> {
    const params: Record<string, unknown> = {
        name: String(payload.name || "").trim(),
        variableName: String(payload.variableName || "").trim()
    };

    [
        "type",
        "measure",
        "label",
        "width",
        "decimals",
        "align",
        "categories",
        "missingRange"
    ].forEach((key) => {
        const value = payload[key];

        if (
            Object.prototype.hasOwnProperty.call(payload, key)
            && value !== undefined
        ) {
            params[key] = value;
        }
    });

    return params;
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
                objectName: stringFromPayload(payload?.name),
                rowIndex: providerRowIndexFromPayload(payload?.row),
                columnName: stringFromPayload(payload?.column),
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

            return result.status === "updated"
                ? result.cell || createCellFallback(result.value)
                : null;
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
                objectName: stringFromPayload(payload?.name),
                fromName: stringFromPayload(payload?.column),
                toName: stringFromPayload(payload?.nextName),
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

            return {
                column: result.fromName,
                name: result.toName
            };
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
                objectName: stringFromPayload(payload?.name),
                rowIndex: providerRowIndexFromPayload(payload?.row),
                name: stringFromPayload(payload?.nextName),
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

            return result.status === "updated"
                ? {
                    row: result.rowIndex + 1,
                    name: result.name
                }
                : null;
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
            const position = normalizedPosition(payload?.position);
            const result = await options.runtimeSessionManager.insertRow(createRowInsertRequest({
                objectName: stringFromPayload(payload?.name),
                rowIndex: providerRowIndexFromPayload(payload?.row),
                name: stringFromPayload(payload?.nextName),
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

            return result.status === "updated"
                ? {
                    name: result.objectName,
                    row: result.rowIndex + 1,
                    nextName: result.name || stringFromPayload(payload?.nextName),
                    position,
                    rowCount: result.rowCount
                }
                : null;
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
                objectName: stringFromPayload(payload?.name),
                rowIndex: providerRowIndexFromPayload(payload?.row),
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

            return result.status === "updated"
                ? {
                    name: result.objectName,
                    row: result.rowIndex + 1,
                    rowCount: result.rowCount
                }
                : null;
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
            const position = normalizedPosition(payload?.position);
            const result = await options.runtimeSessionManager.insertColumn(createColumnInsertRequest({
                objectName: stringFromPayload(payload?.name),
                referenceName: stringFromPayload(payload?.column),
                newName: stringFromPayload(payload?.nextName),
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

            return result.status === "updated"
                ? {
                    name: result.objectName,
                    column: stringFromPayload(payload?.column),
                    nextName: result.columnName,
                    columnIndex: result.columnIndex,
                    columnCount: result.columnCount,
                    position
                }
                : null;
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
                objectName: stringFromPayload(payload?.name),
                columnName: stringFromPayload(payload?.column),
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

            return result.status === "updated"
                ? {
                    column: result.columnName,
                    columnCount: result.columnCount
                }
                : null;
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
                objectName: stringFromPayload(payload?.name),
                columnName: stringFromPayload(payload?.column),
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

            return result.status === "updated"
                ? {
                    name: result.objectName,
                    column: result.columnName,
                    decreasing: result.direction === "descending",
                    rowCount: result.rowCount,
                    command: result.command || ""
                }
                : null;
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
            const input = (payload || {}) as Record<string, unknown>;
            const objectName = String(input.name || "").trim();
            const variableName = String(input.variableName || "").trim();

            if (!objectName || !variableName) {
                return null;
            }

            const result = await options.runtimeSessionManager.executeRuntimeMethod(
                createRuntimeExtensionMethodRequest({
                    method: "workspace.dataset_update_variable",
                    params: collectVariablePatchParams(input),
                    source: "base-app.dataset-editor"
                })
            );

            if (result.status !== "ready") {
                return null;
            }

            await notifyMutation(
                options,
                objectName,
                [{
                    name: objectName,
                    kind: "dataset_variable_meta_changed",
                    columns: [variableName]
                }],
                false
            );

            return result.value && typeof result.value === "object"
                ? result.value
                : null;
        }
    );
};
