import type {
    RuntimeCapability,
    RuntimeSessionSnapshot,
    VariableMetadataFieldKey,
    VariableMetadataSnapshot,
    VariableMetadataUpdateRequest,
    VariableMetadataUpdateResult
} from "../provider-contract/runtimeProvider";
import {
    createVariableMetadataSnapshot,
    createVariableMetadataUpdateResult
} from "./tabularProtocol";
import type {
    RuntimeVariableMetadataExecutionController
} from "./runtimeVariableMetadataExecutionController";


export interface RuntimeVariableMetadataOperationControllerOptions {
    variableMetadataExecutionController: RuntimeVariableMetadataExecutionController;
    getSnapshot(): RuntimeSessionSnapshot;
    getActiveObjectName(): string;
    hasRuntimeCapability(capability: RuntimeCapability): boolean;
    readVariableMetadataValue(
        objectName: string,
        variableName: string,
        metadataKey: VariableMetadataFieldKey,
        fallback: string
    ): string;
}


export interface RuntimeVariableMetadataOperationController {
    readVariableMetadata(objectName: string): Promise<VariableMetadataSnapshot>;
    writeVariableMetadata(
        request: VariableMetadataUpdateRequest
    ): Promise<VariableMetadataUpdateResult>;
}


export const createRuntimeVariableMetadataOperationController = function(
    options: RuntimeVariableMetadataOperationControllerOptions
): RuntimeVariableMetadataOperationController {
    return {
        readVariableMetadata: async function(objectName): Promise<VariableMetadataSnapshot> {
            const snapshot = options.getSnapshot();
            const targetName = objectName || options.getActiveObjectName();

            if (snapshot.status !== "ready") {
                return createVariableMetadataSnapshot({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("tabular.variableMetadata")) {
                return createVariableMetadataSnapshot({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    message: "Selected provider does not advertise variable metadata support."
                });
            }

            return options.variableMetadataExecutionController.readVariableMetadata(targetName);
        },
        writeVariableMetadata: async function(
            request
        ): Promise<VariableMetadataUpdateResult> {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();
            const metadataKey = request.metadataKey || "label";
            const value = request.value !== undefined
                ? String(request.value)
                : String(request.label || "");
            const label = metadataKey === "label"
                ? value
                : options.readVariableMetadataValue(
                    targetName,
                    request.variableName,
                    "label",
                    request.label || ""
                );

            if (snapshot.status !== "ready") {
                return createVariableMetadataUpdateResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    variableName: request.variableName,
                    metadataKey,
                    value,
                    label,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("tabular.variableMetadata.write")) {
                return createVariableMetadataUpdateResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    variableName: request.variableName,
                    metadataKey,
                    value,
                    label,
                    message: "Selected provider does not advertise variable metadata editing."
                });
            }

            return options.variableMetadataExecutionController.writeVariableMetadata(
                request,
                {
                    targetName,
                    metadataKey,
                    value,
                    label
                }
            );
        }
    };
};
