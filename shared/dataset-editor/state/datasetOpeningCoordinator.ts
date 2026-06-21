export interface DatasetOpeningResult<Schema> {
    schema: Schema | null;
    initialPageReceived: boolean;
    initialPageApplied: boolean;
    stale: boolean;
}


export interface DatasetOpeningCoordinatorOptions<Schema, Page> {
    fetchInitialPage(
        datasetName: string,
        rowCount: number
    ): Promise<Page | null>;
    fetchSchema(datasetName: string): Promise<Schema | null>;
    canApplyInitialPage(page: Page): boolean;
    applyInitialPage(datasetName: string, page: Page): void;
}


export interface DatasetOpeningCoordinator<Schema> {
    invalidate(): void;
    open(
        datasetName: string,
        initialRowCount: number
    ): Promise<DatasetOpeningResult<Schema>>;
}


export const createDatasetOpeningCoordinator = function<Schema, Page>(
    options: DatasetOpeningCoordinatorOptions<Schema, Page>
): DatasetOpeningCoordinator<Schema> {
    let sequence = 0;

    const open = async function(
        datasetName: string,
        initialRowCount: number
    ): Promise<DatasetOpeningResult<Schema>> {
        const request = ++sequence;
        const pagePromise = options.fetchInitialPage(
            datasetName,
            initialRowCount
        );
        const initialPage = await pagePromise;

        if (request !== sequence) {
            return {
                schema: null,
                initialPageReceived: false,
                initialPageApplied: false,
                stale: true
            };
        }

        const initialPageApplied = !!initialPage
            && options.canApplyInitialPage(initialPage);

        if (initialPage && initialPageApplied) {
            options.applyInitialPage(datasetName, initialPage);
        }

        const schema = await options.fetchSchema(datasetName);

        if (request !== sequence) {
            return {
                schema: null,
                initialPageReceived: !!initialPage,
                initialPageApplied,
                stale: true
            };
        }

        return {
            schema,
            initialPageReceived: !!initialPage,
            initialPageApplied,
            stale: false
        };
    };

    const invalidate = function(): void {
        sequence += 1;
    };

    return {
        invalidate,
        open
    };
};
