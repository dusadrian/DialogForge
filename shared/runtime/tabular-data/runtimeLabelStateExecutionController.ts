import type {
    DeclaredMissingSnapshot,
    DeclaredMissingUpdateRequest,
    DeclaredMissingUpdateResult,
    RuntimeReadOnlyAdapter,
    RuntimeSessionSnapshot,
    RuntimeTabularController,
    ValueLabelSnapshot,
    ValueLabelUpdateRequest,
    ValueLabelUpdateResult
} from "../provider-contract/runtimeProvider";
import {
    createDeclaredMissingSnapshot,
    createValueLabelSnapshot
} from "./tabularProtocol";
import type {
    RuntimeFallbackLabelStateController
} from "./runtimeFallbackLabelStateController";


export interface RuntimeLabelStateExecutionControllerOptions {
    providerId: string;
    providerTabularController?: RuntimeTabularController;
    readOnlyAdapter?: RuntimeReadOnlyAdapter;
    fallbackLabelStateController: RuntimeFallbackLabelStateController;
    getSnapshot(): RuntimeSessionSnapshot;
    getActiveObjectName(): string;
    materializeRows(objectName: string): boolean;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
}


export interface RuntimeLabelStateExecutionController {
    readValueLabels(objectName: string): Promise<ValueLabelSnapshot>;
    writeValueLabels(request: ValueLabelUpdateRequest): Promise<ValueLabelUpdateResult>;
    readDeclaredMissing(objectName: string): Promise<DeclaredMissingSnapshot>;
    writeDeclaredMissing(request: DeclaredMissingUpdateRequest): Promise<DeclaredMissingUpdateResult>;
}


export const createRuntimeLabelStateExecutionController = function(
    options: RuntimeLabelStateExecutionControllerOptions
): RuntimeLabelStateExecutionController {
    return {
        readValueLabels: async function(objectName) {
            const snapshot = options.getSnapshot();
            const targetName = objectName || options.getActiveObjectName();

            if (targetName && options.providerTabularController?.readValueLabels) {
                const valueLabels = await options.providerTabularController.readValueLabels(
                    targetName,
                    snapshot
                );

                if (valueLabels) {
                    return valueLabels;
                }
            }

            if (!targetName || !options.materializeRows(targetName)) {
                return createValueLabelSnapshot({
                    status: "not-tabular",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    message: "Object does not advertise value-label support."
                });
            }

            if (options.readOnlyAdapter?.readValueLabels) {
                const valueLabelSnapshot = options.readOnlyAdapter.readValueLabels(
                    options.providerId,
                    targetName
                );

                if (valueLabelSnapshot) {
                    return options.fallbackLabelStateController.overlayValueLabels(
                        targetName,
                        valueLabelSnapshot
                    );
                }
            }

            return options.fallbackLabelStateController.readValueLabels(
                snapshot.providerId,
                targetName
            );
        },
        writeValueLabels: async function(request) {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (targetName && options.providerTabularController?.writeValueLabels) {
                const result = await options.providerTabularController.writeValueLabels(
                    Object.assign({}, request, {
                        objectName: targetName
                    }),
                    snapshot
                );

                if (result.status === "updated") {
                    options.recordRuntimeEvent(
                        "tabular.valueLabels.updated",
                        targetName,
                        "Value labels updated through provider.",
                        {
                            variableName: request.variableName
                        }
                    );
                }

                return result;
            }

            return options.fallbackLabelStateController.writeValueLabels(
                snapshot.providerId,
                targetName,
                request
            );
        },
        readDeclaredMissing: async function(objectName) {
            const snapshot = options.getSnapshot();
            const targetName = objectName || options.getActiveObjectName();

            if (targetName && options.providerTabularController?.readDeclaredMissing) {
                const declaredMissing =
                    await options.providerTabularController.readDeclaredMissing(
                        targetName,
                        snapshot
                    );

                if (declaredMissing) {
                    return declaredMissing;
                }
            }

            if (!targetName || !options.materializeRows(targetName)) {
                return createDeclaredMissingSnapshot({
                    status: "not-tabular",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    message: "Object does not advertise declared-missing support."
                });
            }

            if (options.readOnlyAdapter?.readDeclaredMissing) {
                const declaredMissingSnapshot =
                    options.readOnlyAdapter.readDeclaredMissing(
                        options.providerId,
                        targetName
                    );

                if (declaredMissingSnapshot) {
                    return options.fallbackLabelStateController.overlayDeclaredMissing(
                        targetName,
                        declaredMissingSnapshot
                    );
                }
            }

            return options.fallbackLabelStateController.readDeclaredMissing(
                snapshot.providerId,
                targetName
            );
        },
        writeDeclaredMissing: async function(request) {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (targetName && options.providerTabularController?.writeDeclaredMissing) {
                const result = await options.providerTabularController.writeDeclaredMissing(
                    Object.assign({}, request, {
                        objectName: targetName
                    }),
                    snapshot
                );

                if (result.status === "updated") {
                    options.recordRuntimeEvent(
                        "tabular.declaredMissing.updated",
                        targetName,
                        "Declared-missing values updated through provider.",
                        {
                            variableName: request.variableName
                        }
                    );
                }

                return result;
            }

            return options.fallbackLabelStateController.writeDeclaredMissing(
                snapshot.providerId,
                targetName,
                request
            );
        }
    };
};
