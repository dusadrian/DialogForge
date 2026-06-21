export interface DataViewportColumn {
    name: string;
}


export interface DataViewportContentPage<Column, Cell> {
    rowStart: number;
    rowCount: number;
    columns: Column[];
    rowNames: string[];
    rows: Cell[][];
}


export interface DataViewportFilterMask {
    filteredOut: boolean[];
}


export interface DataViewportWindow<Column, Cell> {
    columns: Column[];
    rowNames: string[];
    rows: Cell[][];
    filteredOut: boolean[];
    rowStart: number;
    rowEnd: number;
    columnStart: number;
    columnEnd: number;
}


export interface DataViewportLoaderSnapshot {
    inFlight: boolean;
    refreshPending: boolean;
}


export interface DataViewportLoaderOptions<Column extends DataViewportColumn, Cell> {
    getDatasetName(): string;
    getSchemaColumns(): Column[];
    hasRenderedColumns(): boolean;
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
    requestViewportRefresh(): void;
}


export interface DataViewportLoader {
    readonly snapshot: DataViewportLoaderSnapshot;
    invalidate(): void;
    load(
        rowStart: number,
        rowCount: number,
        columnStart: number,
        columnEnd: number
    ): Promise<void>;
}


export const createDataViewportLoader = function<
    Column extends DataViewportColumn,
    Cell
>(
    options: DataViewportLoaderOptions<Column, Cell>
): DataViewportLoader {
    let sequence = 0;
    let activeRequest = 0;
    let inFlight = false;
    let refreshPending = false;

    const requestPendingRefresh = function(): void {
        if (!refreshPending) {
            return;
        }

        refreshPending = false;
        options.requestViewportRefresh();
    };

    const finishCurrentRequest = function(request: number): boolean {
        if (request !== sequence || request !== activeRequest) {
            return false;
        }

        inFlight = false;
        activeRequest = 0;
        return true;
    };

    const load = async function(
        rowStart: number,
        rowCount: number,
        columnStart: number,
        columnEnd: number
    ): Promise<void> {
        const datasetName = options.getDatasetName();
        const schemaColumns = options.getSchemaColumns();

        if (!datasetName || schemaColumns.length === 0) {
            return;
        }

        if (inFlight) {
            refreshPending = true;
            return;
        }

        const nextRowStart = Math.max(1, Number(rowStart) || 1);
        const nextRowCount = Math.max(1, Number(rowCount) || 1);
        const requestedColumns = schemaColumns
            .slice(
                Math.max(0, columnStart - 1),
                Math.max(0, columnEnd)
            )
            .map((column) => String(column?.name || ""))
            .filter(Boolean);

        if (requestedColumns.length === 0) {
            options.applyFailure();
            return;
        }

        const request = ++sequence;
        activeRequest = request;
        inFlight = true;

        if (
            !options.hasRenderedColumns()
            && !options.isLoadingCoverActive()
        ) {
            options.showLoadingStatus();
        }

        const page = await options.fetchContent(datasetName, {
            rowStart: nextRowStart,
            rowCount: nextRowCount,
            columns: requestedColumns
        });

        if (!finishCurrentRequest(request)) {
            return;
        }

        if (!page) {
            options.applyFailure();
            requestPendingRefresh();
            return;
        }

        const columns = Array.isArray(page.columns) ? page.columns : [];
        const rowNames = Array.isArray(page.rowNames)
            ? page.rowNames.map((value) => String(value || ""))
            : [];
        const rows = Array.isArray(page.rows)
            ? page.rows.filter((row) => Array.isArray(row))
            : [];
        const pageRowStart = Number(page.rowStart || nextRowStart);
        const pageRowCount = Number(page.rowCount || rows.length);

        inFlight = true;
        activeRequest = request;

        const filterMask = await options.fetchFilterMask(
            datasetName,
            pageRowStart,
            pageRowCount
        );

        if (!finishCurrentRequest(request)) {
            return;
        }

        const filteredOut = Array.isArray(filterMask?.filteredOut)
            ? filterMask.filteredOut.map((value) => value === true)
            : [];
        const loadedRowStart = rows.length ? pageRowStart : 1;

        options.applyWindow({
            columns,
            rowNames,
            rows,
            filteredOut: rows.map((_row, index) => filteredOut[index] === true),
            rowStart: loadedRowStart,
            rowEnd: rows.length
                ? loadedRowStart + rows.length - 1
                : 0,
            columnStart,
            columnEnd: columnStart + Math.max(0, columns.length - 1)
        });
        requestPendingRefresh();
    };

    const invalidate = function(): void {
        sequence += 1;
        activeRequest = 0;
        inFlight = false;
        refreshPending = false;
    };

    return {
        get snapshot(): DataViewportLoaderSnapshot {
            return {
                inFlight,
                refreshPending
            };
        },
        invalidate,
        load
    };
};
