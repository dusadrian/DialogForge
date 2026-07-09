export interface DatasetVariableRowRefreshColumn {
    name?: string;
}


export interface DatasetVariableRowRefreshBatch<Item> {
    items: Item[];
}


export interface DatasetVariableRowRefreshControllerOptions<Item> {
    getDatasetName(): string;
    getSchemaColumns(): DatasetVariableRowRefreshColumn[];
    getVariables(): Item[] | null;
    setVariables(items: Item[]): void;
    fetchBatch(
        datasetName: string,
        start: number,
        count: number
    ): Promise<DatasetVariableRowRefreshBatch<Item> | null>;
    isVariablesActive(): boolean;
    renderVariables(): void;
}


const normalizeNames = function(variableNames: string[]): string[] {
    return variableNames
        .map((name) => String(name || "").trim())
        .filter(Boolean);
};


export const createDatasetVariableRowRefreshController = function<Item>(
    options: DatasetVariableRowRefreshControllerOptions<Item>
) {
    const refresh = async function(variableNames: string[]): Promise<void> {
        const datasetName = options.getDatasetName();
        const variables = options.getVariables();

        if (
            !datasetName
            || !Array.isArray(variables)
            || variables.length === 0
        ) {
            return;
        }

        const names = normalizeNames(variableNames);
        if (names.length === 0) {
            return;
        }

        const schemaColumns = options.getSchemaColumns();
        const indexes = names
            .map((name) => {
                return schemaColumns.findIndex((column) => {
                    return String(column?.name || "") === name;
                });
            })
            .filter((index) => index >= 0);

        if (indexes.length === 0) {
            return;
        }

        const firstIndex = Math.min(...indexes);
        const lastIndex = Math.max(...indexes);
        const start = firstIndex + 1;
        const count = (lastIndex - firstIndex) + 1;
        const out = await options.fetchBatch(datasetName, start, count);

        if (
            !out
            || !Array.isArray(out.items)
            || out.items.length === 0
        ) {
            return;
        }

        if (datasetName !== options.getDatasetName()) {
            return;
        }

        const current = options.getVariables();
        if (
            !Array.isArray(current)
            || current.length === 0
        ) {
            return;
        }

        const next = current.slice();
        out.items.forEach((entry, offset) => {
            next[start - 1 + offset] = entry;
        });
        options.setVariables(next);

        if (options.isVariablesActive()) {
            options.renderVariables();
        }
    };

    return {
        refresh
    };
};
