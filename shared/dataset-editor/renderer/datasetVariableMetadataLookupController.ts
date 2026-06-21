export interface DatasetVariableMetadataLookupControllerOptions<Item> {
    getDatasetName: () => string;
    getVariables: () => Item[] | null;
    isLoaded: () => boolean;
    reset: () => void;
    loadAll: (showLoadingState: boolean) => Promise<void>;
    renderVariables: () => void;
    renderEmpty: () => void;
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

        if (!columnName || !options.getDatasetName()) {
            return null;
        }

        if (!options.isLoaded()) {
            await options.loadAll(false);
        }

        const variables = Array.isArray(options.getVariables())
            ? options.getVariables() || []
            : [];

        return variables.find((entry) => {
            return String(entry?.name || "") === columnName;
        }) || null;
    };

    const refresh = async function(): Promise<void> {
        if (!options.getDatasetName()) {
            return;
        }

        options.reset();
        await options.loadAll(false);

        const variables = options.getVariables();

        if (Array.isArray(variables) && variables.length) {
            options.renderVariables();
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
