import type {
    CellUpdateBatchResult,
    CellUpdateRequest,
    CellUpdateResult,
    RuntimeSessionManager
} from "../provider-contract/runtimeProvider";
import { createCellUpdateRequest } from "./tabularProtocol";
import { captureWorkspaceRuntimeScope } from "../workspace/workspaceSnapshotDelivery";


export const createRuntimeCellMutation = function(options: {
    runtimeSessionManager: Pick<RuntimeSessionManager,
        "writeCell" | "getSnapshot" | "getWorkspaceSnapshot">;
    isCurrentRuntime?(): boolean;
    completed?(result: CellUpdateResult): void;
    updated(result: CellUpdateResult): Promise<void> | void;
}) {
    return {
        async writeCell(value: unknown): Promise<CellUpdateResult> {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const input = value && typeof value === "object" && !Array.isArray(value)
                ? value as Partial<CellUpdateRequest>
                : {};
            const result = await options.runtimeSessionManager.writeCell(createCellUpdateRequest(input));

            if (!isCurrent()) {
                return result;
            }

            options.completed?.(result);
            if (isCurrent() && result.status === "updated") {
                await options.updated(result);
            }

            return result;
        }
    };
};


export const createRuntimeCellBatchMutation = function(options: {
    runtimeSessionManager: Pick<RuntimeSessionManager,
        "writeCells" | "getSnapshot" | "getWorkspaceSnapshot">;
    isCurrentRuntime?(): boolean;
    completed?(result: CellUpdateBatchResult): void;
    updated(
        result: CellUpdateBatchResult,
        objectNames: string[],
        isCurrent: () => boolean
    ): Promise<void> | void;
}) {
    return {
        async writeCells(value: unknown): Promise<CellUpdateBatchResult> {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const inputs = Array.isArray(value) ? value : [];
            const requests = inputs.map((input) => {
                const record = input && typeof input === "object"
                    ? input as Partial<CellUpdateRequest>
                    : {};
                return createCellUpdateRequest(record);
            });
            const result = await options.runtimeSessionManager.writeCells(requests);

            if (!isCurrent()) {
                return result;
            }

            options.completed?.(result);
            if (isCurrent() && result.updated > 0) {
                const objectNames = Array.from(new Set(result.results.filter((cell) => {
                    return cell.status === "updated";
                }).map((cell) => cell.objectName).filter(Boolean)));

                await options.updated(result, objectNames, isCurrent);
            }

            return result;
        }
    };
};
