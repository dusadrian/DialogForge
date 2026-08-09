import type {
    RuntimeSessionManager
} from "../provider-contract/runtimeProvider";
import {
    createRuntimeExtensionMethodRequest
} from "../extensions/runtimeExtensionProtocol";
import {
    createCellUpdateRequest,
    createColumnInsertRequest,
    createColumnRemoveRequest,
    createColumnRenameRequest,
    createDeclaredMissingUpdateRequest,
    createRowInsertRequest,
    createRowNameUpdateRequest,
    createRowRemoveRequest,
    createRowSortRequest,
    createValueLabelUpdateRequest,
    createVariableMetadataUpdateRequest
} from "./tabularProtocol";
import {
    createDatasetViewerCellUpdateBatchResult,
    createDatasetViewerCellUpdateResult,
    createDatasetViewerColumnInsertResult,
    createDatasetViewerColumnRemoveResult,
    createDatasetViewerColumnRenameResult,
    createDatasetViewerRowInsertResult,
    createDatasetViewerRowNameResult,
    createDatasetViewerRowRemoveResult,
    createDatasetViewerRowSortResult,
    normalizedDatasetViewerPosition,
    providerRowIndexFromDatasetViewerPayload,
    stringFromDatasetViewerPayload
} from "./datasetViewerMutationResults";
import {
    applyRuntimeDatasetVariablePatch
} from "./runtimeDatasetVariablePatch";
import {
    createDialogVariableValuesResult
} from "./dialogVariableValues";


export interface RuntimeSessionDatasetChannelAdapterOptions {
    runtimeSessionManager: RuntimeSessionManager;
    initialRows: number;
    initialColumns: number;
    variableOverscanRows: number;
    readVariableMetadataBatch?(
        objectName: string,
        start: number,
        count: number
    ): Promise<unknown>;
    patchVariableMetadata?(
        objectName: string,
        variableName: string,
        value: unknown
    ): void;
    invalidateDataset(
        datasetName: string,
        effect: {
            previewChanged: boolean;
            variableMetadataChanged: boolean;
            variableMetadataPatched: boolean;
        }
    ): Promise<void> | void;
}


const recordInput = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
};


const positiveInteger = function(value: unknown, fallback: number): number {
    const number = Number(value);

    return Number.isFinite(number) && number >= 1
        ? Math.floor(number)
        : fallback;
};


const toViewerSchema = function(schema: Awaited<
    ReturnType<RuntimeSessionManager["readTabularSchema"]>
>) {
    return schema.status === "ready"
        ? {
            name: schema.objectName,
            rowCount: schema.rowCount,
            columnCount: schema.columnCount,
            columns: schema.columns.map((column) => ({
                name: column.name,
                type: column.type || "unknown"
            }))
        }
        : null;
};


const toViewerContent = function(
    preview: Awaited<ReturnType<RuntimeSessionManager["readTabularPreview"]>>
) {
    if (preview.status !== "ready") {
        return null;
    }

    return {
        name: preview.objectName,
        rowStart: Number(preview.rowOffset || 0) + 1,
        rowCount: preview.rows.length,
        totalRowCount: Number(preview.totalRowCount || preview.rows.length),
        columnCount: preview.columns.length,
        totalColumnCount: Number(
            preview.totalColumnCount || preview.columns.length
        ),
        columns: preview.columns.map((column) => ({
            name: column.name,
            type: column.type || "unknown"
        })),
        rowNames: preview.rowNames || [],
        rows: preview.rows.map((row) => {
            return preview.columns.map((column) => {
                const value = row[column.name];

                if (value && typeof value === "object" && "display" in value) {
                    const cell = value as Record<string, unknown>;

                    return {
                        display: String(cell.display ?? ""),
                        raw: String(cell.raw ?? cell.display ?? ""),
                        declaredMissing: cell.declaredMissing === true
                    };
                }

                const text = value === null || value === undefined
                    ? ""
                    : String(value);

                return {
                    display: text,
                    raw: text
                };
            });
        })
    };
};


