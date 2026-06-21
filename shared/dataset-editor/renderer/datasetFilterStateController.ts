export const createDatasetFilterStateController = function(
    options: {
        getDatasetName(): string;
        resetLoadedRows(): void;
        queueViewportRefresh(): void;
    }
) {
    const applyFilterStateChanged = function(payload: unknown): void {
        if (
            !options.getDatasetName()
            || !payload
            || typeof payload !== "object"
        ) {
            return;
        }

        options.resetLoadedRows();
        options.queueViewportRefresh();
    };

    return {
        applyFilterStateChanged
    };
};
