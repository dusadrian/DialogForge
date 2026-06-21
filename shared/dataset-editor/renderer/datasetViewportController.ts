import {
    createDataViewportLoader,
    type DataViewportContentPage,
    type DataViewportFilterMask,
    type DataViewportWindow
} from "../state/dataViewportLoader";
import {
    createDatasetViewportPlan,
    loadedWindowContainsViewport,
    type DatasetViewportPlan
} from "../view/viewportPlan";


export interface DatasetViewportSchemaColumn {
    name: string;
}


export interface DatasetViewportControllerSnapshot {
    inFlight: boolean;
    refreshPending: boolean;
    refreshQueued: boolean;
    lastActivityAt: number;
}


export interface DatasetViewportControllerOptions<
    Column extends DatasetViewportSchemaColumn,
    Cell
> {
    window: Window;
    getHost(): HTMLElement | null;
    getDatasetName(): string;
    getSchemaColumns(): Column[];
    getRowCount(): number;
    getColumnWidths(): number[];
    getLoadedRowNames(): string[];
    getLoadedWindow(): {
        rowStart: number;
        rowEnd: number;
        columnStart: number;
        columnEnd: number;
        hasColumns: boolean;
    };
    rowHeight: number;
    indexColumnWidth: number;
    overscanRows: number;
    overscanColumns: number;
    isLoadingCoverActive(): boolean;
    fetchContent(
        datasetName: string,
        request: {
            rowStart: number;
            rowCount: number;
            columns: string[];
        }
    ): Promise<DataViewportContentPage<Column, Cell> | null>;
    fetchFilterMask(
        datasetName: string,
        rowStart: number,
        rowCount: number
    ): Promise<DataViewportFilterMask | null>;
    showLoadingStatus(): void;
    applyFailure(): void;
    applyWindow(window: DataViewportWindow<Column, Cell>): void;
}


export interface DatasetViewportController {
    readonly snapshot: DatasetViewportControllerSnapshot;
    readPlan(): DatasetViewportPlan;
    invalidate(): void;
    markActivity(): void;
    load(
        rowStart: number,
        rowCount: number,
        columnStart: number,
        columnEnd: number
    ): Promise<void>;
    refresh(): Promise<void>;
    queueRefresh(): void;
}


export const createDatasetViewportController = function<
    Column extends DatasetViewportSchemaColumn,
    Cell
>(
    options: DatasetViewportControllerOptions<Column, Cell>
): DatasetViewportController {
    let refreshQueued = false;
    let lastActivityAt = 0;

    const readPlan = function(): DatasetViewportPlan {
        const host = options.getHost();
        const columns = options.getSchemaColumns();

        return createDatasetViewportPlan({
            viewportHeight: host?.clientHeight || 0,
            viewportWidth: host?.clientWidth || 0,
            scrollTop: host?.scrollTop || 0,
            scrollLeft: host?.scrollLeft || 0,
            rowCount: options.getRowCount(),
            columnCount: columns.length,
            columnWidths: options.getColumnWidths(),
            rowNames: options.getLoadedRowNames(),
            rowHeight: options.rowHeight,
            indexColumnWidth: options.indexColumnWidth,
            overscanRows: options.overscanRows,
            overscanColumns: options.overscanColumns
        });
    };

    let queueRefresh = function(): void {};

    const loader = createDataViewportLoader<Column, Cell>({
        getDatasetName: options.getDatasetName,
        getSchemaColumns: options.getSchemaColumns,
        hasRenderedColumns: () => {
            return options.getLoadedWindow().hasColumns;
        },
        isLoadingCoverActive: options.isLoadingCoverActive,
        fetchContent: options.fetchContent,
        fetchFilterMask: options.fetchFilterMask,
        showLoadingStatus: options.showLoadingStatus,
        applyFailure: options.applyFailure,
        applyWindow: options.applyWindow,
        requestViewportRefresh: () => {
            queueRefresh();
        }
    });

    const markActivity = function(): void {
        lastActivityAt = Date.now();
    };

    const load = async function(
        rowStart: number,
        rowCount: number,
        columnStart: number,
        columnEnd: number
    ): Promise<void> {
        await loader.load(
            rowStart,
            rowCount,
            columnStart,
            columnEnd
        );
    };

    const refresh = async function(): Promise<void> {
        if (!options.getDatasetName() || !options.getSchemaColumns().length) {
            return;
        }

        const plan = readPlan();

        if (
            loadedWindowContainsViewport(
                options.getLoadedWindow(),
                plan
            )
        ) {
            return;
        }

        await load(
            plan.rowStart,
            plan.rowCount,
            plan.columnStart,
            plan.columnEnd
        );
    };

    queueRefresh = function(): void {
        markActivity();

        if (refreshQueued) {
            return;
        }

        refreshQueued = true;
        options.window.requestAnimationFrame(() => {
            refreshQueued = false;
            void refresh();
        });
    };

    const invalidate = function(): void {
        loader.invalidate();
        refreshQueued = false;
    };

    return {
        get snapshot(): DatasetViewportControllerSnapshot {
            const loaderSnapshot = loader.snapshot;

            return {
                inFlight: loaderSnapshot.inFlight,
                refreshPending: loaderSnapshot.refreshPending,
                refreshQueued,
                lastActivityAt
            };
        },
        readPlan,
        invalidate,
        markActivity,
        load,
        refresh,
        queueRefresh
    };
};
