import {
    createDeclaredMissingSet,
    createDeclaredMissingSnapshot,
    createDeclaredMissingUpdateResult,
    createValueLabelSet,
    createValueLabelSnapshot,
    createValueLabelUpdateResult,
    createVariableMetadata,
    createVariableMetadataSnapshot,
    createVariableMetadataUpdateResult
} from "../../../tabular-data/tabularProtocol";
import type {
    DeclaredMissingSnapshot,
    DeclaredMissingUpdateRequest,
    DeclaredMissingUpdateResult,
    RuntimeSessionSnapshot,
    RuntimeTabularController,
    TranscriptEvent,
    ValueLabelSnapshot,
    ValueLabelUpdateRequest,
    ValueLabelUpdateResult,
    VariableMetadataSnapshot,
    VariableMetadataUpdateRequest,
    VariableMetadataUpdateResult
} from "../../../provider-contract/runtimeProvider";
import {
    createVisibleDeclaredMissingUpdateCommand,
    createVisibleValueLabelUpdateCommand,
    createVisibleVariableMetadataUpdateCommand
} from "../commands/datasetVisibleCommands";
import {
    asRuntimeControlArray,
    asRuntimeControlObject,
    parseRuntimeControlResultObject
} from "../protocol/runtimeControlEvents";
import { createRuntimeControlClient } from "../protocol/runtimeControlClient";
import { optionalRuntimeNumber } from "../tabular/runtimeTabularValues";


type MetadataTabularController = Pick<
    RuntimeTabularController,
    | "readVariableMetadata"
    | "readValueLabels"
    | "readDeclaredMissing"
    | "writeVariableMetadata"
    | "writeValueLabels"
    | "writeDeclaredMissing"
>;


export interface RTabularMetadataControllerOptions {
    getClient(): ReturnType<typeof createRuntimeControlClient> | null;
    createRequestId(prefix: string): string;
    executeVisibleCommand(
        commandText: string,
        source: string,
        snapshot: RuntimeSessionSnapshot
    ): Promise<TranscriptEvent[]>;
    transcriptHasFailure(transcriptEvents: TranscriptEvent[]): boolean;
}


const variableCategories = function(variable: Record<string, unknown>) {
    return asRuntimeControlArray(variable.categories).map((category) => {
        return asRuntimeControlObject(category);
    });
};


