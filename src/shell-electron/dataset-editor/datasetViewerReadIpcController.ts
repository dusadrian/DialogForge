import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type {
    RuntimeSessionManager,
    TabularPreviewRequest,
    TabularPreviewSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import { createDatasetViewerReadController } from "../../runtime/tabular-data/datasetViewerReadController";
import { datasetEditorIpcChannels } from "../../dataset-editor/datasetEditorIpc";


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
    runtimeSessionManager: Pick<RuntimeSessionManager,
        "readTabularSchema" | "executeRuntimeMethod" | "readVariableMetadata"
        | "getSnapshot" | "getWorkspaceSnapshot">;
    readInitialDatasetPreview(request: TabularPreviewRequest): Promise<TabularPreviewSnapshot>;
    readInitialVariableMetadataBatch(
        objectName: string,
        start: number,
        count: number
    ): Promise<DatasetViewerVariableBatch>;
    getFilterState(objectName: string): DatasetViewerFilterState | null | undefined;
}


export const createDatasetViewerReadIpcController = function(
    options: DatasetViewerReadIpcControllerOptions
): void {
    const reads = createDatasetViewerReadController({
        runtimeSessionManager: options.runtimeSessionManager,
        readTabularPreview: options.readInitialDatasetPreview,
        readVariableMetadataBatch: options.readInitialVariableMetadataBatch,
        readFilterState: options.getFilterState
    });

    options.ipcMain.handle(datasetEditorIpcChannels.getSchema,
        (_event: IpcMainInvokeEvent, payload: { name?: string }) => reads.readSchema(payload?.name));
    options.ipcMain.handle(datasetEditorIpcChannels.getContent,
        (_event: IpcMainInvokeEvent, payload: unknown) => reads.readContent(payload));
    options.ipcMain.handle(datasetEditorIpcChannels.getFilterMask,
        (_event: IpcMainInvokeEvent, payload: unknown) => reads.readFilterMask(payload));
    options.ipcMain.handle(datasetEditorIpcChannels.getVariables,
        (_event: IpcMainInvokeEvent, payload: unknown) => reads.readVariables(payload));
    options.ipcMain.handle(datasetEditorIpcChannels.getVariablesBatch,
        (_event: IpcMainInvokeEvent, payload: unknown) => reads.readVariableBatch(payload));
};
