import { captureWorkspaceRuntimeScope } from "../workspace/workspaceSnapshotDelivery";
import type {
    CellUpdateResult,
    RuntimeSessionManager,
    UiCommandVisibility
} from "../provider-contract/runtimeProvider";
import { createCellUpdateRequest } from "./tabularProtocol";
import {
    createDatasetViewerCellUpdateResult,
    providerRowIndexFromDatasetViewerPayload,
    stringFromDatasetViewerPayload
} from "./datasetViewerMutationResults";


export const createDatasetViewerCellMutation = function(options: {
    runtimeSessionManager: Pick<RuntimeSessionManager, "writeCell" | "getSnapshot" | "getWorkspaceSnapshot">;
    isCurrentRuntime?(): boolean;
    uiCommandVisibility(): UiCommandVisibility;
    updated(
        result: CellUpdateResult,
        changes: Array<Record<string, unknown>>
    ): Promise<void> | void;
}) {
    return {
        async updateCell(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const input = value && typeof value === "object"
                ? value as Record<string, unknown> : {};
            const result = await options.runtimeSessionManager.writeCell(createCellUpdateRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                rowIndex: providerRowIndexFromDatasetViewerPayload(input.row),
                columnName: stringFromDatasetViewerPayload(input.column),
                value: input.value,
                uiCommandVisibility: options.uiCommandVisibility()
            }));

            if (!isCurrent()) {
                return null;
            }
            if (result.status === "updated") {
                await options.updated(result, [{
                    name: result.objectName,
                    kind: "dataset_cells_changed",
                    rows: [result.rowIndex + 1],
                    columns: [result.columnName]
                }]);
            }

            return isCurrent() ? createDatasetViewerCellUpdateResult(result) : null;
        }
    };
};
