export interface DatasetOpenPreparationControllerOptions {
    setDatasetName(datasetName: string): void;
    publishDatasetState(): void;
    syncDatasetSelector(): void;
    hideHeaderMenu(): void;
    closeValueLabels(): void;
    clearSchema(): void;
    resetVariableMetadata(): void;
    clearDataWindow(): void;
    resetLoadedWindow(): void;
    invalidatePendingLoads(): void;
    markViewportActivity(): void;
    setDataLoadFailed(value: boolean): void;
    clearEditState(): void;
    renderTitle(): void;
}


export const createDatasetOpenPreparationController = function(
    options: DatasetOpenPreparationControllerOptions
) {
    return {
        prepare: function(datasetName: string): void {
            options.setDatasetName(datasetName);
            options.publishDatasetState();
            options.syncDatasetSelector();
            options.hideHeaderMenu();
            options.closeValueLabels();
            options.clearSchema();
            options.resetVariableMetadata();
            options.clearDataWindow();
            options.resetLoadedWindow();
            options.invalidatePendingLoads();
            options.markViewportActivity();
            options.setDataLoadFailed(false);
            options.clearEditState();
            options.renderTitle();
        }
    };
};
