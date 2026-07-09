export type DatasetChangeKind =
    | "dataset_added"
    | "dataset_removed"
    | "dataset_column_renamed"
    | "dataset_column_removed"
    | "dataset_rows_changed"
    | "dataset_columns_changed"
    | "dataset_cells_changed"
    | "dataset_variable_meta_changed"
    | "dataset_changed_unknown";


export interface DatasetChange {
    name?: string;
    kind?: DatasetChangeKind | string;
    columns?: string[];
    rows?: number[];
    rowCount?: number;
    columnCount?: number;
    columnIndex?: number;
    schemaChanged?: boolean;
}


export interface DatasetChangePlan {
    removed: boolean;
    columnRenames: DatasetChange[];
    columnRemovals: DatasetChange[];
    refreshSchema: boolean;
    refreshRows: boolean;
    refreshCells: boolean;
    variableColumns: string[];
}


export const normalizeDatasetChanges = function(value: unknown): DatasetChange[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => {
            const record = entry as Record<string, unknown>;

            return {
                name: String(record.name || "").trim(),
                kind: String(record.kind || "").trim(),
                columns: Array.isArray(record.columns)
                    ? record.columns
                        .map((item) => String(item || "").trim())
                        .filter(Boolean)
                    : [],
                rows: Array.isArray(record.rows)
                    ? record.rows
                        .map((item) => Number(item))
                        .filter((item) => Number.isFinite(item) && item > 0)
                    : [],
                rowCount: Number.isFinite(Number(record.rowCount))
                    ? Number(record.rowCount)
                    : undefined,
                columnCount: Number.isFinite(Number(record.columnCount))
                    ? Number(record.columnCount)
                    : undefined,
                columnIndex: Number.isFinite(Number(record.columnIndex))
                    ? Number(record.columnIndex)
                    : undefined,
                schemaChanged: record.schemaChanged === true
            };
        })
        .filter((entry) => entry.name);
};


export const planDatasetChanges = function(
    value: unknown,
    datasetName: string
): DatasetChangePlan {
    const changes = normalizeDatasetChanges(value)
        .filter((entry) => entry.name === datasetName);
    const remaining = changes.filter((entry) => {
        return entry.kind !== "dataset_column_renamed"
            && entry.kind !== "dataset_column_removed";
    });

    return {
        removed: changes.some((entry) => entry.kind === "dataset_removed"),
        columnRenames: changes.filter((entry) => {
            return entry.kind === "dataset_column_renamed";
        }),
        columnRemovals: changes.filter((entry) => {
            return entry.kind === "dataset_column_removed";
        }),
        refreshSchema: remaining.some((entry) => {
            return entry.kind === "dataset_columns_changed"
                || entry.kind === "dataset_changed_unknown"
                || entry.schemaChanged === true;
        }),
        refreshRows: remaining.some((entry) => {
            return entry.kind === "dataset_rows_changed";
        }),
        refreshCells: remaining.some((entry) => {
            return entry.kind === "dataset_cells_changed";
        }),
        variableColumns: remaining
            .filter((entry) => {
                return entry.kind === "dataset_variable_meta_changed";
            })
            .flatMap((entry) => entry.columns || [])
    };
};
