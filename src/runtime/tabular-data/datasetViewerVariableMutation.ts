import { captureWorkspaceRuntimeScope } from "../workspace/workspaceSnapshotDelivery";
import type { RuntimeSessionManager } from "../provider-contract/runtimeProvider";
import {
    applyRuntimeDatasetVariablePatch,
    type RuntimeDatasetVariablePatchResult
} from "./runtimeDatasetVariablePatch";


export const createDatasetViewerVariableMutation = function(options: {
    runtimeSessionManager: Pick<RuntimeSessionManager, "executeRuntimeMethod" | "getSnapshot" | "getWorkspaceSnapshot">;
    isCurrentRuntime?(): boolean;
    patchVariableMetadata?(objectName: string, variableName: string, value: unknown): void;
    updated(
        result: RuntimeDatasetVariablePatchResult,
        changes: Array<Record<string, unknown>>,
        variableMetadataPatched: boolean
    ): Promise<void> | void;
}) {
    return {
        async updateVariable(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const result = await applyRuntimeDatasetVariablePatch(options.runtimeSessionManager, value);
            if (!result || !isCurrent()) {
                return null;
            }

            options.patchVariableMetadata?.(result.objectName, result.variableName, result.value);
            if (!isCurrent()) {
                return null;
            }
            await options.updated(result, [{
                name: result.objectName,
                kind: "dataset_variable_meta_changed",
                columns: [result.variableName]
            }], Boolean(options.patchVariableMetadata));

            return isCurrent() ? result.value : null;
        }
    };
};
