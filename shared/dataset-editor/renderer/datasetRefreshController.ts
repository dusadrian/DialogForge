export interface DatasetRefreshViewport {
    rowStart: number;
    rowCount: number;
    columnStart: number;
    columnEnd: number;
}


export interface DatasetRefreshControllerOptions<Schema, Variable> {
    batchSize: number;
    normalizeDatasetName(value: string): string;
    getCurrentDatasetName(): string;
    getCurrentSchema(): Schema | null;
    openDataset(datasetName: string): Promise<void>;
    syncDatasetSelector(): void;
    hideHeaderMenu(): void;
    closeValueLabels(): void;
    clearEditState(): void;
    invalidatePendingLoads(): void;
    markViewportActivity(): void;
    isVariableViewActive(): boolean;
    isVariableMetadataLoaded(): boolean;
    resetVariableMetadata(): void;
    fetchSchema(datasetName: string): Promise<Schema | null>;
    applySchema(schema: Schema): void;
    showSchemaFailure(): void;
    readViewport(): DatasetRefreshViewport;
    resetLoadedWindow(): void;
    loadWindow(viewport: DatasetRefreshViewport): Promise<void>;
    getVariableHost(): HTMLElement | null;
    getMinimumVisibleVariableRows(host?: HTMLElement | null): number;
    loadVariablesUntil(
        minimumCount: number,
        showLoadingState: boolean
    ): Promise<void>;
    ensureVariablesLoaded(showLoadingState: boolean): Promise<void>;
    getVariables(): Variable[] | null;
    renderVariables(): void;
    renderNoVariables(): void;
    scheduleBackgroundVariableLoad(): void;
    queueViewportRefresh(): void;
}


export interface DatasetRefreshController {
    refresh(datasetName: string): Promise<void>;
}


export const createDatasetRefreshController = function<Schema, Variable>(
    options: DatasetRefreshControllerOptions<Schema, Variable>
): DatasetRefreshController {
    let refreshGeneration = 0;

    const refresh = async function(datasetName: string): Promise<void> {
        const generation = refreshGeneration + 1;
        refreshGeneration = generation;

        const nextName = options.normalizeDatasetName(datasetName);
        const isCurrentRefresh = function(): boolean {
            return generation === refreshGeneration
                && nextName === options.getCurrentDatasetName();
        };

        if (!nextName) {
            await options.openDataset(nextName);
            return;
        }

        if (
            nextName !== options.getCurrentDatasetName()
            || !options.getCurrentSchema()
        ) {
            await options.openDataset(nextName);
            return;
        }

        options.syncDatasetSelector();
        options.hideHeaderMenu();
        options.closeValueLabels();
        options.clearEditState();
        options.invalidatePendingLoads();
        options.markViewportActivity();

        const shouldWarmVariables =
            options.isVariableMetadataLoaded()
            || options.isVariableViewActive();

        options.resetVariableMetadata();

        const schema = await options.fetchSchema(nextName);

        if (!isCurrentRefresh()) {
            return;
        }

        if (!schema) {
            options.showSchemaFailure();
            return;
        }

        options.applySchema(schema);

        const viewport = options.readViewport();

        options.resetLoadedWindow();
        await options.loadWindow(viewport);

        if (!isCurrentRefresh()) {
            return;
        }

        if (shouldWarmVariables) {
            if (options.isVariableViewActive()) {
                const minimumRows = Math.max(
                    options.batchSize,
                    options.getMinimumVisibleVariableRows(
                        options.getVariableHost()
                    )
                );

                await options.loadVariablesUntil(
                    minimumRows,
                    false
                );

                if (!isCurrentRefresh()) {
                    return;
                }

                if (options.isVariableViewActive()) {
                    const variables = options.getVariables();

                    if (
                        Array.isArray(variables)
                        && variables.length > 0
                    ) {
                        options.renderVariables();
                    }
                    else if (
                        options.isVariableMetadataLoaded()
                    ) {
                        options.renderNoVariables();
                    }
                }
            }
            else {
                await options.ensureVariablesLoaded(false);

                if (!isCurrentRefresh()) {
                    return;
                }
            }
        }

        if (!isCurrentRefresh()) {
            return;
        }

        if (!options.isVariableMetadataLoaded()) {
            options.scheduleBackgroundVariableLoad();
        }

        options.queueViewportRefresh();
    };

    return {
        refresh
    };
};
