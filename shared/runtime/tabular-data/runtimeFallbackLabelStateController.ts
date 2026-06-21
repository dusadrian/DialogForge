import type {
    DeclaredMissingSnapshot,
    DeclaredMissingUpdateRequest,
    DeclaredMissingUpdateResult,
    ValueLabelSnapshot,
    ValueLabelUpdateRequest,
    ValueLabelUpdateResult
} from "../provider-contract/runtimeProvider";
import type { RuntimeFallbackTabularState } from "../session/runtimeFallbackTabularState";
import {
    createDeclaredMissingSet,
    createDeclaredMissingSnapshot,
    createDeclaredMissingUpdateResult,
    createValueLabelSet,
    createValueLabelSnapshot,
    createValueLabelUpdateResult
} from "./tabularProtocol";


export interface RuntimeFallbackLabelStateControllerOptions {
    state: RuntimeFallbackTabularState;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
}


export interface RuntimeFallbackLabelStateController {
    overlayValueLabels(objectName: string, snapshot: ValueLabelSnapshot): ValueLabelSnapshot;
    readValueLabels(providerId: string, objectName: string): ValueLabelSnapshot;
    writeValueLabels(
        providerId: string,
        objectName: string,
        request: ValueLabelUpdateRequest
    ): ValueLabelUpdateResult;
    overlayDeclaredMissing(
        objectName: string,
        snapshot: DeclaredMissingSnapshot
    ): DeclaredMissingSnapshot;
    readDeclaredMissing(providerId: string, objectName: string): DeclaredMissingSnapshot;
    writeDeclaredMissing(
        providerId: string,
        objectName: string,
        request: DeclaredMissingUpdateRequest
    ): DeclaredMissingUpdateResult;
}


export const createRuntimeFallbackLabelStateController = function(
    options: RuntimeFallbackLabelStateControllerOptions
): RuntimeFallbackLabelStateController {
    return {
        overlayValueLabels: function(objectName, snapshot) {
            return createValueLabelSnapshot({
                status: snapshot.status,
                providerId: snapshot.providerId,
                objectName: snapshot.objectName,
                valueLabels: snapshot.valueLabels.map((set) => {
                    return createValueLabelSet({
                        variable: set.variable,
                        labels: options.state.readValueLabels(
                            objectName,
                            set.variable,
                            set.labels
                        )
                    });
                }),
                message: snapshot.message
            });
        },
        readValueLabels: function(providerId, objectName) {
            if (objectName === "sample_frame") {
                return createValueLabelSnapshot({
                    status: "ready",
                    providerId,
                    objectName,
                    valueLabels: [
                        createValueLabelSet({
                            variable: "score",
                            labels: options.state.readValueLabels(objectName, "score", [
                                { value: 0, label: "Low" },
                                { value: 1, label: "High" }
                            ])
                        })
                    ],
                    message: "Placeholder value labels; no language process was queried."
                });
            }

            if (objectName !== "sample_data") {
                return createValueLabelSnapshot({
                    status: "ready",
                    providerId,
                    objectName,
                    valueLabels: [],
                    message: "No placeholder value labels are registered for this object."
                });
            }

            return createValueLabelSnapshot({
                status: "ready",
                providerId,
                objectName,
                valueLabels: [
                    createValueLabelSet({
                        variable: "condition",
                        labels: options.state.readValueLabels(objectName, "condition", [
                            { value: 0, label: "Absent" },
                            { value: 1, label: "Present" }
                        ])
                    }),
                    createValueLabelSet({
                        variable: "outcome",
                        labels: options.state.readValueLabels(objectName, "outcome", [
                            { value: 0, label: "No" },
                            { value: 1, label: "Yes" }
                        ])
                    })
                ],
                message: "Placeholder value labels; no language process was queried."
            });
        },
        writeValueLabels: function(providerId, objectName, request) {
            options.state.writeValueLabels(objectName, request.variableName, request.labels);
            options.recordRuntimeEvent(
                "tabular.valueLabels.updated",
                objectName,
                "Placeholder value labels updated.",
                { variableName: request.variableName }
            );

            return createValueLabelUpdateResult({
                status: "updated",
                providerId,
                objectName,
                variableName: request.variableName,
                labels: request.labels,
                message: "Placeholder value labels updated in session memory."
            });
        },
        overlayDeclaredMissing: function(objectName, snapshot) {
            return createDeclaredMissingSnapshot({
                status: snapshot.status,
                providerId: snapshot.providerId,
                objectName: snapshot.objectName,
                declaredMissing: snapshot.declaredMissing.map((set) => {
                    return createDeclaredMissingSet({
                        variable: set.variable,
                        values: options.state.readDeclaredMissing(
                            objectName,
                            set.variable,
                            set.values
                        )
                    });
                }),
                message: snapshot.message
            });
        },
        readDeclaredMissing: function(providerId, objectName) {
            if (objectName !== "sample_data") {
                return createDeclaredMissingSnapshot({
                    status: "unsupported",
                    providerId,
                    objectName,
                    message: "Selected provider does not advertise declared-missing values for this object."
                });
            }

            return createDeclaredMissingSnapshot({
                status: "ready",
                providerId,
                objectName,
                declaredMissing: [
                    createDeclaredMissingSet({
                        variable: "condition",
                        values: options.state.readDeclaredMissing(
                            objectName,
                            "condition",
                            [{ value: -9, label: "Not asked" }]
                        )
                    }),
                    createDeclaredMissingSet({
                        variable: "outcome",
                        values: options.state.readDeclaredMissing(
                            objectName,
                            "outcome",
                            [{ value: -8, label: "Unknown" }]
                        )
                    })
                ],
                message: "Placeholder declared-missing values; no language process was queried."
            });
        },
        writeDeclaredMissing: function(providerId, objectName, request) {
            options.state.writeDeclaredMissing(objectName, request.variableName, request.values);
            options.recordRuntimeEvent(
                "tabular.declaredMissing.updated",
                objectName,
                "Placeholder declared-missing values updated.",
                { variableName: request.variableName }
            );

            return createDeclaredMissingUpdateResult({
                status: "updated",
                providerId,
                objectName,
                variableName: request.variableName,
                values: request.values,
                message: "Placeholder declared-missing values updated in session memory."
            });
        }
    };
};
