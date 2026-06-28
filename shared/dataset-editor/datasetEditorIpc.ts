import type {
    DatasetCellUpdatePatch,
    DatasetVariableMetadata,
    DatasetVariableMetadataBatch,
    DatasetVariableUpdatePatch,
    DatasetViewerCell,
    DatasetViewerContentPage,
    DatasetViewerContentRequest,
    DatasetViewerFilterMaskPage,
    DatasetViewerSchema
} from "../base-app/modules/datasetViewer.types";
import {
    invokeTypedIpcRoute,
    sendTypedIpcCommand,
    type IpcInvokeTransport,
    type IpcSendTransport
} from "../core/ipc/typedIpc";


export interface DatasetEditorDocumentState {
    objectName: string;
    title: string;
    message: string;
}


export const datasetEditorIpcChannels = {
    getDocument: "base-app:getDatasetEditorDocument",
    openEditor: "base-app:openDatasetEditor",
    setVariableColumnWidths: "datasetEditor:setVariableColumnWidths",
    runVisibleCommand: "datasetEditor:runVisibleCommand",
    refreshDataset: "datasetEditor:refreshDataset",
    gotoCase: "datasetEditor:gotoCase",
    gotoVariable: "datasetEditor:gotoVariable",
    getActiveDataset: "activeDataset:get",
    setActiveDataset: "activeDataset:set",
    clearActiveDataset: "activeDataset:clear",
    getActiveState: "datasetEditor:getActiveState",
    consumeGoToContext: "datasetEditor:consumeGoToContext",
    getSchema: "datasetViewer:getSchema",
    getContent: "datasetViewer:getContent",
    getFilterMask: "datasetViewer:getFilterMask",
    getVariables: "datasetViewer:getVariables",
    getVariablesBatch: "datasetViewer:getVariablesBatch",
    updateCell: "datasetViewer:updateCell",
    updateColumnName: "datasetViewer:updateColumnName",
    updateRowName: "datasetViewer:updateRowName",
    insertRow: "datasetViewer:insertRow",
    removeRow: "datasetViewer:removeRow",
    insertColumn: "datasetViewer:insertColumn",
    removeColumn: "datasetViewer:removeColumn",
    sortRows: "datasetViewer:sortRows",
    updateVariable: "datasetViewer:updateVariable"
} as const;


export const datasetEditorEventChannels = {
    init: "datasetEditor:init",
    setDatasetList: "datasetEditor:setDatasetList",
    openDataset: "datasetEditor:openDataset",
    refreshDataset: "datasetEditor:refreshDataset",
    filterStateChanged: "filterStateChanged",
    applyChanges: "datasetEditor:applyChanges",
    gotoCase: "datasetEditor:gotoCase",
    gotoVariable: "datasetEditor:gotoVariable",
    stateChanged: "datasetEditor:stateChanged"
} as const;


interface DatasetEditorCommands {
    "datasetEditor:stateChanged": [{ datasetName: string }];
}


export interface DatasetEditorIpcRoutes {
    "base-app:getDatasetEditorDocument": { input: []; result: DatasetEditorDocumentState };
    "base-app:openDatasetEditor": { input: [string]; result: DatasetEditorDocumentState };
    "datasetEditor:setVariableColumnWidths": { input: [Record<string, unknown>]; result: boolean };
    "datasetEditor:runVisibleCommand": { input: [{ command?: string; datasetName?: string; visible?: boolean }]; result: boolean };
    "datasetEditor:refreshDataset": { input: [{ datasetName?: string; name?: string }]; result: { status: string; datasetName: string } };
    "datasetEditor:gotoCase": { input: [{ datasetName?: string; caseNumber?: number }]; result: { status: string } };
    "datasetEditor:gotoVariable": { input: [{ datasetName?: string; variableName?: string }]; result: { status: string } };
    "activeDataset:get": { input: []; result: string };
    "activeDataset:set": { input: [{ name?: string }]; result: string };
    "activeDataset:clear": { input: []; result: string };
    "datasetEditor:getActiveState": { input: []; result: { datasetName: string } };
    "datasetEditor:consumeGoToContext": { input: []; result: { datasetName: string; mode: string } };
    "datasetViewer:getSchema": { input: [{ name: string }]; result: DatasetViewerSchema | null };
    "datasetViewer:getContent": { input: [{ name: string } & DatasetViewerContentRequest]; result: DatasetViewerContentPage | null };
    "datasetViewer:getFilterMask": { input: [{ name: string; rowStart: number; rowCount: number }]; result: DatasetViewerFilterMaskPage | null };
    "datasetViewer:getVariables": { input: [{ name: string }]; result: DatasetVariableMetadata[] | null };
    "datasetViewer:getVariablesBatch": { input: [{ name: string; start: number; count: number }]; result: DatasetVariableMetadataBatch | null };
    "datasetViewer:updateCell": { input: [{ name: string } & DatasetCellUpdatePatch]; result: DatasetViewerCell | null };
    "datasetViewer:updateColumnName": { input: [{ name: string; column: string; nextName: string }]; result: { column: string; name: string } | null };
    "datasetViewer:updateRowName": { input: [{ name: string; row: number; nextName: string }]; result: { row: number; name: string } | null };
    "datasetViewer:insertRow": { input: [{ name: string; row: number; nextName: string; position: "before" | "after" }]; result: { name: string; row: number; nextName: string; position: "before" | "after"; rowCount: number } | null };
    "datasetViewer:removeRow": { input: [{ name: string; row: number }]; result: { name: string; row: number; rowCount: number } | null };
    "datasetViewer:insertColumn": { input: [{ name: string; column: string; nextName: string; position: "before" | "after" }]; result: { name: string; column: string; nextName: string; columnIndex: number; columnCount: number; position: "before" | "after" } | null };
    "datasetViewer:removeColumn": { input: [{ name: string; column: string }]; result: { column: string; columnCount: number } | null };
    "datasetViewer:sortRows": { input: [{ name: string; column: string; decreasing: boolean; naLast: boolean; emptyLast: boolean }]; result: { name: string; column: string; decreasing: boolean; rowCount: number; command: string } | null };
    "datasetViewer:updateVariable": { input: [{ name: string; variableName: string } & DatasetVariableUpdatePatch]; result: DatasetVariableMetadata | null };
}


export const invokeDatasetEditorRoute = function<
    Channel extends keyof DatasetEditorIpcRoutes & string
>(
    transport: IpcInvokeTransport,
    channel: Channel,
    ...args: DatasetEditorIpcRoutes[Channel]["input"]
): Promise<DatasetEditorIpcRoutes[Channel]["result"]> {
    return invokeTypedIpcRoute<
        DatasetEditorIpcRoutes[Channel]["input"],
        DatasetEditorIpcRoutes[Channel]["result"]
    >(transport, channel, ...args);
};


export const sendDatasetEditorCommand = function<
    Channel extends keyof DatasetEditorCommands & string
>(
    transport: IpcSendTransport,
    channel: Channel,
    ...args: DatasetEditorCommands[Channel]
): void {
    sendTypedIpcCommand<DatasetEditorCommands[Channel]>(
        transport,
        channel,
        ...args
    );
};
