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
    createUnsupportedOperationResult
} from "../../core/contracts/operationResult";
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
    getWorkspaceReadEpoch?(): number;
    isWorkspaceReadAvailable?(): boolean;
    getActiveObjectName(): string;
    hasRuntimeCapability(capability: RuntimeCapability): boolean;
    readVariableMetadata(objectName: string): Promise<VariableMetadataSnapshot>;
}


export interface RuntimeLabelStateOperationController {
    readValueLabels(objectName: string): Promise<ValueLabelSnapshot>;
    writeValueLabels(
        request: ValueLabelUpdateRequest,
        beginMutation?: () => void
    ): Promise<ValueLabelUpdateResult>;
    readDeclaredMissing(objectName: string): Promise<DeclaredMissingSnapshot>;
    writeDeclaredMissing(
        request: DeclaredMissingUpdateRequest,
        beginMutation?: () => void
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

            const epoch = options.getWorkspaceReadEpoch?.();
            if (options.isWorkspaceReadAvailable?.() === false) {
                return createValueLabelSnapshot({
                    status: "unavailable", providerId: snapshot.providerId,
                    objectName: targetName, message: "Workspace synchronization is pending or stale."
                });
            }
            const labels = await options.labelStateExecutionController.readValueLabels(targetName);

            if (
                epoch !== options.getWorkspaceReadEpoch?.()
                || options.getSnapshot().status !== "ready"
                || options.isWorkspaceReadAvailable?.() === false
            ) {
                return createValueLabelSnapshot({
                    status: "unavailable", providerId: snapshot.providerId,
                    objectName: targetName, message: "Workspace changed while reading value labels. Retry the read."
                });
            }

            return labels;
        },
        writeValueLabels: async function(request, beginMutation): Promise<ValueLabelUpdateResult> {
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
                return createValueLabelUpdateResult(createUnsupportedOperationResult({
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    variableName: request.variableName,
                    labels: request.labels,
                    message: "Selected provider does not advertise value-label editing."
                }));
            }

            const epoch = options.getWorkspaceReadEpoch?.();
            const metadata = await options.readVariableMetadata(targetName);

            if (
                epoch !== options.getWorkspaceReadEpoch?.()
                || options.getSnapshot().status !== "ready"
                || options.isWorkspaceReadAvailable?.() === false
            ) {
                return createValueLabelUpdateResult({
                    status: "unavailable", providerId: snapshot.providerId,
                    objectName: targetName, variableName: request.variableName,
                    labels: request.labels,
                    message: "Workspace changed before value-label editing. Retry after synchronization."
                });
            }

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

            beginMutation?.();
            return options.labelStateExecutionController.writeValueLabels({
                ...request, objectName: targetName
            });
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

            const epoch = options.getWorkspaceReadEpoch?.();
            if (options.isWorkspaceReadAvailable?.() === false) {
                return createDeclaredMissingSnapshot({
                    status: "unavailable", providerId: snapshot.providerId,
                    objectName: targetName, message: "Workspace synchronization is pending or stale."
                });
            }
            const missing = await options.labelStateExecutionController.readDeclaredMissing(targetName);

            if (
                epoch !== options.getWorkspaceReadEpoch?.()
                || options.getSnapshot().status !== "ready"
                || options.isWorkspaceReadAvailable?.() === false
            ) {
                return createDeclaredMissingSnapshot({
                    status: "unavailable", providerId: snapshot.providerId,
                    objectName: targetName, message: "Workspace changed while reading declared missing values. Retry the read."
                });
            }

            return missing;
        },
        writeDeclaredMissing: async function(
            request,
            beginMutation
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
                return createDeclaredMissingUpdateResult(createUnsupportedOperationResult({
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    variableName: request.variableName,
                    values: request.values,
                    message: "Selected provider does not advertise declared-missing editing."
                }));
            }

            const epoch = options.getWorkspaceReadEpoch?.();
            const metadata = await options.readVariableMetadata(targetName);

            if (
                epoch !== options.getWorkspaceReadEpoch?.()
                || options.getSnapshot().status !== "ready"
                || options.isWorkspaceReadAvailable?.() === false
            ) {
                return createDeclaredMissingUpdateResult({
                    status: "unavailable", providerId: snapshot.providerId,
                    objectName: targetName, variableName: request.variableName,
                    values: request.values,
                    message: "Workspace changed before declared-missing editing. Retry after synchronization."
                });
            }

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

            beginMutation?.();
            return options.labelStateExecutionController.writeDeclaredMissing({
                ...request, objectName: targetName
            });
        }
    };
};
