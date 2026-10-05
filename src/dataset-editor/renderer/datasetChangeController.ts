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
    refreshRowSchema(isCurrent: () => boolean): Promise<void>;
    refreshViewport(): Promise<void>;
    refreshVariables(variableNames: string[]): Promise<void>;
}


export interface DatasetChangeController {
    invalidate(): void;
    apply(value: unknown): Promise<void>;
}


export const createDatasetChangeController = function(
    options: DatasetChangeControllerOptions
): DatasetChangeController {
    let changeGeneration = 0;

    const apply = async function(value: unknown): Promise<void> {
        const generation = changeGeneration;
        const datasetName = options.getDatasetName();

        if (!datasetName) {
            return;
        }

        const plan = planDatasetChanges(value, datasetName);
        const isCurrent = function(): boolean {
            return generation === changeGeneration
                && datasetName === options.getDatasetName();
        };

        if (plan.removed) {
            await options.removeDataset();
            return;
        }

        options.applyColumnRenames(plan.columnRenames);
        if (!isCurrent()) {
            return;
        }
        options.applyColumnRemovals(plan.columnRemovals);
        if (!isCurrent()) {
            return;
        }

        if (plan.refreshSchema) {
            await options.refreshSchema();
            return;
        }

        if (plan.refreshRows) {
            await options.refreshRowSchema(isCurrent);
            if (!isCurrent()) {
                return;
            }
            await options.refreshViewport();
            if (!isCurrent()) {
                return;
            }
        }

        if (plan.refreshCells) {
            await options.refreshViewport();
            if (!isCurrent()) {
                return;
            }
        }

        if (plan.variableColumns.length) {
            await options.refreshVariables(plan.variableColumns);
            if (!isCurrent()) {
                return;
            }
            await options.refreshViewport();
        }
    };

    return {
        invalidate: function(): void {
            changeGeneration += 1;
        },
        apply
    };
};
