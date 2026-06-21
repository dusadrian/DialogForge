import type {
    TabularPreviewRequest,
    TabularPreviewSnapshot,
    TabularSchemaSnapshot
} from "../../runtime/provider-contract/runtimeProvider";

export type DatasetViewerSchema = {
    name: string;
    rowCount: number;
    columnCount: number;
    columns: Array<{ name: string; type: string; decimals?: number }>;
};

export type DatasetViewerContent = {
    name: string;
    rowStart: number;
    rowCount: number;
    totalRowCount: number;
    columnCount: number;
    totalColumnCount: number;
    columns: Array<{ name: string; type: string; decimals?: number }>;
    rowNames: string[];
    rows: Array<Array<{ display: string; raw: string; declaredMissing?: boolean }>>;
};

const toViewerColumn = function(column: {
    name: string;
    type?: string;
    decimals?: number;
}): { name: string; type: string; decimals?: number } {
    return {
        name: column.name,
        type: column.type || "unknown",
        decimals: typeof column.decimals === "number" ? column.decimals : undefined
    };
};

export const toDatasetViewerSchema = function(
    schema: TabularSchemaSnapshot | null
): DatasetViewerSchema | null {
    if (!schema || schema.status !== "ready") {
        return null;
    }

    return {
        name: schema.objectName,
        rowCount: schema.rowCount,
        columnCount: schema.columnCount,
        columns: schema.columns.map(toViewerColumn)
    };
};

export const toDatasetViewerContent = function(
    preview: TabularPreviewSnapshot | null,
    request?: Partial<TabularPreviewRequest>
): DatasetViewerContent | null {
    if (!preview || preview.status !== "ready") {
        return null;
    }

    const requestedColumns = Array.isArray(request?.columns)
        ? request.columns.map((column) => String(column || "").trim()).filter(Boolean)
        : [];
    const sourceColumns = requestedColumns.length > 0
        ? requestedColumns.map((name) => {
            return preview.columns.find((column) => column.name === name);
        }).filter((column): column is TabularPreviewSnapshot["columns"][number] => Boolean(column))
        : preview.columns;
    const columns = sourceColumns.map(toViewerColumn);
    const requestedRowCount = Number.isFinite(Number(request?.rowCount))
        ? Math.max(1, Math.floor(Number(request?.rowCount)))
        : preview.rows.length;
    const rows = preview.rows.slice(0, requestedRowCount).map((row) => {
        return columns.map((column) => {
            const value = row[column.name];

            if (value && typeof value === "object" && "display" in value) {
                const cell = value as {
                    display?: unknown;
                    raw?: unknown;
                    declaredMissing?: unknown;
                };

                return {
                    display: String(cell.display ?? ""),
                    raw: String(cell.raw ?? cell.display ?? ""),
                    declaredMissing: cell.declaredMissing === true
                };
            }

            return {
                display: value === null || typeof value === "undefined" ? "" : String(value),
                raw: value === null || typeof value === "undefined" ? "" : String(value)
            };
        });
    });

    return {
        name: preview.objectName,
        rowStart: Number(preview.rowOffset || 0) + 1,
        rowCount: rows.length,
        totalRowCount: Number(preview.totalRowCount || rows.length),
        columnCount: columns.length,
        totalColumnCount: Number(
            (preview as TabularPreviewSnapshot & { totalColumnCount?: number }).totalColumnCount
            || columns.length
        ),
        columns,
        rowNames: (preview.rowNames || []).slice(0, requestedRowCount),
        rows
    };
};
