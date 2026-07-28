import type {
    RuntimeSessionManager
} from "../provider-contract/runtimeProvider";
import {
    createRuntimeExtensionMethodRequest
} from "../extensions/runtimeExtensionProtocol";
import {
    collectDatasetViewerVariablePatchParams
} from "./datasetViewerMutationResults";
import type {
    DatasetVariableMetadata
} from "./datasetViewerTypes";


export interface RuntimeDatasetVariablePatchResult {
    objectName: string;
    variableName: string;
    value: DatasetVariableMetadata;
}


export const applyRuntimeDatasetVariablePatch = async function(
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        "executeRuntimeMethod"
    >,
    payload: unknown,
    source = "base-app.dataset-editor"
): Promise<RuntimeDatasetVariablePatchResult | null> {
    const input = payload && typeof payload === "object"
        ? payload as Record<string, unknown>
        : {};
    const objectName = String(input.name || "").trim();
    const variableName = String(input.variableName || "").trim();

    if (!objectName || !variableName) {
        return null;
    }

    const result = await runtimeSessionManager.executeRuntimeMethod(
        createRuntimeExtensionMethodRequest({
            method: "workspace.dataset_update_variable",
            params: collectDatasetViewerVariablePatchParams(input),
            source
        })
    );

    if (
        result.status !== "ready"
        || !result.value
        || typeof result.value !== "object"
    ) {
        throw new Error(
            result.message || "Dataset variable metadata update failed."
        );
    }

    return {
        objectName,
        variableName,
        value: result.value as DatasetVariableMetadata
    };
};
