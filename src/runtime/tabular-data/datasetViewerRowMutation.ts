import { captureWorkspaceRuntimeScope } from "../workspace/workspaceSnapshotDelivery";
import type {
    RowInsertResult,
    RowNameUpdateResult,
    RowRemoveResult,
    RowSortResult,
    RuntimeSessionManager,
    UiCommandVisibility
} from "../provider-contract/runtimeProvider";
import {
    createRowInsertRequest,
    createRowNameUpdateRequest,
    createRowRemoveRequest,
    createRowSortRequest
} from "./tabularProtocol";
import {
    createDatasetViewerRowInsertResult,
    createDatasetViewerRowNameResult,
    createDatasetViewerRowRemoveResult,
    createDatasetViewerRowSortResult,
    normalizedDatasetViewerPosition,
    providerRowIndexFromDatasetViewerPayload,
    stringFromDatasetViewerPayload
} from "./datasetViewerMutationResults";


const readRowMutationPayload = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
};


export const createDatasetViewerRowMutation = function(options: {
    runtimeSessionManager: Pick<RuntimeSessionManager,
        "updateRowName" | "insertRow" | "removeRow" | "sortRows" | "getSnapshot" | "getWorkspaceSnapshot">;
    isCurrentRuntime?(): boolean;
    uiCommandVisibility(): UiCommandVisibility;
    updated(
        result: RowNameUpdateResult | RowInsertResult | RowRemoveResult | RowSortResult,
        changes: Array<Record<string, unknown>>
    ): Promise<void> | void;
}) {
    const runtime = options.runtimeSessionManager;
    return {
        async updateRowName(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const input = readRowMutationPayload(value);
            const result = await runtime.updateRowName(createRowNameUpdateRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                rowIndex: providerRowIndexFromDatasetViewerPayload(input.row),
                name: stringFromDatasetViewerPayload(input.nextName),
                uiCommandVisibility: options.uiCommandVisibility()
            }));
            if (!isCurrent()) {
                return null;
            }
            if (result.status === "updated") {
                await options.updated(result, [{
                    name: result.objectName, kind: "dataset_rows_changed",
                    rows: [result.rowIndex + 1]
                }]);
            }
            return isCurrent() ? createDatasetViewerRowNameResult(result) : null;
        },

        async insertRow(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const input = readRowMutationPayload(value);
            const position = normalizedDatasetViewerPosition(input.position);
            const result = await runtime.insertRow(createRowInsertRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                rowIndex: providerRowIndexFromDatasetViewerPayload(input.row),
                name: stringFromDatasetViewerPayload(input.nextName), position,
                uiCommandVisibility: options.uiCommandVisibility()
            }));
            if (!isCurrent()) {
                return null;
            }
            if (result.status === "updated") {
                await options.updated(result, [{
                    name: result.objectName, kind: "dataset_rows_changed",
                    rows: [result.rowIndex + 1], rowCount: result.rowCount, schemaChanged: true
                }]);
            }
            return isCurrent() ? createDatasetViewerRowInsertResult(result, { name: input.nextName, position }) : null;
        },

        async removeRow(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const input = readRowMutationPayload(value);
            const result = await runtime.removeRow(createRowRemoveRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                rowIndex: providerRowIndexFromDatasetViewerPayload(input.row),
                uiCommandVisibility: options.uiCommandVisibility()
            }));
            if (!isCurrent()) {
                return null;
            }
            if (result.status === "updated") {
                await options.updated(result, [{
                    name: result.objectName, kind: "dataset_rows_changed",
                    rows: [result.rowIndex + 1], rowCount: result.rowCount, schemaChanged: true
                }]);
            }
            return isCurrent() ? createDatasetViewerRowRemoveResult(result) : null;
        },

        async sortRows(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const input = readRowMutationPayload(value);
            const result = await runtime.sortRows(createRowSortRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                columnName: stringFromDatasetViewerPayload(input.column),
                direction: input.decreasing === true ? "descending" : "ascending",
                naLast: input.naLast !== false,
                emptyLast: input.emptyLast !== false,
                uiCommandVisibility: options.uiCommandVisibility()
            }));
            if (!isCurrent()) {
                return null;
            }
            if (result.status === "updated") {
                await options.updated(result, [{
                    name: result.objectName, kind: "dataset_rows_changed", rowCount: result.rowCount
                }]);
            }
            return isCurrent() ? createDatasetViewerRowSortResult(result) : null;
        }
    };
};
