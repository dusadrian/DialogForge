export interface DatasetViewportPlanInput {
    viewportHeight: number;
    viewportWidth: number;
    scrollTop: number;
    scrollLeft: number;
    rowCount: number;
    columnCount: number;
    columnWidths: number[];
    rowNames: string[];
    rowHeight: number;
    indexColumnWidth: number;
    overscanRows: number;
    overscanColumns: number;
}


export interface DatasetViewportPlan {
    visibleRowStart: number;
    visibleRowEnd: number;
    visibleColumnStart: number;
    visibleColumnEnd: number;
    rowStart: number;
    rowCount: number;
    columnStart: number;
    columnEnd: number;
}


export interface LoadedDatasetWindow {
    rowStart: number;
    rowEnd: number;
    columnStart: number;
    columnEnd: number;
    hasColumns: boolean;
}


export interface InitialDatasetColumnCountInput {
    viewportWidth: number;
    rowHeaderWidth: number;
    minimumColumnWidth: number;
}


export const estimateInitialDatasetColumnCount = function(
    input: InitialDatasetColumnCountInput
): number {
    const viewportWidth = Math.max(0, Number(input.viewportWidth) || 0);
    const rowHeaderWidth = Math.max(0, Number(input.rowHeaderWidth) || 0);
    const minimumColumnWidth = Math.max(
        1,
        Number(input.minimumColumnWidth) || 1
    );
    const availableWidth = Math.max(
        minimumColumnWidth,
        viewportWidth - rowHeaderWidth
    );

    return Math.max(
        1,
        Math.ceil(availableWidth / minimumColumnWidth)
    );
};


const dataRowHeaderWidth = function(
    rowNames: string[],
    indexColumnWidth: number
): number {
    const contentWidth = rowNames.reduce((maximum, value) => {
        return Math.max(maximum, String(value || "").length * 9 + 18);
    }, 58);

    return Math.max(indexColumnWidth, Math.min(180, contentWidth));
};


export const createDatasetViewportPlan = function(
    input: DatasetViewportPlanInput
): DatasetViewportPlan {
    const rowHeight = Math.max(1, Number(input.rowHeight) || 1);
    const rowTotal = Math.max(0, Math.floor(Number(input.rowCount) || 0));
    const columnTotal = Math.max(0, Math.floor(Number(input.columnCount) || 0));
    const viewportHeight = Math.max(Number(input.viewportHeight) || 0, rowHeight * 8);
    const viewportWidth = Math.max(Number(input.viewportWidth) || 0, 640);
    const scrollTop = Math.max(0, Number(input.scrollTop) || 0);
    const scrollLeft = Math.max(0, Number(input.scrollLeft) || 0);
    const visibleRowStart = Math.max(1, Math.floor(scrollTop / rowHeight) + 1);
    const visibleRowCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
    const visibleRowEnd = Math.min(
        rowTotal,
        visibleRowStart + visibleRowCount - 1
    );
    const rowHeaderWidth = dataRowHeaderWidth(
        input.rowNames,
        input.indexColumnWidth
    );
    let visibleColumnStart = 1;
    let offset = rowHeaderWidth;

    while (
        visibleColumnStart <= input.columnWidths.length &&
        offset + (input.columnWidths[visibleColumnStart - 1] || 0) <= scrollLeft
    ) {
        offset += input.columnWidths[visibleColumnStart - 1] || 0;
        visibleColumnStart += 1;
    }

    let visibleColumnEnd = visibleColumnStart;
    let coveredWidth = Math.max(0, offset - scrollLeft);

    while (
        visibleColumnEnd <= input.columnWidths.length &&
        coveredWidth < viewportWidth
    ) {
        coveredWidth += input.columnWidths[visibleColumnEnd - 1] || 120;
        visibleColumnEnd += 1;
    }

    visibleColumnEnd = Math.min(
        columnTotal,
        Math.max(visibleColumnStart, visibleColumnEnd - 1)
    );

    const normalizedColumnStart = Math.min(
        visibleColumnStart,
        Math.max(1, columnTotal || 1)
    );
    const normalizedColumnEnd = Math.min(
        Math.max(normalizedColumnStart, visibleColumnEnd),
        columnTotal
    );
    const overscanRows = Math.max(0, Math.floor(input.overscanRows));
    const overscanColumns = Math.max(0, Math.floor(input.overscanColumns));

    return {
        visibleRowStart,
        visibleRowEnd,
        visibleColumnStart: normalizedColumnStart,
        visibleColumnEnd: normalizedColumnEnd,
        rowStart: Math.max(1, visibleRowStart - overscanRows),
        rowCount: Math.max(
            1,
            visibleRowEnd - visibleRowStart + 1 + overscanRows * 2
        ),
        columnStart: Math.max(1, normalizedColumnStart - overscanColumns),
        columnEnd: Math.min(columnTotal, normalizedColumnEnd + overscanColumns)
    };
};


export const loadedWindowContainsViewport = function(
    loaded: LoadedDatasetWindow,
    requested: DatasetViewportPlan
): boolean {
    const coversRows = loaded.rowEnd >= loaded.rowStart
        && requested.rowStart >= loaded.rowStart
        && requested.rowStart + requested.rowCount - 1 <= loaded.rowEnd;
    const coversColumns = loaded.columnEnd >= loaded.columnStart
        && requested.columnStart >= loaded.columnStart
        && requested.columnEnd <= loaded.columnEnd;

    return coversRows && coversColumns && loaded.hasColumns;
};
