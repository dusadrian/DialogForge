import type {
    DatasetViewerCell,
    DatasetViewerContentPage,
    DatasetViewerSchema
} from "../../base-app/modules/datasetViewer.types";
import {
    applyDatasetFilterMask,
    createInitialDatasetPageState
} from "../state/initialDatasetPage";
import {
    estimateInitialDatasetColumnCount
} from "../view/viewportPlan";


export interface DatasetInitialPageControllerOptions {
    window: Window;
    getDataHost(): HTMLElement | null;
    rowHeaderWidth: number;
    overscanColumns: number;
    minimumColumnWidth: number;
    minimumColumns: number;
    maximumColumns: number;
    getCurrentDatasetName(): string;
    getLoadedRowStart(): number;
    getCurrentDataRows(): DatasetViewerCell[][];
    setSchema(schema: DatasetViewerSchema): void;
    setColumnWidths(widths: number[]): void;
    setDataColumns(columns: DatasetViewerContentPage["columns"]): void;
    setDataRowNames(rowNames: string[]): void;
    setDataRows(rows: DatasetViewerCell[][]): void;
    setDataFilteredOut(filteredOut: boolean[]): void;
    setLoadedWindow(window: {
        rowStart: number;
        rowEnd: number;
        columnStart: number;
        columnEnd: number;
    }): void;
    setDataLoadFailed(value: boolean): void;
    renderData(): void;
    hideLoading(): void;
    renderTitle(): void;
    startVariableWarmup(): void;
    fetchFilterMask(
        datasetName: string,
        rowStart: number,
        rowCount: number
    ): Promise<{ filteredOut?: boolean[] } | null>;
}


export const createDatasetInitialPageController = function(
    options: DatasetInitialPageControllerOptions
) {
    const estimateColumnCount = function(): number {
        const host = options.getDataHost();
        const estimated = estimateInitialDatasetColumnCount({
            viewportWidth: host?.clientWidth || options.window.innerWidth,
            rowHeaderWidth: options.rowHeaderWidth,
            minimumColumnWidth: options.minimumColumnWidth
        });

        return Math.max(
            1,
            Math.min(
                options.maximumColumns,
                Math.max(
                    options.minimumColumns,
                    estimated + options.overscanColumns
                )
            )
        );
    };

    const hydrateFilterMask = function(
        datasetName: string,
        rowStart: number,
        rowCount: number
    ): void {
        void options
            .fetchFilterMask(datasetName, rowStart, rowCount)
            .then((filterMask) => {
                if (
                    options.getCurrentDatasetName() !== datasetName
                    || options.getLoadedRowStart() !== rowStart
                    || options.getCurrentDataRows().length !== rowCount
                ) {
                    return;
                }

                options.setDataFilteredOut(
                    applyDatasetFilterMask(
                        options.getCurrentDataRows(),
                        filterMask?.filteredOut
                    )
                );
                options.renderData();
            });
    };

    const apply = function(
        datasetName: string,
        initialPage: DatasetViewerContentPage
    ): void {
        const initialState = createInitialDatasetPageState(
            datasetName,
            initialPage
        );

        options.setSchema(initialState.schema);
        options.setColumnWidths(initialState.columnWidths);
        options.setDataColumns(initialState.columns);
        options.setDataRowNames(initialState.rowNames);
        options.setDataRows(initialState.rows);
        options.setDataFilteredOut(initialState.filteredOut);
        options.setLoadedWindow({
            rowStart: initialState.loadedRowStart,
            rowEnd: initialState.loadedRowEnd,
            columnStart: initialState.loadedColumnStart,
            columnEnd: initialState.loadedColumnEnd
        });
        options.setDataLoadFailed(false);
        options.renderData();
        options.hideLoading();
        options.renderTitle();
        options.startVariableWarmup();

        if (initialState.rows.length) {
            hydrateFilterMask(
                datasetName,
                initialState.loadedRowStart,
                initialState.rows.length
            );
        }
    };

    return {
        estimateColumnCount,
        apply
    };
};
