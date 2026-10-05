import {
    createDatasetOpeningCoordinator
} from "../state/datasetOpeningCoordinator";


export interface DatasetOpeningSchema {
    rowCount: number;
    columnCount: number;
}


export interface DatasetOpeningPage {
    columns: unknown[];
}


export interface DatasetOpeningControllerOptions<
    Schema extends DatasetOpeningSchema,
    Page extends DatasetOpeningPage
> {
    initialRowCount: number;
    normalizeDatasetName(value: unknown): string;
    prepareDataset(datasetName: string): void;
    showEmptyDataset(): void;
    showInitialLoading(): void;
    showContentLoading(): void;
    hideLoading(): void;
    fetchInitialPage(
        datasetName: string,
        rowCount: number
    ): Promise<Page | null>;
    fetchSchema(datasetName: string): Promise<Schema | null>;
    applyInitialPage(datasetName: string, page: Page): void;
    applySchema(datasetName: string, schema: Schema): void;
    loadFallbackPage(
        schema: Schema,
        initialRowCount: number
    ): Promise<void>;
    showSchemaFailure(): void;
    startVariableWarmup(): void;
    queueViewportRefresh(): void;
}


export interface DatasetOpeningController {
    invalidate(): void;
    open(value: unknown): Promise<void>;
    retryAfterWorkspaceUpdate(datasetNames: string[]): Promise<void>;
}


export const createDatasetOpeningController = function<
    Schema extends DatasetOpeningSchema,
    Page extends DatasetOpeningPage
>(
    options: DatasetOpeningControllerOptions<Schema, Page>
): DatasetOpeningController {
    let openSequence = 0;
    let failedDatasetName = "";
    let workspaceSequence = 0;
    let workspaceDatasetNames: string[] = [];

    const coordinator = createDatasetOpeningCoordinator<Schema, Page>({
        fetchInitialPage: options.fetchInitialPage,
        fetchSchema: options.fetchSchema,
        canApplyInitialPage: (page) => {
            return Array.isArray(page.columns)
                && page.columns.length > 0;
        },
        applyInitialPage: options.applyInitialPage
    });

    const open = async function(value: unknown): Promise<void> {
        const request = ++openSequence;
        const openingWorkspaceSequence = workspaceSequence;
        const datasetName = options.normalizeDatasetName(value);
        failedDatasetName = "";
        options.prepareDataset(datasetName);

        if (!datasetName) {
            coordinator.invalidate();
            options.showEmptyDataset();
            return;
        }

        options.showInitialLoading();

        try {
            const result = await coordinator.open(
                datasetName,
                options.initialRowCount
            );

            if (result.stale || request !== openSequence) {
                return;
            }

            const schema = result.schema;

            if (!schema) {
                failedDatasetName = datasetName;
                if (!result.initialPageReceived) {
                    options.showSchemaFailure();
                }

                return;
            }

            options.applySchema(datasetName, schema);
            if (request !== openSequence) {
                return;
            }

            if (!result.initialPageReceived) {
                options.showContentLoading();
                if (request !== openSequence) {
                    return;
                }
                await options.loadFallbackPage(
                    schema,
                    options.initialRowCount
                );
                if (request !== openSequence) {
                    return;
                }
                options.startVariableWarmup();
            }

            if (request === openSequence) {
                options.queueViewportRefresh();
            }
        } finally {
            if (request === openSequence) {
                options.hideLoading();
                if (
                    request === openSequence
                    && failedDatasetName === datasetName
                    && openingWorkspaceSequence !== workspaceSequence
                    && workspaceDatasetNames.includes(datasetName)
                ) {
                    await open(datasetName);
                }
            }
        }
    };

    return {
        invalidate: function(): void {
            openSequence += 1;
            failedDatasetName = "";
            coordinator.invalidate();
        },
        open,
        retryAfterWorkspaceUpdate: async function(datasetNames): Promise<void> {
            workspaceSequence += 1;
            workspaceDatasetNames = datasetNames;
            const datasetName = failedDatasetName;

            if (datasetName && datasetNames.includes(datasetName)) {
                await open(datasetName);
            }
        }
    };
};
