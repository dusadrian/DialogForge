import {
    createDatasetViewerContentFromSnapshot,
    createDatasetViewerEmptyFilterMaskPage,
    createDatasetViewerSchemaFromSnapshot,
    createDatasetViewerVariableBatch,
    readDatasetViewerInput,
    readDatasetViewerPartList,
    readDatasetViewerPositiveInteger,
    readDatasetViewerStringList,
    type DatasetViewerSnapshot,
    type DatasetViewerVariableSnapshot
} from "../../tabular-data/datasetViewerSnapshotAdapter";
import type {
    DatasetVariableMetadata,
    DatasetViewerSchema
} from "../../tabular-data/datasetViewerTypes";
import {
    createDatasetViewerCellFallback,
    createDatasetViewerCellUpdateBatchResult,
    createDatasetViewerCellUpdateFailure,
    createDatasetViewerCellUpdateSuccess,
    createDatasetViewerColumnInsertResult,
    createDatasetViewerColumnRemoveResult,
    createDatasetViewerRowInsertResult,
    createDatasetViewerRowNameResult,
    createDatasetViewerRowRemoveResult,
    createDatasetViewerRowSortResult,
    createDatasetViewerUpdatedColumnInsertResult,
    createDatasetViewerUpdatedColumnRemoveResult,
    createDatasetViewerUpdatedRowInsertResult,
    createDatasetViewerUpdatedRowNameResult,
    createDatasetViewerUpdatedRowRemoveResult,
    createDatasetViewerUpdatedRowSortResult,
    normalizedDatasetViewerPosition
} from "../../tabular-data/datasetViewerMutationResults";
import {
    createRDatasetColumnInsertCommand,
    createRDatasetColumnRemoveCommand,
    createRDatasetRowInsertCommand,
    createRDatasetRowNameCommand,
    createRDatasetRowRemoveCommand,
    createRDatasetRowSortCommand,
    createRDatasetVariableValuesCommand
} from "../r/commands/datasetEditorMutationCommands";

const webRDatasetViewerProviderId = "webr";

interface WebRDatasetRuntime {
    evalRVoid(command: string): Promise<void>;
    evalRString(command: string): Promise<string>;
}

export interface WebRDatasetChannelAdapterBindings {
    initialRows: number;
    initialColumns: number;
    variableOverscanRows: number;
    ensureRuntime(): Promise<WebRDatasetRuntime>;
    readSnapshot(
        datasetName: string,
        rowStart: number,
        rowCount: number,
        columnStart: number,
        columnCount: number
    ): Promise<DatasetViewerSnapshot>;
    readVariableBatch(datasetName: string, start: number, count: number): Promise<DatasetViewerVariableSnapshot[]>;
    writeCellValue(datasetName: string, rowIndex: number, columnName: string, value: unknown): Promise<void>;
    writeVariableName(datasetName: string, columnIndex: number, value: unknown): Promise<void>;
    writeVariableAttribute(datasetName: string, columnIndex: number, attributeName: string, value: unknown): Promise<void>;
    writeValueLabels(datasetName: string, columnIndex: number, categories: unknown, missingRange: unknown): Promise<void>;
    invalidateDataset(datasetName: string): Promise<void>;
}

export interface WebRDatasetChannelAdapter {
    readSchema(name: unknown): Promise<unknown>;
    readContent(input: unknown): Promise<unknown>;
    readFilterMask(input: unknown): unknown;
    readVariables(input: unknown): Promise<unknown>;
    readVariableBatch(input: unknown): Promise<unknown>;
    updateCell(input: unknown): Promise<unknown>;
    updateColumnName(input: unknown): Promise<unknown>;
    updateRowName(input: unknown): Promise<unknown>;
    insertRow(input: unknown): Promise<unknown>;
    removeRow(input: unknown): Promise<unknown>;
    insertColumn(input: unknown): Promise<unknown>;
    removeColumn(input: unknown): Promise<unknown>;
    sortRows(input: unknown): Promise<unknown>;
    writeCells(input: unknown): Promise<unknown>;
    updateVariable(input: unknown): Promise<unknown>;
    readDialogVariableValues(input: unknown): Promise<string[]>;
}

