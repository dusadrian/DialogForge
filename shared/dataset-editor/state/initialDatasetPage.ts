import type {
    DatasetViewerCell,
    DatasetViewerContentPage,
    DatasetViewerSchema
} from "../../base-app/modules/datasetViewer.types";


export interface InitialDatasetPageState {
    schema: DatasetViewerSchema;
    columnWidths: number[];
    columns: DatasetViewerContentPage["columns"];
    rowNames: string[];
    rows: DatasetViewerCell[][];
    filteredOut: boolean[];
    loadedRowStart: number;
    loadedRowEnd: number;
    loadedColumnStart: number;
    loadedColumnEnd: number;
}


const initialColumnWidth = function(name: string): number {
    const nameWidth = String(name || "").length * 10 + 32;

    return Math.max(112, Math.min(220, nameWidth));
};


export const createDatasetColumnWidths = function(
    columns: DatasetViewerContentPage["columns"]
): number[] {
    return columns.map((column) => {
        return initialColumnWidth(column?.name);
    });
};


export const createInitialDatasetPageState = function(
    datasetName: string,
    page: DatasetViewerContentPage
): InitialDatasetPageState {
    const columns = page.columns;
    const rows = Array.isArray(page.rows)
        ? page.rows.filter((row) => Array.isArray(row))
        : [];
    const rowNames = Array.isArray(page.rowNames)
        ? page.rowNames.map((value) => String(value || ""))
        : [];
    const loadedRowStart = rows.length
        ? Number(page.rowStart || 1)
        : 1;

    return {
        schema: {
            name: datasetName,
            rowCount: Number(page.totalRowCount || rows.length),
            columnCount: Number(
                page.totalColumnCount
                || page.columnCount
                || columns.length
            ),
            columns
        },
        columnWidths: createDatasetColumnWidths(columns),
        columns,
        rowNames,
        rows,
        filteredOut: rows.map(() => false),
        loadedRowStart,
        loadedRowEnd: rows.length
            ? loadedRowStart + rows.length - 1
            : 0,
        loadedColumnStart: 1,
        loadedColumnEnd: columns.length
    };
};


export const applyDatasetFilterMask = function(
    rows: DatasetViewerCell[][],
    filteredOut: boolean[] | null | undefined
): boolean[] {
    const mask = Array.isArray(filteredOut)
        ? filteredOut
        : [];

    return rows.map((_row, index) => mask[index] === true);
};
