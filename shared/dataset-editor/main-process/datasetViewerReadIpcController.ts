import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type {
    RuntimeSessionManager,
    TabularPreviewRequest,
    TabularPreviewSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import {
    createRuntimeExtensionMethodRequest
} from "../../runtime/extensions/runtimeExtensionProtocol";
import {
    toDatasetViewerContent,
    toDatasetViewerSchema,
    type DatasetViewerContent,
    type DatasetViewerSchema
} from "./datasetViewerAdapter";
import {
    datasetEditorIpcChannels
} from "../datasetEditorIpc";


export interface DatasetViewerFilterState {
    command?: string;
}


export interface DatasetViewerVariableBatch {
    name: string;
    total: number;
    start: number;
    count: number;
    items: unknown[];
}


export interface DatasetViewerReadIpcControllerOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        "readTabularSchema" | "executeRuntimeMethod" | "readVariableMetadata"
    >;
    readInitialDatasetPreview(request: TabularPreviewRequest): Promise<TabularPreviewSnapshot>;
    readInitialVariableMetadataBatch(
        objectName: string,
        start: number,
        count: number
    ): Promise<DatasetViewerVariableBatch>;
    getFilterState(objectName: string): DatasetViewerFilterState | null | undefined;
}


const objectNameFromPayload = function(payload: { name?: string } | undefined): string {
    return String(payload?.name || "").trim();
};


const positiveIntegerFromPayload = function(value: unknown, fallback: number): number {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue) || numberValue < 1) {
        return fallback;
    }

    return Math.floor(numberValue);
};


const numberFromPayload = function(value: unknown, fallback: number): number {
    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : fallback;
};


export const createDatasetViewerReadIpcController = function(
    options: DatasetViewerReadIpcControllerOptions
): void {
    options.ipcMain.handle(
        datasetEditorIpcChannels.getSchema,
        async (
            _event: IpcMainInvokeEvent,
            payload: { name?: string }
        ): Promise<DatasetViewerSchema | null> => {
            const objectName = objectNameFromPayload(payload);

            if (!objectName) {
                return null;
            }

            return toDatasetViewerSchema(
                await options.runtimeSessionManager.readTabularSchema(objectName)
            );
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.getContent,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                name?: string;
                rowStart?: number;
                rowCount?: number;
                columns?: string[];
                columnCount?: number;
            }
        ): Promise<DatasetViewerContent | null> => {
            const objectName = objectNameFromPayload(payload);

            if (!objectName) {
                return null;
            }

            const request: TabularPreviewRequest = {
                objectName,
                rowStart: payload?.rowStart,
                rowCount: payload?.rowCount,
                columns: Array.isArray(payload?.columns) ? payload.columns : [],
                columnCount: payload?.columnCount
            };
            const preview = await options.readInitialDatasetPreview(request);

            return toDatasetViewerContent(preview, request);
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.getFilterMask,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                name?: string;
                rowStart?: number;
                rowCount?: number;
            }
        ): Promise<unknown> => {
            const objectName = objectNameFromPayload(payload);

            if (!objectName) {
                return null;
            }

            const rowStart = numberFromPayload(payload?.rowStart, 1);
            const rowCount = numberFromPayload(payload?.rowCount, 0);
            const filterState = options.getFilterState(objectName);

            if (filterState?.command) {
                const result = await options.runtimeSessionManager.executeRuntimeMethod(
                    createRuntimeExtensionMethodRequest({
                        method: "workspace.dataset_filter_mask",
                        params: {
                            name: objectName,
                            code: filterState.command,
                            rowStart,
                            rowCount
                        },
                        source: "base-app.dataset-editor"
                    })
                );

                if (
                    result.status === "ready"
                    && result.value
                    && typeof result.value === "object"
                ) {
                    return result.value;
                }
            }

            return {
                name: objectName,
                rowStart,
                rowCount,
                filteredOut: Array.from({ length: Math.max(0, rowCount) }, () => false)
            };
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.getVariables,
        async (
            _event: IpcMainInvokeEvent,
            payload: { name?: string }
        ) => {
            const objectName = objectNameFromPayload(payload);

            if (!objectName) {
                return null;
            }

            const snapshot = await options.runtimeSessionManager.readVariableMetadata(objectName);

            return snapshot.status === "ready" ? snapshot.variables : null;
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.getVariablesBatch,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                name?: string;
                start?: number;
                count?: number;
            }
        ): Promise<DatasetViewerVariableBatch | null> => {
            const objectName = objectNameFromPayload(payload);
            const start = positiveIntegerFromPayload(payload?.start, 1);
            const count = positiveIntegerFromPayload(payload?.count, 16);

            if (!objectName) {
                return null;
            }

            return options.readInitialVariableMetadataBatch(objectName, start, count);
        }
    );
};
