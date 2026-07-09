import type {
    RuntimeReadOnlyAdapter,
    VariableMetadataUpdateRequest,
    VariableMetadataUpdateResult,
    VariableMetadataFieldKey,
    VariableMetadataSnapshot
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeFallbackTabularRow,
    RuntimeFallbackTabularState
} from "../session/runtimeFallbackTabularState";
import {
    createVariableMetadata,
    createVariableMetadataUpdateResult,
    createVariableMetadataSnapshot
} from "./tabularProtocol";


type RuntimeVariableMetadata = VariableMetadataSnapshot["variables"][number];


export interface RuntimeFallbackVariableMetadataController {
    readValue(
        objectName: string,
        variableName: string,
        metadataKey: VariableMetadataFieldKey,
        fallback: string
    ): string;
    write(
        objectName: string,
        variableName: string,
        metadataKey: VariableMetadataFieldKey,
        value: string
    ): void;
    create(
        objectName: string,
        variableName: string,
        type: string,
        role: string,
        label: string
    ): RuntimeVariableMetadata;
    overlay(
        objectName: string,
        metadata: RuntimeVariableMetadata
    ): RuntimeVariableMetadata;
    readSnapshot(
        providerId: string,
        objectName: string,
        rows: RuntimeFallbackTabularRow[],
        createColumns: (rows: RuntimeFallbackTabularRow[]) => Array<{
            name: string;
            type: string;
        }>,
        readOnlyAdapter?: RuntimeReadOnlyAdapter
    ): VariableMetadataSnapshot;
    writeUpdate(
        providerId: string,
        objectName: string,
        request: VariableMetadataUpdateRequest,
        metadataKey: VariableMetadataFieldKey,
        value: string,
        label: string,
        recordRuntimeEvent: (
            type: string,
            objectName: string,
            detail: string,
            payload: Record<string, unknown>
        ) => void
    ): VariableMetadataUpdateResult;
}


export const createRuntimeFallbackVariableMetadataController = function(
    state: RuntimeFallbackTabularState
): RuntimeFallbackVariableMetadataController {
    const readValue = function(
        objectName: string,
        variableName: string,
        metadataKey: VariableMetadataFieldKey,
        fallback: string
    ): string {
        return state.readMetadata(
            objectName,
            variableName,
            metadataKey,
            fallback
        );
    };

    const readNumber = function(
        objectName: string,
        variableName: string,
        metadataKey: VariableMetadataFieldKey
    ): number | undefined {
        return state.readMetadataNumber(
            objectName,
            variableName,
            metadataKey
        );
    };

    const create = function(
        objectName: string,
        variableName: string,
        type: string,
        role: string,
        label: string
    ): RuntimeVariableMetadata {
        return createVariableMetadata({
            name: variableName,
            type: readValue(objectName, variableName, "type", type),
            role: readValue(objectName, variableName, "role", role),
            label: readValue(objectName, variableName, "label", label),
            width: readNumber(objectName, variableName, "width"),
            decimals: readNumber(objectName, variableName, "decimals"),
            values: readValue(objectName, variableName, "values", ""),
            align: readValue(objectName, variableName, "align", ""),
            measure: readValue(objectName, variableName, "measure", "")
        });
    };

    const overlay = function(
        objectName: string,
        metadata: RuntimeVariableMetadata
    ): RuntimeVariableMetadata {
        return createVariableMetadata({
            name: metadata.name,
            type: readValue(objectName, metadata.name, "type", metadata.type),
            role: readValue(objectName, metadata.name, "role", metadata.role),
            label: readValue(objectName, metadata.name, "label", metadata.label),
            width:
                readNumber(objectName, metadata.name, "width") ??
                metadata.width,
            decimals:
                readNumber(objectName, metadata.name, "decimals") ??
                metadata.decimals,
            values: readValue(
                objectName,
                metadata.name,
                "values",
                metadata.values || ""
            ),
            align: readValue(
                objectName,
                metadata.name,
                "align",
                metadata.align || ""
            ),
            measure: readValue(
                objectName,
                metadata.name,
                "measure",
                metadata.measure || ""
            )
        });
    };

    return {
        readValue,
        write: function(objectName, variableName, metadataKey, value): void {
            state.writeMetadata(
                objectName,
                variableName,
                metadataKey,
                value
            );
        },
        create,
        overlay,
        readSnapshot: function(providerId, objectName, rows, createColumns, readOnlyAdapter) {
            if (readOnlyAdapter?.readVariableMetadata) {
                const metadata = readOnlyAdapter.readVariableMetadata(
                    providerId,
                    objectName
                );

                if (metadata) {
                    return createVariableMetadataSnapshot({
                        status: metadata.status,
                        providerId: metadata.providerId,
                        objectName: metadata.objectName,
                        variables: metadata.variables.map((variable) => {
                            return overlay(objectName, variable);
                        }),
                        message: metadata.message
                    });
                }
            }

            if (objectName === "sample_frame") {
                return createVariableMetadataSnapshot({
                    status: "ready",
                    providerId,
                    objectName,
                    variables: [
                        create(objectName, "case", "string", "id", "Case identifier"),
                        create(objectName, "score", "number", "data", "Score")
                    ],
                    message: "Placeholder variable metadata; no language process was queried."
                });
            }

            if (objectName !== "sample_data") {
                return createVariableMetadataSnapshot({
                    status: "ready",
                    providerId,
                    objectName,
                    variables: createColumns(rows).map((column) => {
                        return create(objectName, column.name, column.type, "data", "");
                    }),
                    message: "Placeholder variable metadata; no language process was queried."
                });
            }

            return createVariableMetadataSnapshot({
                status: "ready",
                providerId,
                objectName,
                variables: [
                    create(objectName, "case", "character", "id", "Case identifier"),
                    create(objectName, "condition", "numeric", "condition", "Example condition"),
                    create(objectName, "outcome", "numeric", "outcome", "Example outcome")
                ],
                message: "Placeholder variable metadata; no language process was queried."
            });
        },
        writeUpdate: function(
            providerId,
            objectName,
            request,
            metadataKey,
            value,
            label,
            recordRuntimeEvent
        ): VariableMetadataUpdateResult {
            state.writeMetadata(
                objectName,
                request.variableName,
                metadataKey,
                value
            );
            recordRuntimeEvent(
                "tabular.variableMetadata.updated",
                objectName,
                "Placeholder variable metadata updated.",
                {
                    variableName: request.variableName,
                    metadataKey
                }
            );

            return createVariableMetadataUpdateResult({
                status: "updated",
                providerId,
                objectName,
                variableName: request.variableName,
                metadataKey,
                value,
                label,
                message: "Placeholder variable metadata updated in session memory."
            });
        }
    };
};
