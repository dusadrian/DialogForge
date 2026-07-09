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
}


export const createDatasetOpeningController = function<
    Schema extends DatasetOpeningSchema,
    Page extends DatasetOpeningPage
>(
    options: DatasetOpeningControllerOptions<Schema, Page>
): DatasetOpeningController {
    let openSequence = 0;

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
        const datasetName = options.normalizeDatasetName(value);
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

            if (result.stale) {
                return;
            }

            const schema = result.schema;

            if (!schema) {
                if (!result.initialPageReceived) {
                    options.showSchemaFailure();
                }

                return;
            }

            options.applySchema(datasetName, schema);

            if (!result.initialPageReceived) {
                options.showContentLoading();
                await options.loadFallbackPage(
                    schema,
                    options.initialRowCount
                );
                options.startVariableWarmup();
            }

            options.queueViewportRefresh();
        } finally {
            if (request === openSequence) {
                options.hideLoading();
            }
        }
    };

    return {
        invalidate: function(): void {
            openSequence += 1;
            coordinator.invalidate();
        },
        open
    };
};
