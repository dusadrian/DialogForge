import type {
    DatasetRefreshViewport
} from "./datasetRefreshController";
import type {
    DatasetViewportController
} from "./datasetViewportController";

export interface DatasetViewportReloadControllerOptions {
    viewport: DatasetViewportController;
    hasDataset: () => boolean;
    hasSchema: () => boolean;
    resetLoadedWindow: () => void;
}

export interface DatasetViewportReloadController {
    invalidate: () => void;
    loadWindow: (viewport: DatasetRefreshViewport) => Promise<void>;
    loadRange: (
        rowStart: number,
        rowCount: number,
        columnStart: number,
        columnEnd: number
    ) => Promise<void>;
    forceCurrent: () => Promise<void>;
    resetLoadedWindow: () => void;
}

export const createDatasetViewportReloadController = function(
    options: DatasetViewportReloadControllerOptions
): DatasetViewportReloadController {
    const invalidate = function(): void {
        options.viewport.invalidate();
    };

    const loadRange = async function(
        rowStart: number,
        rowCount: number,
        columnStart: number,
        columnEnd: number
    ): Promise<void> {
        await options.viewport.load(
            rowStart,
            rowCount,
            columnStart,
            columnEnd
        );
    };

    const loadWindow = async function(
        viewport: DatasetRefreshViewport
    ): Promise<void> {
        await loadRange(
            viewport.rowStart,
            viewport.rowCount,
            viewport.columnStart,
            viewport.columnEnd
        );
    };

    const forceCurrent = async function(): Promise<void> {
        if (!options.hasDataset() || !options.hasSchema()) {
            return;
        }

        const nextWindow = options.viewport.readPlan();
        options.resetLoadedWindow();
        await loadWindow(nextWindow);
    };

    return {
        invalidate,
        loadWindow,
        loadRange,
        forceCurrent,
        resetLoadedWindow: options.resetLoadedWindow
    };
};
