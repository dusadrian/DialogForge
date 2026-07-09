export interface LoadedDataWindowSnapshot {
    rowStart: number;
    rowEnd: number;
    columnStart: number;
    columnEnd: number;
    loadFailed: boolean;
}


export interface LoadedDataWindowState {
    readonly snapshot: LoadedDataWindowSnapshot;
    resetRows(): void;
    resetWindow(): void;
    setWindow(window: {
        rowStart: number;
        rowEnd: number;
        columnStart: number;
        columnEnd: number;
    }): void;
    setColumnEnd(columnEnd: number): void;
    setLoadFailed(loadFailed: boolean): void;
}


export const createLoadedDataWindowState = function(): LoadedDataWindowState {
    let rowStart = 1;
    let rowEnd = 0;
    let columnStart = 1;
    let columnEnd = 0;
    let loadFailed = false;

    const resetWindow = function(): void {
        rowStart = 1;
        rowEnd = 0;
        columnStart = 1;
        columnEnd = 0;
    };

    const resetRows = function(): void {
        rowStart = 1;
        rowEnd = 0;
    };

    const setWindow = function(window: {
        rowStart: number;
        rowEnd: number;
        columnStart: number;
        columnEnd: number;
    }): void {
        rowStart = window.rowStart;
        rowEnd = window.rowEnd;
        columnStart = window.columnStart;
        columnEnd = window.columnEnd;
    };

    return {
        get snapshot(): LoadedDataWindowSnapshot {
            return {
                rowStart,
                rowEnd,
                columnStart,
                columnEnd,
                loadFailed
            };
        },
        resetRows,
        resetWindow,
        setWindow,
        setColumnEnd: function(nextColumnEnd: number): void {
            columnEnd = nextColumnEnd;
        },
        setLoadFailed: function(nextLoadFailed: boolean): void {
            loadFailed = nextLoadFailed;
        }
    };
};
