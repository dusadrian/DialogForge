import type { DatasetChange } from "../state/datasetChanges";


export interface NamedDatasetColumn {
    name: string;
}


export interface DatasetColumnChangeSchema<
    Column extends NamedDatasetColumn
> {
    columnCount: number;
    columns: Column[];
}


export interface DatasetColumnChangeApplierOptions<
    Column extends NamedDatasetColumn,
    Variable extends NamedDatasetColumn,
    Cell
> {
    getSchema(): DatasetColumnChangeSchema<Column> | null;
    getLoadedColumns(): Column[];
    getLoadedRows(): Cell[][];
    setLoadedRows(rows: Cell[][]): void;
    getVariables(): Variable[] | null;
    getColumnWidths(): number[];
    getLoadedColumnStart(): number;
    getLoadedColumnEnd(): number;
    setLoadedColumnEnd(value: number): void;
    renameSelection(previousName: string, nextName: string): void;
    clearRemovedSelection(removedName: string): void;
    renderTitle(): void;
    renderData(): void;
    renderVariables(): void;
    dataViewActive(): boolean;
    variableViewAvailable(): boolean;
    queueViewportRefresh(): void;
}


export interface DatasetColumnChangeApplier {
    applyRenames(changes: DatasetChange[]): boolean;
    applyRemovals(changes: DatasetChange[]): boolean;
}


export const createDatasetColumnChangeApplier = function<
    Column extends NamedDatasetColumn,
    Variable extends NamedDatasetColumn,
    Cell
>(
    options: DatasetColumnChangeApplierOptions<Column, Variable, Cell>
): DatasetColumnChangeApplier {
    const applyRenames = function(
        changes: DatasetChange[]
    ): boolean {
        if (!changes.length) {
            return false;
        }

        const schemaColumns = options.getSchema()?.columns || [];
        const loadedColumns = options.getLoadedColumns();
        const variables = options.getVariables();
        let changed = false;

        changes.forEach((change) => {
            const previousName = String(
                change.columns?.[0] || ""
            ).trim();
            const nextName = String(
                change.columns?.[1] || ""
            ).trim();
            const requestedIndex = Math.max(
                0,
                Number(change.columnIndex || 0) - 1
            );

            if (
                !previousName
                || !nextName
                || previousName === nextName
            ) {
                return;
            }

            const indexedSchemaColumn = schemaColumns[requestedIndex];

            if (indexedSchemaColumn?.name === previousName) {
                indexedSchemaColumn.name = nextName;
                changed = true;
            }
            else {
                const schemaColumn = schemaColumns.find((column) => {
                    return column.name === previousName;
                });

                if (schemaColumn) {
                    schemaColumn.name = nextName;
                    changed = true;
                }
            }

            loadedColumns.forEach((column) => {
                if (column.name === previousName) {
                    column.name = nextName;
                    changed = true;
                }
            });

            if (variables) {
                const indexedVariable = variables[requestedIndex];

                if (indexedVariable?.name === previousName) {
                    indexedVariable.name = nextName;
                    changed = true;
                }
                else {
                    variables.forEach((variable) => {
                        if (variable.name === previousName) {
                            variable.name = nextName;
                            changed = true;
                        }
                    });
                }
            }

            options.renameSelection(previousName, nextName);
        });

        if (!changed) {
            return false;
        }

        if (options.dataViewActive()) {
            options.renderData();
        }

        if (options.variableViewAvailable()) {
            options.renderVariables();
        }

        return true;
    };

    const applyRemovals = function(
        changes: DatasetChange[]
    ): boolean {
        if (!changes.length) {
            return false;
        }

        const schema = options.getSchema();
        const schemaColumns = schema?.columns || [];
        const loadedColumns = options.getLoadedColumns();
        const variables = options.getVariables();
        const columnWidths = options.getColumnWidths();
        let rows = options.getLoadedRows();
        let loadedColumnEnd = options.getLoadedColumnEnd();
        let changed = false;

        changes.forEach((change) => {
            const removedName = String(
                change.columns?.[0] || ""
            ).trim();
            let columnIndex = Math.max(
                0,
                Number(change.columnIndex || 0) - 1
            );

            if (!removedName) {
                return;
            }

            if (schemaColumns[columnIndex]?.name !== removedName) {
                const foundIndex = schemaColumns.findIndex((column) => {
                    return column.name === removedName;
                });

                if (foundIndex >= 0) {
                    columnIndex = foundIndex;
                }
            }

            if (
                columnIndex < 0
                || columnIndex >= schemaColumns.length
            ) {
                return;
            }

            schemaColumns.splice(columnIndex, 1);

            if (schema) {
                schema.columnCount = Math.max(
                    0,
                    Number(
                        change.columnCount
                        || schemaColumns.length
                    )
                );
            }

            columnWidths.splice(columnIndex, 1);

            const loadedColumnStart = Math.max(
                1,
                options.getLoadedColumnStart()
            );
            const absoluteLoadedEnd = Math.max(
                loadedColumnStart - 1,
                loadedColumnEnd
            );
            const absoluteColumn = columnIndex + 1;

            if (
                absoluteColumn >= loadedColumnStart
                && absoluteColumn <= absoluteLoadedEnd
            ) {
                const localIndex =
                    absoluteColumn - loadedColumnStart;

                loadedColumns.splice(localIndex, 1);
                rows = rows.map((row) => {
                    const nextRow = Array.isArray(row)
                        ? row.slice()
                        : [];

                    nextRow.splice(localIndex, 1);
                    return nextRow;
                });
            }

            loadedColumnEnd = Math.max(
                loadedColumnStart - 1,
                loadedColumnEnd - 1
            );

            if (
                variables
                && columnIndex < variables.length
            ) {
                variables.splice(columnIndex, 1);
            }

            options.clearRemovedSelection(removedName);
            changed = true;
        });

        if (!changed) {
            return false;
        }

        options.setLoadedRows(rows);
        options.setLoadedColumnEnd(loadedColumnEnd);
        options.renderTitle();

        if (options.dataViewActive()) {
            options.renderData();
        }

        if (options.variableViewAvailable()) {
            options.renderVariables();
        }

        options.queueViewportRefresh();
        return true;
    };

    return {
        applyRenames,
        applyRemovals
    };
};
