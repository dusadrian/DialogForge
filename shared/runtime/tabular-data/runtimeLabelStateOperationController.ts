import type {
    DeclaredMissingSnapshot,
    DeclaredMissingUpdateRequest,
    DeclaredMissingUpdateResult,
    RuntimeCapability,
    RuntimeSessionSnapshot,
    ValueLabelSnapshot,
    ValueLabelUpdateRequest,
    ValueLabelUpdateResult,
    VariableMetadataSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createDeclaredMissingSnapshot,
    createDeclaredMissingUpdateResult,
    createValueLabelSnapshot,
    createValueLabelUpdateResult
} from "./tabularProtocol";
import type {
    RuntimeLabelStateExecutionController
} from "./runtimeLabelStateExecutionController";


export interface RuntimeLabelStateOperationControllerOptions {
    labelStateExecutionController: RuntimeLabelStateExecutionController;
    getSnapshot(): RuntimeSessionSnapshot;
    getActiveObjectName(): string;
    hasRuntimeCapability(capability: RuntimeCapability): boolean;
    readVariableMetadata(objectName: string): Promise<VariableMetadataSnapshot>;
}


export interface RuntimeLabelStateOperationController {
    readValueLabels(objectName: string): Promise<ValueLabelSnapshot>;
    writeValueLabels(request: ValueLabelUpdateRequest): Promise<ValueLabelUpdateResult>;
    readDeclaredMissing(objectName: string): Promise<DeclaredMissingSnapshot>;
    writeDeclaredMissing(
        request: DeclaredMissingUpdateRequest
    ): Promise<DeclaredMissingUpdateResult>;
}


export const createRuntimeLabelStateOperationController = function(
    options: RuntimeLabelStateOperationControllerOptions
): RuntimeLabelStateOperationController {
    const hasVariable = function(
        metadata: VariableMetadataSnapshot,
        variableName: string
    ): boolean {
        return metadata.variables.some((variable) => {
            return variable.name === variableName;
        });
    };

    return {
        readValueLabels: async function(objectName): Promise<ValueLabelSnapshot> {
            const snapshot = options.getSnapshot();
            const targetName = objectName || options.getActiveObjectName();

            if (snapshot.status !== "ready") {
                return createValueLabelSnapshot({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    message: "Runtime session is not ready."
                });
            }

            return options.labelStateExecutionController.readValueLabels(targetName);
        },
        writeValueLabels: async function(request): Promise<ValueLabelUpdateResult> {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (snapshot.status !== "ready") {
                return createValueLabelUpdateResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    variableName: request.variableName,
                    labels: request.labels,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("tabular.valueLabels.write")) {
                return createValueLabelUpdateResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    variableName: request.variableName,
                    labels: request.labels,
                    message: "Selected provider does not advertise value-label editing."
                });
            }

            const metadata = await options.readVariableMetadata(targetName);

            if (metadata.status !== "ready") {
                return createValueLabelUpdateResult({
                    status: metadata.status,
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    variableName: request.variableName,
                    labels: request.labels,
                    message: metadata.message
                });
            }

            if (!hasVariable(metadata, request.variableName)) {
                return createValueLabelUpdateResult({
                    status: "invalid-variable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    variableName: request.variableName,
                    labels: request.labels,
                    message: "Variable is not available for value-label editing."
                });
            }

            return options.labelStateExecutionController.writeValueLabels(request);
        },
        readDeclaredMissing: async function(
            objectName
        ): Promise<DeclaredMissingSnapshot> {
            const snapshot = options.getSnapshot();
            const targetName = objectName || options.getActiveObjectName();

            if (snapshot.status !== "ready") {
                return createDeclaredMissingSnapshot({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    message: "Runtime session is not ready."
                });
            }

            return options.labelStateExecutionController.readDeclaredMissing(targetName);
        },
        writeDeclaredMissing: async function(
            request
        ): Promise<DeclaredMissingUpdateResult> {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (snapshot.status !== "ready") {
                return createDeclaredMissingUpdateResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    variableName: request.variableName,
                    values: request.values,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("tabular.declaredMissing.write")) {
                return createDeclaredMissingUpdateResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    variableName: request.variableName,
                    values: request.values,
                    message: "Selected provider does not advertise declared-missing editing."
                });
            }

            const metadata = await options.readVariableMetadata(targetName);

            if (metadata.status !== "ready") {
                return createDeclaredMissingUpdateResult({
                    status: metadata.status,
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    variableName: request.variableName,
                    values: request.values,
                    message: metadata.message
                });
            }

            if (!hasVariable(metadata, request.variableName)) {
                return createDeclaredMissingUpdateResult({
                    status: "invalid-variable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    variableName: request.variableName,
                    values: request.values,
                    message: "Variable is not available for declared-missing editing."
                });
            }

            return options.labelStateExecutionController.writeDeclaredMissing(request);
        }
    };
};
