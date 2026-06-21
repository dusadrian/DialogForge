export interface DatasetSchemaFailureControllerOptions {
    clearSchema(): void;
    setDataLoadFailed(loadFailed: boolean): void;
    clearContent(): void;
    renderDataFailure(): void;
    renderVariableFailure(): void;
}


export const createDatasetSchemaFailureController = function(
    options: DatasetSchemaFailureControllerOptions
) {
    const show = function(): void {
        options.renderDataFailure();
        options.renderVariableFailure();
    };

    const applyRefreshFailure = function(): void {
        options.clearSchema();
        options.setDataLoadFailed(true);
        options.clearContent();
        show();
    };

    return {
        show,
        applyRefreshFailure
    };
};
