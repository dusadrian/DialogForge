import {
    planDatasetChanges,
    type DatasetChange
} from "../state/datasetChanges";


export interface DatasetChangeControllerOptions {
    getDatasetName(): string;
    removeDataset(): Promise<void>;
    applyColumnRenames(changes: DatasetChange[]): void;
    applyColumnRemovals(changes: DatasetChange[]): void;
    refreshSchema(): Promise<void>;
    refreshRowSchema(): Promise<void>;
    refreshViewport(): Promise<void>;
    refreshVariables(variableNames: string[]): Promise<void>;
}


export interface DatasetChangeController {
    apply(value: unknown): Promise<void>;
}


export const createDatasetChangeController = function(
    options: DatasetChangeControllerOptions
): DatasetChangeController {
    const apply = async function(value: unknown): Promise<void> {
        const datasetName = options.getDatasetName();

        if (!datasetName) {
            return;
        }

        const plan = planDatasetChanges(value, datasetName);

        if (plan.removed) {
            await options.removeDataset();
            return;
        }

        options.applyColumnRenames(plan.columnRenames);
        options.applyColumnRemovals(plan.columnRemovals);

        if (plan.refreshSchema) {
            await options.refreshSchema();
            return;
        }

        if (plan.refreshRows) {
            await options.refreshRowSchema();
            await options.refreshViewport();
        }

        if (plan.refreshCells) {
            await options.refreshViewport();
        }

        if (plan.variableColumns.length) {
            await options.refreshVariables(plan.variableColumns);
            await options.refreshViewport();
        }
    };

    return {
        apply
    };
};
