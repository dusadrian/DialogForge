export interface DatasetOpeningPresentationControllerOptions {
    translate(key: string): string;
    renderDataStatus(message: string): void;
    renderVariablesStatus(message: string): void;
    showLoadingCover(message: string): void;
}


export const createDatasetOpeningPresentationController = function(
    options: DatasetOpeningPresentationControllerOptions
) {
    const showEmptyDataset = function(): void {
        const message = options.translate("No dataset selected");

        options.renderDataStatus(message);
        options.renderVariablesStatus(message);
    };

    const showInitialLoading = function(): void {
        options.renderDataStatus("");
        options.renderVariablesStatus("");
        options.showLoadingCover(
            options.translate("Loading dataset...")
        );
    };

    const showContentLoading = function(): void {
        options.renderDataStatus("");
        options.showLoadingCover(
            options.translate("Loading data...")
        );
    };

    return {
        showEmptyDataset,
        showInitialLoading,
        showContentLoading
    };
};