export const createRTabularMetadataController = function(
    options: RTabularMetadataControllerOptions
): MetadataTabularController {
    const readVariableEntries = async function(
        objectName: string
    ): Promise<Record<string, unknown>[] | null> {
        const client = options.getClient();

        if (!client) {
            return null;
        }

        const result = await client.execute({
            id: options.createRequestId("dataset-variables"),
            method: "workspace.dataset_variables",
            params: {
                name: objectName,
                timeoutMs: 5000
            }
        });

        if (!result.ok) {
            return null;
        }

        const payload = typeof result.result === "string"
            ? parseRuntimeControlResultObject(
                `{"items":${result.result}}`
            ).items
            : result.result;

        return asRuntimeControlArray(payload).map((entry) => {
            return asRuntimeControlObject(entry);
        });
    };

    const executeSilentCommand = async function(commandText: string) {
        const client = options.getClient();

        if (!client) {
            return {
                ok: false,
                error: "R runtime-control session is not attached."
            };
        }

        return client.execute({
            id: options.createRequestId("silent-command"),
            method: "evaluate_code",
            params: {
                code: commandText,
                mode: "silent",
                timeoutMs: 10000
            }
        });
    };

    const readVariableMetadata = async function(
        objectName: string,
        snapshot: RuntimeSessionSnapshot
    ): Promise<VariableMetadataSnapshot | null> {
        const entries = await readVariableEntries(objectName);

        if (!entries) {
            return null;
        }

        const variables = entries.map((variable) => {
            const missingRange = variable.missingRange
                && typeof variable.missingRange === "object"
                ? asRuntimeControlObject(variable.missingRange)
                : null;

            return createVariableMetadata({
                name: String(variable.name || ""),
                type: String(variable.type || "unknown"),
                role: "data",
                label: String(variable.label || ""),
                width: optionalRuntimeNumber(variable.width),
                decimals: optionalRuntimeNumber(variable.decimals),
                values: String(variable.values || ""),
                categories: variableCategories(variable).map((category) => ({
                    value: category.value,
                    label: String(category.label || ""),
                    isMissing: category.isMissing === true
                })),
                missingRange: missingRange
                    ? {
                        min: String(missingRange.min || ""),
                        max: String(missingRange.max || "")
                    }
                    : null,
                align: String(variable.align || ""),
                measure: String(variable.measure || ""),
                numeric: variable.numeric === true,
                factor: variable.factor === true,
                calibrated: variable.calibrated === true,
                binary: variable.binary === true,
                character: variable.character === true,
                categorical: variable.categorical === true,
                date: variable.date === true
            });
        }).filter((variable) => variable.name.length > 0);

        return createVariableMetadataSnapshot({
            status: "ready",
            providerId: snapshot.providerId,
            objectName,
            variables,
            message: "R runtime-control returned variable metadata."
        });
    };

    const readValueLabels = async function(
        objectName: string,
        snapshot: RuntimeSessionSnapshot
    ): Promise<ValueLabelSnapshot | null> {
        const entries = await readVariableEntries(objectName);

        if (!entries) {
            return null;
        }

        const valueLabels = entries.map((variable) => {
            const labels = variableCategories(variable)
                .filter((entry) => entry.isMissing !== true)
                .map((entry) => ({
                    value: entry.value,
                    label: String(entry.label || "")
                }));

            return createValueLabelSet({
                variable: String(variable.name || ""),
                labels
            });
        }).filter((set) => {
            return set.variable.length > 0 && set.labels.length > 0;
        });

        return createValueLabelSnapshot({
            status: "ready",
            providerId: snapshot.providerId,
            objectName,
            valueLabels,
            message: "R runtime-control returned value labels."
        });
    };

    const readDeclaredMissing = async function(
        objectName: string,
        snapshot: RuntimeSessionSnapshot
    ): Promise<DeclaredMissingSnapshot | null> {
        const entries = await readVariableEntries(objectName);

        if (!entries) {
            return null;
        }

        const declaredMissing = entries.map((variable) => {
            const values = variableCategories(variable)
                .filter((entry) => entry.isMissing === true)
                .map((entry) => ({
                    value: entry.value,
                    label: String(entry.label || "")
                }));

            return createDeclaredMissingSet({
                variable: String(variable.name || ""),
                values
            });
        }).filter((set) => {
            return set.variable.length > 0 && set.values.length > 0;
        });

        return createDeclaredMissingSnapshot({
            status: declaredMissing.length > 0
                ? "ready"
                : "unsupported",
            providerId: snapshot.providerId,
            objectName,
            declaredMissing,
            message: declaredMissing.length > 0
                ? "R runtime-control returned declared-missing values."
                : "R runtime-control found no declared-missing values."
        });
    };

    const writeVariableMetadata = async function(
        request: VariableMetadataUpdateRequest,
        snapshot: RuntimeSessionSnapshot
    ): Promise<VariableMetadataUpdateResult> {
        const client = options.getClient();

        if (!client) {
            return createVariableMetadataUpdateResult({
                status: "unavailable",
                providerId: snapshot.providerId,
                objectName: request.objectName,
                variableName: request.variableName,
                metadataKey: request.metadataKey,
                value: request.value,
                label: request.label,
                message: "R runtime-control session is not attached."
            });
        }

        if (request.uiCommandVisibility === "visible") {
            const commandText = String(
                request.visibleCommandText || ""
            ).trim() || createVisibleVariableMetadataUpdateCommand(request);
            const transcriptEvents = await options.executeVisibleCommand(
                commandText,
                "ui.dataset.writeVariableMetadata",
                snapshot
            );
            const failed = options.transcriptHasFailure(transcriptEvents);

            return createVariableMetadataUpdateResult({
                status: failed ? "invalid-variable" : "updated",
                providerId: snapshot.providerId,
                objectName: request.objectName,
                variableName: request.variableName,
                metadataKey: request.metadataKey,
                value: request.value,
                label: request.label,
                transcriptEvents,
                message: failed
                    ? "R visible variable-metadata command failed."
                    : "R visible variable-metadata command updated metadata."
            });
        }

        const params: Record<string, unknown> = {
            name: request.objectName,
            variableName: request.variableName,
            timeoutMs: 5000
        };
        params[request.metadataKey] = request.value;

        const result = await client.execute({
            id: options.createRequestId("dataset-update-variable"),
            method: "workspace.dataset_update_variable",
            params
        });

        return createVariableMetadataUpdateResult({
            status: result.ok ? "updated" : "invalid-variable",
            providerId: snapshot.providerId,
            objectName: request.objectName,
            variableName: request.variableName,
            metadataKey: request.metadataKey,
            value: request.value,
            label: request.label,
            message: result.ok
                ? "R runtime-control updated variable metadata."
                : String(
                    result.error || "R variable metadata update failed."
                )
        });
    };

    const writeValueLabels = async function(
        request: ValueLabelUpdateRequest,
        snapshot: RuntimeSessionSnapshot
    ): Promise<ValueLabelUpdateResult> {
        const commandText = String(
            request.visibleCommandText || ""
        ).trim() || createVisibleValueLabelUpdateCommand(request);

        if (request.uiCommandVisibility === "visible") {
            const transcriptEvents = await options.executeVisibleCommand(
                commandText,
                "ui.dataset.writeValueLabels",
                snapshot
            );
            const failed = options.transcriptHasFailure(transcriptEvents);

            return createValueLabelUpdateResult({
                status: failed ? "invalid-variable" : "updated",
                providerId: snapshot.providerId,
                objectName: request.objectName,
                variableName: request.variableName,
                labels: request.labels,
                transcriptEvents,
                message: failed
                    ? "R visible value-label command failed."
                    : "R visible value-label command updated value labels."
            });
        }

        const result = await executeSilentCommand(commandText);

        return createValueLabelUpdateResult({
            status: result.ok ? "updated" : "invalid-variable",
            providerId: snapshot.providerId,
            objectName: request.objectName,
            variableName: request.variableName,
            labels: request.labels,
            message: result.ok
                ? "R runtime-control updated value labels."
                : String(result.error || "R value-label update failed.")
        });
    };

    const writeDeclaredMissing = async function(
        request: DeclaredMissingUpdateRequest,
        snapshot: RuntimeSessionSnapshot
    ): Promise<DeclaredMissingUpdateResult> {
        const commandText = String(
            request.visibleCommandText || ""
        ).trim() || createVisibleDeclaredMissingUpdateCommand(request);

        if (request.uiCommandVisibility === "visible") {
            const transcriptEvents = await options.executeVisibleCommand(
                commandText,
                "ui.dataset.writeDeclaredMissing",
                snapshot
            );
            const failed = options.transcriptHasFailure(transcriptEvents);

            return createDeclaredMissingUpdateResult({
                status: failed ? "invalid-variable" : "updated",
                providerId: snapshot.providerId,
                objectName: request.objectName,
                variableName: request.variableName,
                values: request.values,
                transcriptEvents,
                message: failed
                    ? "R visible declared-missing command failed."
                    : "R visible declared-missing command updated declared missing values."
            });
        }

        const result = await executeSilentCommand(commandText);

        return createDeclaredMissingUpdateResult({
            status: result.ok ? "updated" : "invalid-variable",
            providerId: snapshot.providerId,
            objectName: request.objectName,
            variableName: request.variableName,
            values: request.values,
            message: result.ok
                ? "R runtime-control updated declared-missing values."
                : String(
                    result.error || "R declared-missing update failed."
                )
        });
    };

    return {
        readVariableMetadata,
        readValueLabels,
        readDeclaredMissing,
        writeVariableMetadata,
        writeValueLabels,
        writeDeclaredMissing
    };
};
