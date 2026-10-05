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
    let refreshGeneration = 0;
    let requestSequence = 0;
    const rowRequests = new Map<number, number>();

    const refresh = async function(variableNames: string[]): Promise<void> {
        const generation = refreshGeneration;
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
        const columnCount = schemaColumns.length;
        const columnNames = schemaColumns.slice(firstIndex, lastIndex + 1)
            .map((column) => String(column?.name || ""));
        const request = ++requestSequence;
        const isCurrent = function(): boolean {
            const columns = options.getSchemaColumns();

            return generation === refreshGeneration
                && datasetName === options.getDatasetName()
                && columns.length === columnCount
                && columnNames.every((name, offset) => {
                    return String(columns[firstIndex + offset]?.name || "") === name;
                });
        };

        for (let index = firstIndex; index <= lastIndex; index += 1) {
            rowRequests.set(index, request);
        }

        const out = await options.fetchBatch(datasetName, start, count);

        if (
            !out
            || !Array.isArray(out.items)
            || out.items.length === 0
        ) {
            return;
        }

        if (!isCurrent()) {
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
        let changed = false;
        out.items.forEach((entry, offset) => {
            const index = firstIndex + offset;

            if (
                index <= lastIndex
                && index < next.length
                && rowRequests.get(index) === request
            ) {
                next[index] = entry;
                changed = true;
            }
        });

        if (!changed || !isCurrent()) {
            return;
        }

        options.setVariables(next);

        if (isCurrent() && options.isVariablesActive()) {
            options.renderVariables();
        }
    };

    return {
        invalidate: function(): void {
            refreshGeneration += 1;
            rowRequests.clear();
        },
        refresh
    };
};