export const createRuntimeSessionDatasetChannelAdapter = function(
    options: RuntimeSessionDatasetChannelAdapterOptions
) {
    const runtime = options.runtimeSessionManager;
    const invalidate = async function(
        name: string,
        variableMetadataChanged = false,
        variableMetadataPatched = false
    ): Promise<void> {
        await options.invalidateDataset(name, {
            previewChanged: true,
            variableMetadataChanged,
            variableMetadataPatched
        });
    };
    const executeDatasetMethod = async function(
        method: string,
        params: Record<string, unknown>
    ) {
        return runtime.executeRuntimeMethod(
            createRuntimeExtensionMethodRequest({
                method,
                params,
                source: "base-app.dataset-editor"
            })
        );
    };

    return {
        async readSchema(value: unknown) {
            const name = String(value || "").trim();

            return name
                ? toViewerSchema(await runtime.readTabularSchema(name))
                : null;
        },

        async readContent(value: unknown) {
            const input = recordInput(value);
            const objectName = String(input.name || "").trim();

            if (!objectName) {
                return null;
            }

            return toViewerContent(await runtime.readTabularPreview({
                objectName,
                rowStart: positiveInteger(input.rowStart, 1),
                rowCount: positiveInteger(input.rowCount, options.initialRows),
                columns: Array.isArray(input.columns)
                    ? input.columns.map(String)
                    : [],
                columnCount: positiveInteger(
                    input.columnCount,
                    options.initialColumns
                )
            }));
        },

        readFilterMask(value: unknown) {
            const input = recordInput(value);
            const rowCount = positiveInteger(
                input.rowCount,
                options.initialRows
            );

            return {
                name: String(input.name || ""),
                rowStart: positiveInteger(input.rowStart, 1),
                rowCount,
                filteredOut: Array.from({ length: rowCount }, () => false)
            };
        },

        async readVariables(value: unknown) {
            const input = recordInput(value);
            const name = String(input.name || "").trim();
            const snapshot = await runtime.readVariableMetadata(name);

            return snapshot.status === "ready" ? snapshot.variables : null;
        },

        readVariableMetadata(value: unknown) {
            return runtime.readVariableMetadata(String(value || "").trim());
        },

        async writeVariableMetadata(value: unknown) {
            const result = await runtime.writeVariableMetadata(
                createVariableMetadataUpdateRequest(recordInput(value))
            );

            if (result.status === "updated") {
                await invalidate(result.objectName, true);
            }

            return result;
        },

        readValueLabels(value: unknown) {
            return runtime.readValueLabels(String(value || "").trim());
        },

        async writeValueLabels(value: unknown) {
            const result = await runtime.writeValueLabels(
                createValueLabelUpdateRequest(recordInput(value))
            );

            if (result.status === "updated") {
                await invalidate(result.objectName, true);
            }

            return result;
        },

        readDeclaredMissing(value: unknown) {
            return runtime.readDeclaredMissing(String(value || "").trim());
        },

        async writeDeclaredMissing(value: unknown) {
            const result = await runtime.writeDeclaredMissing(
                createDeclaredMissingUpdateRequest(recordInput(value))
            );

            if (result.status === "updated") {
                await invalidate(result.objectName, true);
            }

            return result;
        },

        async readVariableBatch(value: unknown) {
            const input = recordInput(value);
            const name = String(input.name || "").trim();
            const start = positiveInteger(input.start, 1);
            const count = positiveInteger(
                input.count,
                options.variableOverscanRows
            );

            if (options.readVariableMetadataBatch) {
                return options.readVariableMetadataBatch(name, start, count);
            }

            const result = await executeDatasetMethod(
                "workspace.dataset_variables_batch",
                { name, start, count }
            );

            if (result.status === "ready" && result.value) {
                return result.value;
            }

            const snapshot = await runtime.readVariableMetadata(name);
            const variables = snapshot.status === "ready"
                ? snapshot.variables
                : [];
            const items = variables.slice(start - 1, start - 1 + count);

            return {
                name,
                total: variables.length,
                start,
                count: items.length,
                items
            };
        },

        async updateCell(value: unknown) {
            const input = recordInput(value);
            const result = await runtime.writeCell(createCellUpdateRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                rowIndex: providerRowIndexFromDatasetViewerPayload(input.row),
                columnName: stringFromDatasetViewerPayload(input.column),
                value: input.value,
                uiCommandVisibility: "hidden"
            }));

            if (result.status === "updated") {
                await invalidate(result.objectName);
            }

            return createDatasetViewerCellUpdateResult(result);
        },

        async updateColumnName(value: unknown) {
            const input = recordInput(value);
            const result = await runtime.renameColumn(createColumnRenameRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                fromName: stringFromDatasetViewerPayload(input.column),
                toName: stringFromDatasetViewerPayload(input.nextName),
                uiCommandVisibility: "hidden"
            }));

            if (result.status === "updated") {
                await invalidate(result.objectName, true);
            }

            return createDatasetViewerColumnRenameResult(result);
        },

        async updateRowName(value: unknown) {
            const input = recordInput(value);
            const result = await runtime.updateRowName(createRowNameUpdateRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                rowIndex: providerRowIndexFromDatasetViewerPayload(input.row),
                name: stringFromDatasetViewerPayload(input.nextName),
                uiCommandVisibility: "hidden"
            }));

            if (result.status === "updated") {
                await invalidate(result.objectName);
            }

            return createDatasetViewerRowNameResult(result);
        },

        async insertRow(value: unknown) {
            const input = recordInput(value);
            const position = normalizedDatasetViewerPosition(input.position);
            const result = await runtime.insertRow(createRowInsertRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                rowIndex: providerRowIndexFromDatasetViewerPayload(input.row),
                name: stringFromDatasetViewerPayload(input.nextName),
                position,
                uiCommandVisibility: "hidden"
            }));

            if (result.status === "updated") {
                await invalidate(result.objectName);
            }

            return createDatasetViewerRowInsertResult(result, {
                name: input.nextName,
                position
            });
        },

        async removeRow(value: unknown) {
            const input = recordInput(value);
            const result = await runtime.removeRow(createRowRemoveRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                rowIndex: providerRowIndexFromDatasetViewerPayload(input.row),
                uiCommandVisibility: "hidden"
            }));

            if (result.status === "updated") {
                await invalidate(result.objectName);
            }

            return createDatasetViewerRowRemoveResult(result);
        },

        async insertColumn(value: unknown) {
            const input = recordInput(value);
            const position = normalizedDatasetViewerPosition(input.position);
            const result = await runtime.insertColumn(createColumnInsertRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                referenceName: stringFromDatasetViewerPayload(input.column),
                newName: stringFromDatasetViewerPayload(input.nextName),
                position,
                uiCommandVisibility: "hidden"
            }));

            if (result.status === "updated") {
                await invalidate(result.objectName, true);
            }

            return createDatasetViewerColumnInsertResult(result, {
                column: input.column,
                position
            });
        },

        async removeColumn(value: unknown) {
            const input = recordInput(value);
            const result = await runtime.removeColumn(createColumnRemoveRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                columnName: stringFromDatasetViewerPayload(input.column),
                uiCommandVisibility: "hidden"
            }));

            if (result.status === "updated") {
                await invalidate(result.objectName, true);
            }

            return createDatasetViewerColumnRemoveResult(result);
        },

        async sortRows(value: unknown) {
            const input = recordInput(value);
            const result = await runtime.sortRows(createRowSortRequest({
                objectName: stringFromDatasetViewerPayload(input.name),
                columnName: stringFromDatasetViewerPayload(input.column),
                direction: input.decreasing === true
                    ? "descending"
                    : "ascending",
                uiCommandVisibility: "hidden"
            }));

            if (result.status === "updated") {
                await invalidate(result.objectName);
            }

            return createDatasetViewerRowSortResult(result);
        },

        async writeCells(value: unknown) {
            const inputs = Array.isArray(value)
                ? value.map(recordInput)
                : [];
            const requests = inputs.map((input) => {
                return createCellUpdateRequest({
                    objectName: stringFromDatasetViewerPayload(
                        input.objectName || input.name
                    ),
                    rowIndex: providerRowIndexFromDatasetViewerPayload(
                        input.rowIndex ?? input.row
                    ),
                    columnName: stringFromDatasetViewerPayload(
                        input.columnName || input.column
                    ),
                    value: input.value,
                    uiCommandVisibility: "hidden"
                });
            });
            const result = await runtime.writeCells(requests);

            if (result.updated > 0) {
                const names = new Set(requests.map((request) => {
                    return request.objectName;
                }).filter(Boolean));

                for (const name of names) {
                    await invalidate(name);
                }
            }

            return createDatasetViewerCellUpdateBatchResult(result);
        },

        async updateVariable(value: unknown) {
            const result = await applyRuntimeDatasetVariablePatch(
                runtime,
                value
            );

            if (!result) {
                return null;
            }

            options.patchVariableMetadata?.(
                result.objectName,
                result.variableName,
                result.value
            );
            await invalidate(
                result.objectName,
                true,
                Boolean(options.patchVariableMetadata)
            );

            return result.value;
        },

        async readDialogVariableValues(value: unknown) {
            const input = recordInput(value);
            const name = String(input.name || "").trim();
            const variableName = String(input.variableName || "").trim();

            if (!name || !variableName) {
                return createDialogVariableValuesResult(null, {
                    name,
                    variableName
                });
            }

            const result = await executeDatasetMethod(
                "workspace.dataset_values",
                {
                    name,
                    variableName
                }
            );

            return createDialogVariableValuesResult(
                result.status === "ready" ? result.value : null,
                {
                    name,
                    variableName,
                    error: result.status === "ready"
                        ? ""
                        : result.message || "Unable to read variable values."
                }
            );
        }
    };
};
