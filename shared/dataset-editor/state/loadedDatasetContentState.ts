import type {
    DatasetViewerCell,
    DatasetViewerContentPage
} from "../../base-app/modules/datasetViewer.types";


export interface LoadedDatasetContentSnapshot {
    columns: DatasetViewerContentPage["columns"];
    rowNames: string[];
    rows: DatasetViewerCell[][];
    filteredOut: boolean[];
}


export interface LoadedDatasetContentState {
    readonly snapshot: LoadedDatasetContentSnapshot;
    clear(): void;
    setColumns(columns: DatasetViewerContentPage["columns"]): void;
    setRowNames(rowNames: string[]): void;
    setRows(rows: DatasetViewerCell[][]): void;
    setFilteredOut(filteredOut: boolean[]): void;
    setWindow(window: {
        columns: DatasetViewerContentPage["columns"];
        rowNames: string[];
        rows: DatasetViewerCell[][];
        filteredOut: boolean[];
    }): void;
    replaceRowName(index: number, rowName: string): void;
}


export const createLoadedDatasetContentState = function(): LoadedDatasetContentState {
    let columns: DatasetViewerContentPage["columns"] = [];
    let rowNames: string[] = [];
    let rows: DatasetViewerCell[][] = [];
    let filteredOut: boolean[] = [];

    const clear = function(): void {
        columns = [];
        rowNames = [];
        rows = [];
        filteredOut = [];
    };

    return {
        get snapshot(): LoadedDatasetContentSnapshot {
            return {
                columns,
                rowNames,
                rows,
                filteredOut
            };
        },
        clear,
        setColumns: function(nextColumns): void {
            columns = nextColumns;
        },
        setRowNames: function(nextRowNames): void {
            rowNames = nextRowNames;
        },
        setRows: function(nextRows): void {
            rows = nextRows;
        },
        setFilteredOut: function(nextFilteredOut): void {
            filteredOut = nextFilteredOut;
        },
        setWindow: function(window): void {
            columns = window.columns;
            rowNames = window.rowNames;
            rows = window.rows;
            filteredOut = window.filteredOut;
        },
        replaceRowName: function(index, rowName): void {
            if (index < 0 || index >= rowNames.length) {
                return;
            }

            rowNames[index] = rowName;
        }
    };
};
