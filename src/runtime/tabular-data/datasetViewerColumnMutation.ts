import { captureWorkspaceRuntimeScope } from "../workspace/workspaceSnapshotDelivery";
import type {
    ColumnRenameResult,
    ColumnInsertResult,
    ColumnRemoveResult,
    RuntimeSessionManager,
    UiCommandVisibility
} from "../provider-contract/runtimeProvider";
import {
    createColumnRenameRequest,
    createColumnInsertRequest,
    createColumnRemoveRequest
} from "./tabularProtocol";
import {
    createDatasetViewerColumnRenameResult,
    createDatasetViewerColumnInsertResult,
    createDatasetViewerColumnRemoveResult,
    normalizedDatasetViewerPosition,
    stringFromDatasetViewerPayload
} from "./datasetViewerMutationResults";


export const createDatasetViewerColumnMutation = function(options: {
    runtimeSessionManager: Pick<RuntimeSessionManager, "renameColumn" | "insertColumn" | "removeColumn" | "getSnapshot" | "getWorkspaceSnapshot">;
    isCurrentRuntime?(): boolean;
    uiCommandVisibility(): UiCommandVisibility;
    updated(
        result: ColumnRenameResult | ColumnInsertResult | ColumnRemoveResult,
        changes: Array<Record<string, unknown>>
    ): Promise<void> | void;
}) {
    return {
        async updateColumnName(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const input = value && typeof value === "object"
                ? value as Record<string, unknown> : {};
            const result = await options.runtimeSessionManager.renameColumn(createColumnRenameRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                fromName: stringFromDatasetViewerPayload(input.column),
                toName: stringFromDatasetViewerPayload(input.nextName),
                uiCommandVisibility: options.uiCommandVisibility()
            }));

            if (!isCurrent()) {
                return null;
            }
            if (result.status === "updated") {
                await options.updated(result, [{
                    name: result.objectName,
                    kind: "dataset_column_renamed",
                    columns: [result.fromName, result.toName]
                }]);
            }

            return isCurrent() ? createDatasetViewerColumnRenameResult(result) : null;
        },

        async insertColumn(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const input = value && typeof value === "object"
                ? value as Record<string, unknown> : {};
            const position = normalizedDatasetViewerPosition(input.position);
            const result = await options.runtimeSessionManager.insertColumn(createColumnInsertRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                referenceName: stringFromDatasetViewerPayload(input.column),
                newName: stringFromDatasetViewerPayload(input.nextName), position,
                uiCommandVisibility: options.uiCommandVisibility()
            }));

            if (!isCurrent()) {
                return null;
            }
            if (result.status === "updated") {
                await options.updated(result, [{
                    name: result.objectName, kind: "dataset_columns_changed",
                    columns: [result.columnName], columnIndex: result.columnIndex,
                    columnCount: result.columnCount, schemaChanged: true
                }]);
            }

            return isCurrent() ? createDatasetViewerColumnInsertResult(result, { column: input.column, position }) : null;
        },

        async removeColumn(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const input = value && typeof value === "object"
                ? value as Record<string, unknown> : {};
            const result = await options.runtimeSessionManager.removeColumn(createColumnRemoveRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                columnName: stringFromDatasetViewerPayload(input.column),
                uiCommandVisibility: options.uiCommandVisibility()
            }));

            if (!isCurrent()) {
                return null;
            }
            if (result.status === "updated") {
                await options.updated(result, [{
                    name: result.objectName, kind: "dataset_column_removed",
                    columns: [result.columnName], columnCount: result.columnCount
                }]);
            }

            return isCurrent() ? createDatasetViewerColumnRemoveResult(result) : null;
        }
    };
};
