import type { RuntimeSessionManager } from "../provider-contract/runtimeProvider";
import { captureWorkspaceRuntimeScope } from "../workspace/workspaceSnapshotDelivery";
import {
    createDeclaredMissingUpdateRequest,
    createValueLabelUpdateRequest,
    createVariableMetadataUpdateRequest
} from "./tabularProtocol";


type MetadataMutationResult = Awaited<ReturnType<RuntimeSessionManager[
    "writeVariableMetadata" | "writeValueLabels" | "writeDeclaredMissing"
]>>;


const metadataMutationInput = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


export const createRuntimeTabularMetadataMutation = function(options: {
    runtimeSessionManager: Pick<RuntimeSessionManager,
        "writeVariableMetadata" | "writeValueLabels" | "writeDeclaredMissing" | "getSnapshot" | "getWorkspaceSnapshot">;
    isCurrentRuntime?(): boolean;
    updated(result: MetadataMutationResult): Promise<void> | void;
}) {
    return {
        async writeVariableMetadata(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const request = createVariableMetadataUpdateRequest(metadataMutationInput(value));
            const result = await options.runtimeSessionManager.writeVariableMetadata(request);

            if (isCurrent() && result.status === "updated") {
                await options.updated(result);
            }

            return result;
        },

        async writeValueLabels(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const request = createValueLabelUpdateRequest(metadataMutationInput(value));
            const result = await options.runtimeSessionManager.writeValueLabels(request);

            if (isCurrent() && result.status === "updated") {
                await options.updated(result);
            }

            return result;
        },

        async writeDeclaredMissing(value: unknown) {
            const isCurrent = captureWorkspaceRuntimeScope(() => {
                return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
            });
            const request = createDeclaredMissingUpdateRequest(metadataMutationInput(value));
            const result = await options.runtimeSessionManager.writeDeclaredMissing(request);

            if (isCurrent() && result.status === "updated") {
                await options.updated(result);
            }

            return result;
        }
    };
};
