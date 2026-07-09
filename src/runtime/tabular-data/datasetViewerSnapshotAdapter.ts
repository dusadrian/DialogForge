import type {
    DatasetVariableMetadata,
    DatasetViewerContentPage,
    DatasetViewerFilterMaskPage,
    DatasetViewerSchema
} from "./datasetViewerTypes";


export interface DatasetViewerSnapshotColumn {
    name: string;
    type?: string;
}

export interface DatasetViewerSnapshotRow {
    name: string;
    values: Array<{
        display?: unknown;
        declaredMissing?: boolean;
    }>;
}

export interface DatasetViewerSnapshot {
    name: string;
    rowStart: number;
    rowCount: number;
    columnCount: number;
    allColumns: string[];
    columns: string[];
    rows: DatasetViewerSnapshotRow[];
}

export interface DatasetViewerVariableSnapshot {
    name?: unknown;
    type?: unknown;
    [key: string]: unknown;
}

export const readDatasetViewerInput = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
};

export const readDatasetViewerStringList = function(value: unknown): string[] {
    return Array.isArray(value)
        ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];
};

export const readDatasetViewerPositiveInteger = function(
    value: unknown,
    fallback: number
): number {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue) || numberValue < 1) {
        return Math.max(1, Math.floor(Number(fallback) || 1));
    }

    return Math.floor(numberValue);
};

export const readDatasetViewerPartList = function(value: unknown): string[] {
    return String(value || "").split("\n").map((entry) => {
        return entry.trim();
    }).filter(Boolean);
};

export const createDatasetViewerSchemaFromSnapshot = function(
    snapshot: DatasetViewerSnapshot,
    variables: DatasetViewerVariableSnapshot[]
): DatasetViewerSchema {
    const variableTypes = new Map(variables.map((variable) => {
        return [String(variable.name || ""), String(variable.type || "")];
    }));

    return {
        name: snapshot.name,
        rowCount: snapshot.rowCount,
        columnCount: snapshot.columnCount,
        columns: snapshot.allColumns.map((columnName) => ({
            name: columnName,
            type: variableTypes.get(columnName) || "character"
        }))
    };
};

export const createDatasetViewerContentFromSnapshot = function(
    input: {
        name: string;
        snapshot: DatasetViewerSnapshot;
        schema: Pick<DatasetViewerSchema, "columns">;
    }
): DatasetViewerContentPage {
    const typeByColumn = new Map(input.schema.columns.map((column) => {
        return [column.name, column.type || "character"];
    }));

    return {
        name: input.name,
        rowStart: input.snapshot.rowStart,
        rowCount: input.snapshot.rows.length,
        totalRowCount: input.snapshot.rowCount,
        columnCount: input.snapshot.columns.length,
        totalColumnCount: input.snapshot.columnCount,
        columns: input.snapshot.columns.map((columnName) => ({
            name: columnName,
            type: typeByColumn.get(columnName) || "character"
        })),
        rowNames: input.snapshot.rows.map((row) => row.name),
        rows: input.snapshot.rows.map((row) => {
            return row.values.map((cell) => ({
                display: String(cell?.display || ""),
                raw: String(cell?.display || ""),
                declaredMissing: cell?.declaredMissing === true
            }));
        })
    };
};

export const createDatasetViewerEmptyFilterMaskPage = function(
    value: unknown,
    fallbackRows: number
): DatasetViewerFilterMaskPage {
    const input = readDatasetViewerInput(value);
    const rowCount = readDatasetViewerPositiveInteger(
        input.rowCount,
        fallbackRows
    );

    return {
        name: String(input.name || ""),
        rowStart: readDatasetViewerPositiveInteger(input.rowStart, 1),
        rowCount,
        filteredOut: Array.from({ length: rowCount }, () => false)
    };
};

export const createDatasetViewerVariableBatch = function(
    input: {
        name: string;
        total: number;
        start: number;
        items: DatasetVariableMetadata[];
    }
) {
    return {
        name: input.name,
        total: input.total,
        start: input.start,
        count: input.items.length,
        items: input.items
    };
};
