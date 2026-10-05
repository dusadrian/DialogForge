import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type {
    RuntimeSessionManager,
    UiCommandVisibility,
    WorkspaceSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import {
    datasetEditorIpcChannels
} from "../../dataset-editor/datasetEditorIpc";
import { createDatasetViewerVariableMutation } from "../../runtime/tabular-data/datasetViewerVariableMutation";
import { createDatasetViewerCellMutation } from "../../runtime/tabular-data/datasetViewerCellMutation";
import { createDatasetViewerColumnMutation } from "../../runtime/tabular-data/datasetViewerColumnMutation";
import { createDatasetViewerRowMutation } from "../../runtime/tabular-data/datasetViewerRowMutation";
import {
    createDatasetMutationCacheEffect,
    type DatasetMutationCacheEffect
} from "../../dataset-editor/datasetMutationCacheEffects";
import { deliverDatasetMutationEffects } from "../../dataset-editor/datasetMutationDelivery";
import { captureWorkspaceRuntimeScope } from "../../runtime/workspace/workspaceSnapshotDelivery";


export interface DatasetViewerMutationIpcControllerOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        | "writeCell"
        | "getSnapshot"
        | "getWorkspaceSnapshot"
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
    invalidateInitialDatasetPreview(objectName: string, effect: DatasetMutationCacheEffect): void;
    patchVariableMetadata(
        objectName: string,
        variableName: string,
        value: unknown
    ): void;
    sendDatasetEditorChanges(changes: Array<Record<string, unknown>>): void;
    sendWorkspaceSnapshot(
        snapshot: WorkspaceSnapshot,
        options: { warmActiveDataset: boolean; refreshProductDialogs: boolean }
    ): Promise<boolean>;
    broadcastRuntimeEvents(options?: { sendDatasetChanges?: boolean }): Promise<void>;
}


const notifyMutation = async function(
    options: DatasetViewerMutationIpcControllerOptions,
    objectName: string,
    changes: Array<Record<string, unknown>>,
    variableMetadataPatched = false
): Promise<void> {
    const effect = createDatasetMutationCacheEffect(changes, variableMetadataPatched);
    await deliverDatasetMutationEffects({
        isCurrent: captureWorkspaceRuntimeScope(() => options.runtimeSessionManager),
        objectNames: [objectName],
        updateCache: name => options.invalidateInitialDatasetPreview(
            name, effect
        ),
        publishChanges: () => options.sendDatasetEditorChanges(changes),
        publishWorkspace: () => {
            // Workspace deltas are not replayed through general event history.
            return options.sendWorkspaceSnapshot(
                options.runtimeSessionManager.getWorkspaceSnapshot(),
                {
                    warmActiveDataset: false,
                    refreshProductDialogs: effect.variableMetadataChanged
                }
            );
        },
        refreshConsumers: () => options.broadcastRuntimeEvents({ sendDatasetChanges: false })
    });
};


export const createDatasetViewerMutationIpcController = function(
    options: DatasetViewerMutationIpcControllerOptions
): void {
    const cells = createDatasetViewerCellMutation({
        runtimeSessionManager: options.runtimeSessionManager,
        uiCommandVisibility: options.uiCommandVisibility,
        updated: (result, changes) => notifyMutation(options, result.objectName, changes)
    });
    const columns = createDatasetViewerColumnMutation({
        runtimeSessionManager: options.runtimeSessionManager,
        uiCommandVisibility: options.uiCommandVisibility,
        updated: (result, changes) => notifyMutation(options, result.objectName, changes)
    });
    const rows = createDatasetViewerRowMutation({
        runtimeSessionManager: options.runtimeSessionManager,
        uiCommandVisibility: options.uiCommandVisibility,
        updated: (result, changes) => {
            return notifyMutation(options, result.objectName, changes);
        }
    });
    const variables = createDatasetViewerVariableMutation({
        runtimeSessionManager: options.runtimeSessionManager,
        patchVariableMetadata: options.patchVariableMetadata,
        updated: (result, changes, patched) => notifyMutation(options, result.objectName, changes, patched)
    });
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
            return cells.updateCell(payload);
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
            return columns.updateColumnName(payload);
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
            return rows.updateRowName(payload);
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
            return rows.insertRow(payload);
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
            return rows.removeRow(payload);
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
            return columns.insertColumn(payload);
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
            return columns.removeColumn(payload);
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
            return rows.sortRows(payload);
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
            return variables.updateVariable(payload);
        }
    );
};
