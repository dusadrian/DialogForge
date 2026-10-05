import type { RuntimeSessionManager } from "../provider-contract/runtimeProvider";
import { captureWorkspaceRuntimeScope } from "../workspace/workspaceSnapshotDelivery";
import {
    createColumnInsertRequest,
    createColumnRemoveRequest,
    createColumnRenameRequest
} from "./tabularProtocol";


type ColumnMutationResult = Awaited<ReturnType<RuntimeSessionManager[
    "renameColumn" | "insertColumn" | "removeColumn"
]>>;


const columnMutationInput = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


export const createRuntimeColumnMutationActions = function(options: {
    runtimeSessionManager: Pick<RuntimeSessionManager,
        "renameColumn" | "insertColumn" | "removeColumn" | "getSnapshot" | "getWorkspaceSnapshot">;
    isCurrentRuntime?(): boolean;
    updated(result: ColumnMutationResult): Promise<void> | void;
}) {
    return {
        async renameColumn(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const request = createColumnRenameRequest(columnMutationInput(value));
            const result = await options.runtimeSessionManager.renameColumn(request);

            if (isCurrent() && result.status === "updated") {
                await options.updated(result);
            }

            return result;
        },

        async insertColumn(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const request = createColumnInsertRequest(columnMutationInput(value));
            const result = await options.runtimeSessionManager.insertColumn(request);

            if (isCurrent() && result.status === "updated") {
                await options.updated(result);
            }

            return result;
        },

        async removeColumn(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const request = createColumnRemoveRequest(columnMutationInput(value));
            const result = await options.runtimeSessionManager.removeColumn(request);

            if (isCurrent() && result.status === "updated") {
                await options.updated(result);
            }

            return result;
        }
    };
};
