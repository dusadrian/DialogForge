export interface DatasetVariableMetadataLookupControllerOptions<Item> {
    getDatasetName: () => string;
    getVariables: () => Item[] | null;
    isLoaded: () => boolean;
    isFailed: () => boolean;
    getLoadSequence: () => number;
    reset: () => void;
    loadAll: (showLoadingState: boolean) => Promise<void>;
    renderVariables: () => void;
    renderEmpty: () => void;
    renderFailure: () => void;
}

export interface DatasetVariableMetadataLookupController<Item> {
    getForColumn: (column: string) => Promise<Item | null>;
    refresh: () => Promise<void>;
}

export const createDatasetVariableMetadataLookupController = function<
    Item extends { name?: unknown }
>(
    options: DatasetVariableMetadataLookupControllerOptions<Item>
): DatasetVariableMetadataLookupController<Item> {
    const getForColumn = async function(
        column: string
    ): Promise<Item | null> {
        const columnName = String(column || "").trim();
        const datasetName = options.getDatasetName();
        const loadSequence = options.getLoadSequence();

        if (!columnName || !datasetName) {
            return null;
        }

        if (!options.isLoaded()) {
            await options.loadAll(false);
        }

        if (
            datasetName !== options.getDatasetName()
            || loadSequence !== options.getLoadSequence()
            || options.isFailed()
        ) {
            return null;
        }

        const variables = Array.isArray(options.getVariables())
            ? options.getVariables() || []
            : [];

        return variables.find((entry) => {
            return String(entry?.name || "") === columnName;
        }) || null;
    };

    const refresh = async function(): Promise<void> {
        const datasetName = options.getDatasetName();
        if (!datasetName) {
            return;
        }

        options.reset();
        const loadSequence = options.getLoadSequence();
        if (datasetName !== options.getDatasetName()) {
            return;
        }
        await options.loadAll(false);

        if (
            datasetName !== options.getDatasetName()
            || loadSequence !== options.getLoadSequence()
        ) {
            return;
        }

        const variables = options.getVariables();

        if (Array.isArray(variables) && variables.length) {
            options.renderVariables();
        }
        else if (options.isFailed()) {
            options.renderFailure();
        }
        else if (options.isLoaded()) {
            options.renderEmpty();
        }
    };

    return {
        getForColumn,
        refresh
    };
};
