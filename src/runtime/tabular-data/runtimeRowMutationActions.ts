import type { RuntimeSessionManager } from "../provider-contract/runtimeProvider";
import { captureWorkspaceRuntimeScope } from "../workspace/workspaceSnapshotDelivery";
import {
    createRowInsertRequest,
    createRowNameUpdateRequest,
    createRowRemoveRequest,
    createRowSortRequest
} from "./tabularProtocol";


type RowMutationResult = Awaited<ReturnType<RuntimeSessionManager[
    "updateRowName" | "insertRow" | "removeRow" | "sortRows"
]>>;


const rowMutationInput = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


export const createRuntimeRowMutationActions = function(options: {
    runtimeSessionManager: Pick<RuntimeSessionManager,
        "updateRowName" | "insertRow" | "removeRow" | "sortRows" | "getSnapshot" | "getWorkspaceSnapshot">;
    isCurrentRuntime?(): boolean;
    updated(result: RowMutationResult, changes: Array<Record<string, unknown>>): Promise<void> | void;
}) {
    return {
        async updateRowName(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const request = createRowNameUpdateRequest(rowMutationInput(value));
            const result = await options.runtimeSessionManager.updateRowName(request);

            if (isCurrent() && result.status === "updated") {
                await options.updated(result, [{ kind: "dataset_rows_changed" }]);
            }

            return result;
        },

        async insertRow(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const request = createRowInsertRequest(rowMutationInput(value));
            const result = await options.runtimeSessionManager.insertRow(request);

            if (isCurrent() && result.status === "updated") {
                await options.updated(result, [{ kind: "dataset_rows_changed", schemaChanged: true }]);
            }

            return result;
        },

        async removeRow(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const request = createRowRemoveRequest(rowMutationInput(value));
            const result = await options.runtimeSessionManager.removeRow(request);

            if (isCurrent() && result.status === "updated") {
                await options.updated(result, [{ kind: "dataset_rows_changed", schemaChanged: true }]);
            }

            return result;
        },

        async sortRows(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const request = createRowSortRequest(rowMutationInput(value));
            const result = await options.runtimeSessionManager.sortRows(request);

            if (isCurrent() && result.status === "updated") {
                await options.updated(result, [{ kind: "dataset_rows_changed" }]);
            }

            return result;
        }
    };
};
