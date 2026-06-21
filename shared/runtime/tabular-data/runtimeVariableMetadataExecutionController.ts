import type {
    RuntimeReadOnlyAdapter,
    RuntimeSessionSnapshot,
    RuntimeTabularController,
    VariableMetadataFieldKey,
    VariableMetadataSnapshot,
    VariableMetadataUpdateRequest,
    VariableMetadataUpdateResult
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeFallbackTabularRow
} from "../session/runtimeFallbackTabularState";
import {
    createVariableMetadataSnapshot,
    createVariableMetadataUpdateResult
} from "./tabularProtocol";
import type {
    RuntimeFallbackVariableMetadataController
} from "./runtimeFallbackVariableMetadataController";


export interface RuntimeVariableMetadataExecutionControllerOptions {
    providerTabularController?: RuntimeTabularController;
    readOnlyAdapter?: RuntimeReadOnlyAdapter;
    fallbackVariableMetadataController: RuntimeFallbackVariableMetadataController;
    getSnapshot(): RuntimeSessionSnapshot;
    getActiveObjectName(): string;
    materializeRows(objectName: string): boolean;
    getRows(objectName: string): RuntimeFallbackTabularRow[];
    createColumns(rows: RuntimeFallbackTabularRow[]): Array<{
        name: string;
        type: string;
    }>;
    readVariableMetadata(objectName: string): Promise<VariableMetadataSnapshot>;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
}


export interface NormalizedVariableMetadataUpdateRequest {
    targetName: string;
    metadataKey: VariableMetadataFieldKey;
    value: string;
    label: string;
}


export interface RuntimeVariableMetadataExecutionController {
    readVariableMetadata(objectName: string): Promise<VariableMetadataSnapshot>;
    writeVariableMetadata(
        request: VariableMetadataUpdateRequest,
        normalized: NormalizedVariableMetadataUpdateRequest
    ): Promise<VariableMetadataUpdateResult>;
}


export const createRuntimeVariableMetadataExecutionController = function(
    options: RuntimeVariableMetadataExecutionControllerOptions
): RuntimeVariableMetadataExecutionController {
    return {
        readVariableMetadata: async function(objectName) {
            const snapshot = options.getSnapshot();
            const targetName = objectName || options.getActiveObjectName();

            if (targetName && options.providerTabularController?.readVariableMetadata) {
                const metadata = await options.providerTabularController.readVariableMetadata(
                    targetName,
                    snapshot
                );

                if (metadata) {
                    return metadata;
                }
            }

            if (!targetName || !options.materializeRows(targetName)) {
                return createVariableMetadataSnapshot({
                    status: "not-tabular",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    message: "Object does not advertise variable metadata support."
                });
            }

            return options.fallbackVariableMetadataController.readSnapshot(
                snapshot.providerId,
                targetName,
                options.getRows(targetName),
                options.createColumns,
                options.readOnlyAdapter
            );
        },
        writeVariableMetadata: async function(request, normalized) {
            const snapshot = options.getSnapshot();
            const targetName = normalized.targetName;

            if (targetName && options.providerTabularController?.writeVariableMetadata) {
                return options.providerTabularController.writeVariableMetadata(
                    Object.assign({}, request, {
                        objectName: targetName,
                        metadataKey: normalized.metadataKey,
                        value: normalized.value,
                        label: normalized.label
                    }),
                    snapshot
                );
            }

            const metadata = await options.readVariableMetadata(targetName);

            if (metadata.status !== "ready") {
                return createVariableMetadataUpdateResult({
                    status: metadata.status,
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    variableName: request.variableName,
                    metadataKey: normalized.metadataKey,
                    value: normalized.value,
                    label: normalized.label,
                    message: metadata.message
                });
            }

            const found = metadata.variables.find((variable) => {
                return variable.name === request.variableName;
            });

            if (!found) {
                return createVariableMetadataUpdateResult({
                    status: "invalid-variable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    variableName: request.variableName,
                    metadataKey: normalized.metadataKey,
                    value: normalized.value,
                    label: normalized.label,
                    message: "Variable is not available for metadata editing."
                });
            }

            return options.fallbackVariableMetadataController.writeUpdate(
                snapshot.providerId,
                targetName,
                request,
                normalized.metadataKey,
                normalized.value,
                normalized.label,
                options.recordRuntimeEvent
            );
        }
    };
};
