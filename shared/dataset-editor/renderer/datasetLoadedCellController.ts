import type {
    DatasetViewerCell,
    DatasetViewerContentPage
} from "../../base-app/modules/datasetViewer.types";


export interface DatasetLoadedCellControllerOptions {
    getLoadedRowStart(): number;
    getColumns(): DatasetViewerContentPage["columns"];
    getRows(): DatasetViewerCell[][];
}


export const createDatasetLoadedCellController = function(
    options: DatasetLoadedCellControllerOptions
) {
    const findPosition = function(
        row: number,
        column: string
    ): {
        rowIndex: number;
        columnIndex: number;
    } | null {
        const rowIndex = row - options.getLoadedRowStart();
        const columnIndex = options.getColumns().findIndex((entry) => {
            return String(entry?.name || "") === column;
        });

        if (
            rowIndex < 0
            || rowIndex >= options.getRows().length
            || columnIndex < 0
        ) {
            return null;
        }

        return {
            rowIndex,
            columnIndex
        };
    };

    const read = function(
        row: number,
        column: string
    ): DatasetViewerCell | null {
        const position = findPosition(row, column);

        if (!position) {
            return null;
        }

        const dataRow = options.getRows()[position.rowIndex];

        return Array.isArray(dataRow)
            ? dataRow[position.columnIndex] || null
            : null;
    };

    const replace = function(
        row: number,
        column: string,
        cell: DatasetViewerCell
    ): void {
        const position = findPosition(row, column);

        if (!position) {
            return;
        }

        options.getRows()[position.rowIndex][position.columnIndex] = cell;
    };

    return {
        read,
        replace
    };
};