export const createWebRDatasetChannelAdapter = function(
    bindings: WebRDatasetChannelAdapterBindings
): WebRDatasetChannelAdapter {
    const readSchema = async function(nameValue: unknown) {
        const name = String(nameValue || "").trim();
        const snapshot = await bindings.readSnapshot(name, 1, 1, 1, bindings.initialColumns);
        const variables = snapshot.columnCount > 0
            ? await bindings.readVariableBatch(name, 1, snapshot.columnCount)
            : [];

        return createDatasetViewerSchemaFromSnapshot(snapshot, variables);
    };

    const findColumnIndex = async function(datasetName: string, columnName: string): Promise<number> {
        const schema = await readSchema(datasetName) as DatasetViewerSchema;
        const index = schema.columns.findIndex((column) => {
            return column.name === columnName;
        });

        return index >= 0 ? index + 1 : 0;
    };

    return {
        readSchema,

        async readContent(value) {
            const input = readDatasetViewerInput(value);
            const name = String(input.name || "").trim();
            const rowStart = readDatasetViewerPositiveInteger(input.rowStart, 1);
            const rowCount = readDatasetViewerPositiveInteger(input.rowCount, bindings.initialRows);
            const schema = await readSchema(name) as DatasetViewerSchema;
            const requestedColumns = readDatasetViewerStringList(input.columns);
            const firstRequestedColumn = requestedColumns[0] || "";
            const columnStart = Math.max(
                1,
                firstRequestedColumn
                    ? schema.columns.findIndex((column) => column.name === firstRequestedColumn) + 1
                    : 1
            );
            const columnCount = readDatasetViewerPositiveInteger(
                input.columnCount,
                requestedColumns.length || bindings.initialColumns
            );
            const snapshot = await bindings.readSnapshot(
                name,
                rowStart,
                rowCount,
                columnStart,
                columnCount
            );

            return createDatasetViewerContentFromSnapshot({
                name,
                snapshot,
                schema
            });
        },

        readFilterMask(value) {
            return createDatasetViewerEmptyFilterMaskPage(
                value,
                bindings.initialRows
            );
        },

        async readVariables(value) {
            const input = readDatasetViewerInput(value);
            const name = String(input.name || "").trim();
            const schema = await readSchema(name) as { columnCount: number };

            return bindings.readVariableBatch(name, 1, schema.columnCount);
        },

        async readVariableBatch(value) {
            const input = readDatasetViewerInput(value);
            const name = String(input.name || "").trim();
            const schema = await readSchema(name) as { columnCount: number };
            const start = readDatasetViewerPositiveInteger(input.start, 1);
            const count = readDatasetViewerPositiveInteger(
                input.count,
                bindings.variableOverscanRows
            );
            const items = await bindings.readVariableBatch(
                name,
                start,
                count
            ) as DatasetVariableMetadata[];

            return createDatasetViewerVariableBatch({
                name,
                total: schema.columnCount,
                start,
                items
            });
        },

        async updateCell(value) {
            const input = readDatasetViewerInput(value);

            await bindings.writeCellValue(
                String(input.name || ""),
                Number(input.row) || 0,
                String(input.column || ""),
                input.value
            );

            return createDatasetViewerCellFallback(input.value);
        },

        async updateColumnName(value) {
            const input = readDatasetViewerInput(value);
            const columnIndex = await findColumnIndex(
                String(input.name || ""),
                String(input.column || "")
            );

            if (columnIndex < 1) {
                return null;
            }

            await bindings.writeVariableName(String(input.name || ""), columnIndex, input.nextName);

            return {
                column: String(input.column || ""),
                name: String(input.nextName || "")
            };
        },

        async updateRowName(value) {
            const input = readDatasetViewerInput(value);
            const name = String(input.name || "").trim();
            const row = Math.max(1, Math.floor(Number(input.row) || 0));
            const nextName = String(input.nextName || "").trim();

            if (!name || !row || !nextName) {
                return null;
            }

            const runtime = await bindings.ensureRuntime();
            const command = createRDatasetRowNameCommand(name, row, nextName);

            await runtime.evalRVoid(command);
            await bindings.invalidateDataset(name);

            return createDatasetViewerRowNameResult(createDatasetViewerUpdatedRowNameResult({
                providerId: webRDatasetViewerProviderId,
                objectName: name,
                rowIndex: row - 1,
                name: nextName
            }));
        },

        async insertRow(value) {
            const input = readDatasetViewerInput(value);
            const name = String(input.name || "").trim();
            const row = Math.max(1, Math.floor(Number(input.row) || 0));
            const nextName = String(input.nextName || row).trim();
            const position = normalizedDatasetViewerPosition(input.position);

            if (!name || !row || !nextName) {
                return null;
            }

            const runtime = await bindings.ensureRuntime();
            const command = createRDatasetRowInsertCommand(
                name,
                row,
                nextName,
                position
            );

            await runtime.evalRVoid(command);
            await bindings.invalidateDataset(name);
            const schema = await readSchema(name) as { rowCount: number };

            return createDatasetViewerRowInsertResult(createDatasetViewerUpdatedRowInsertResult({
                providerId: webRDatasetViewerProviderId,
                objectName: name,
                rowIndex: row - 1,
                name: nextName,
                rowCount: schema.rowCount
            }), {
                name: nextName,
                position
            });
        },

        async removeRow(value) {
            const input = readDatasetViewerInput(value);
            const name = String(input.name || "").trim();
            const row = Math.max(1, Math.floor(Number(input.row) || 0));

            if (!name || !row) {
                return null;
            }

            const runtime = await bindings.ensureRuntime();
            const command = createRDatasetRowRemoveCommand(name, row);

            await runtime.evalRVoid(command);
            await bindings.invalidateDataset(name);
            const schema = await readSchema(name) as { rowCount: number };

            return createDatasetViewerRowRemoveResult(createDatasetViewerUpdatedRowRemoveResult({
                providerId: webRDatasetViewerProviderId,
                objectName: name,
                rowIndex: row - 1,
                rowCount: schema.rowCount
            }));
        },

        async insertColumn(value) {
            const input = readDatasetViewerInput(value);
            const name = String(input.name || "").trim();
            const column = String(input.column || "").trim();
            const nextName = String(input.nextName || "").trim();
            const position = normalizedDatasetViewerPosition(input.position);

            if (!name || !column || !nextName) {
                return null;
            }

            const runtime = await bindings.ensureRuntime();
            const command = createRDatasetColumnInsertCommand(
                name,
                column,
                nextName,
                position
            );
            const insertedName = String(await runtime.evalRString(command) || nextName).trim();

            await bindings.invalidateDataset(name);
            const schema = await readSchema(name) as DatasetViewerSchema;
            const columnIndex = schema.columns.findIndex((entry) => entry.name === insertedName) + 1;

            return createDatasetViewerColumnInsertResult(createDatasetViewerUpdatedColumnInsertResult({
                providerId: webRDatasetViewerProviderId,
                objectName: name,
                columnName: insertedName,
                columnIndex,
                columnCount: schema.columnCount
            }), {
                column,
                position
            });
        },

        async removeColumn(value) {
            const input = readDatasetViewerInput(value);
            const name = String(input.name || "").trim();
            const column = String(input.column || "").trim();

            if (!name || !column) {
                return null;
            }

            const runtime = await bindings.ensureRuntime();
            const command = createRDatasetColumnRemoveCommand(name, column);

            await runtime.evalRVoid(command);
            await bindings.invalidateDataset(name);
            const schema = await readSchema(name) as { columnCount: number };

            return createDatasetViewerColumnRemoveResult(createDatasetViewerUpdatedColumnRemoveResult({
                providerId: webRDatasetViewerProviderId,
                objectName: name,
                columnName: column,
                columnCount: schema.columnCount
            }));
        },

        async sortRows(value) {
            const input = readDatasetViewerInput(value);
            const name = String(input.name || "").trim();
            const column = String(input.column || "").trim();
            const decreasing = input.decreasing === true;

            if (!name || !column) {
                return null;
            }

            const runtime = await bindings.ensureRuntime();
            const command = createRDatasetRowSortCommand(
                name,
                column,
                decreasing
            );

            await runtime.evalRVoid(command);
            await bindings.invalidateDataset(name);
            const schema = await readSchema(name) as { rowCount: number };

            return createDatasetViewerRowSortResult(createDatasetViewerUpdatedRowSortResult({
                providerId: webRDatasetViewerProviderId,
                objectName: name,
                columnName: column,
                direction: decreasing ? "descending" : "ascending",
                rowCount: schema.rowCount,
                command
            }));
        },

        async writeCells(value) {
            const requests = Array.isArray(value) ? value as Record<string, unknown>[] : [];
            const results = [];

            for (const request of requests) {
                const objectName = String(request?.objectName || request?.name || "").trim();
                const rowIndex = Number(request?.rowIndex ?? request?.row);
                const columnName = String(request?.columnName || request?.column || "").trim();

                if (!objectName || !Number.isFinite(rowIndex) || rowIndex < 1 || !columnName) {
                    results.push(
                        createDatasetViewerCellUpdateFailure({
                            providerId: webRDatasetViewerProviderId,
                            objectName,
                            rowIndex,
                            columnName,
                            value: request?.value,
                            message: "Invalid cell target."
                        })
                    );
                    continue;
                }

                try {
                    await bindings.writeCellValue(objectName, rowIndex, columnName, request?.value);
                    results.push(
                        createDatasetViewerCellUpdateSuccess({
                            providerId: webRDatasetViewerProviderId,
                            objectName,
                            rowIndex,
                            columnName,
                            value: request?.value
                        })
                    );
                }
                catch (error) {
                    results.push(
                        createDatasetViewerCellUpdateFailure({
                            providerId: webRDatasetViewerProviderId,
                            objectName,
                            rowIndex,
                            columnName,
                            value: request?.value,
                            message: error instanceof Error ? error.message : String(error)
                        })
                    );
                }
            }

            const objectName = String(requests[0]?.objectName || requests[0]?.name || "").trim();

            if (results.some((result) => result.status === "updated") && objectName) {
                await bindings.invalidateDataset(objectName);
            }

            return createDatasetViewerCellUpdateBatchResult({
                providerId: webRDatasetViewerProviderId,
                objectName,
                results
            });
        },

        async updateVariable(value) {
            const input = readDatasetViewerInput(value);
            const name = String(input.name || "").trim();
            const variableName = String(input.variableName || "").trim();
            const columnIndex = await findColumnIndex(name, variableName);

            if (!name || !variableName || columnIndex < 1) {
                return null;
            }

            for (const key of ["type", "measure", "label", "width", "decimals", "align"]) {
                if (Object.prototype.hasOwnProperty.call(input, key)) {
                    await bindings.writeVariableAttribute(name, columnIndex, key, input[key]);
                }
            }

            if (
                Object.prototype.hasOwnProperty.call(input, "categories")
                || Object.prototype.hasOwnProperty.call(input, "missingRange")
            ) {
                await bindings.writeValueLabels(
                    name,
                    columnIndex,
                    input.categories || [],
                    input.missingRange || null
                );
            }

            const batch = await bindings.readVariableBatch(name, columnIndex, 1);

            return batch[0] || null;
        },

        async readDialogVariableValues(value) {
            const input = readDatasetViewerInput(value);
            const datasetName = String(input.name || "").trim();
            const variableName = String(input.variableName || "").trim();

            if (!datasetName || !variableName) {
                return [];
            }

            const runtime = await bindings.ensureRuntime();
            const command = createRDatasetVariableValuesCommand(
                datasetName,
                variableName
            );
            const text = await runtime.evalRString(command);

            return readDatasetViewerPartList(text);
        }
    };
};
