import type {
    DataViewportColumn,
    DataViewportWindow
} from "../state/dataViewportLoader";


export interface DatasetViewportResultControllerOptions<
    Column extends DataViewportColumn,
    Cell
> {
    setLoadFailed(loadFailed: boolean): void;
    clearContent(): void;
    setContent(window: DataViewportWindow<Column, Cell>): void;
    resetLoadedWindow(): void;
    setLoadedWindow(window: DataViewportWindow<Column, Cell>): void;
    renderLoadingStatus(): void;
    renderData(): void;
}


export const createDatasetViewportResultController = function<
    Column extends DataViewportColumn,
    Cell
>(
    options: DatasetViewportResultControllerOptions<Column, Cell>
) {
    const showLoadingStatus = function(): void {
        options.setLoadFailed(false);
        options.renderLoadingStatus();
    };

    const applyFailure = function(): void {
        options.setLoadFailed(true);
        options.clearContent();
        options.resetLoadedWindow();
        options.renderData();
    };

    const applyWindow = function(
        window: DataViewportWindow<Column, Cell>
    ): void {
        options.setLoadFailed(false);
        options.setContent(window);
        options.setLoadedWindow(window);
        options.renderData();
    };

    return {
        showLoadingStatus,
        applyFailure,
        applyWindow
    };
};
