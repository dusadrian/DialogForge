type InsertPosition = "before" | "after";


interface DatasetStructuralSchema {
    columns: Array<{
        name: string;
    }>;
}


export interface DatasetStructuralClient {
    sortRows: (
        datasetName: string,
        columnName: string,
        options: {
            decreasing: boolean;
            naLast: boolean;
            emptyLast: boolean;
        }
    ) => Promise<{ command: string } | null>;
    insertColumn: (
        datasetName: string,
        columnName: string,
        nextName: string,
        position: InsertPosition
    ) => Promise<unknown | null>;
    removeColumn: (
        datasetName: string,
        columnName: string
    ) => Promise<unknown | null>;
    insertRow: (
        datasetName: string,
        rowNumber: number,
        nextName: string,
        position: InsertPosition
    ) => Promise<unknown | null>;
    removeRow: (
        datasetName: string,
        rowNumber: number
    ) => Promise<unknown | null>;
}


export interface DatasetStructuralActionsOptions {
    client: DatasetStructuralClient;
    getDatasetName: () => string;
    getSchema: () => DatasetStructuralSchema | null;
    getLoadedRowNames: () => string[];
    translate: (key: string) => string;
    confirm: (message: string) => boolean;
    hideHeaderMenu: () => void;
    hideRowMenu: () => void;
    showLoading: (message: string) => () => void;
    showNotice: (message: string) => void;
    rememberCommand: (command: string) => void;
    resetSelectionAfterSort: (columnName: string) => void;
    refreshDataset: (datasetName: string) => Promise<void>;
}


export interface DatasetStructuralActions {
    invalidate: () => void;
    sortRowsByColumn: (
        columnName: string,
        decreasing: boolean
    ) => Promise<void>;
    insertColumn: (
        columnName: string,
        position: InsertPosition
    ) => Promise<void>;
    removeColumn: (columnName: string) => Promise<void>;
    insertRow: (
        rowNumber: number,
        position: InsertPosition
    ) => Promise<void>;
    removeRow: (rowNumber: number) => Promise<void>;
}


const interpolateName = function(template: string, name: string): string {
    return template.replace(/\{name\}/g, name);
};


const interpolateNumber = function(template: string, value: number): string {
    return template.replace(/\{number\}/g, String(value));
};


const suggestedColumnName = function(
    schema: DatasetStructuralSchema | null,
    insertAt: number
): string {
    const usedNames = new Set(
        (schema?.columns || []).map((entry) => {
            return String(entry?.name || "").trim();
        }).filter(Boolean)
    );
    let suffix = Math.max(1, Number(insertAt) || 1);

    while (usedNames.has("V" + suffix)) {
        suffix += 1;
    }

    return "V" + suffix;
};


const suggestedRowName = function(
    rowNames: string[],
    insertAt: number
): string {
    const usedNames = new Set(
        rowNames.map((entry) => {
            return String(entry || "").trim();
        }).filter(Boolean)
    );
    let suffix = Math.max(1, Number(insertAt) || 1);

    while (usedNames.has(String(suffix))) {
        suffix += 1;
    }

    return String(suffix);
};


export const createDatasetStructuralActions = function(
    options: DatasetStructuralActionsOptions
): DatasetStructuralActions {
    let operationSequence = 0;

    const captureAction = function(datasetName: string): () => boolean {
        const sequence = ++operationSequence;

        return function(): boolean {
            return sequence === operationSequence
                && datasetName === options.getDatasetName();
        };
    };

    const sortRowsByColumn = async function(
        columnInput: string,
        decreasing: boolean
    ): Promise<void> {
        const datasetName = options.getDatasetName();
        const columnName = String(columnInput || "").trim();

        if (!datasetName || !columnName) {
            return;
        }

        const isCurrent = captureAction(datasetName);
        options.hideHeaderMenu();
        if (!isCurrent()) {
            return;
        }
        const releaseLoading = options.showLoading(
            options.translate(
                decreasing
                    ? "Sorting descending..."
                    : "Sorting ascending..."
            )
        );

        try {
            if (!isCurrent()) {
                return;
            }
            const result = await options.client.sortRows(
                datasetName,
                columnName,
                {
                    decreasing,
                    naLast: true,
                    emptyLast: true
                }
            );

            if (!isCurrent()) {
                return;
            }
            if (!result) {
                options.showNotice(options.translate("Sort failed"));
                return;
            }

            options.rememberCommand(String(result.command || ""));
            if (!isCurrent()) {
                return;
            }
            options.resetSelectionAfterSort(columnName);
            if (!isCurrent()) {
                return;
            }
            await options.refreshDataset(datasetName);
            if (!isCurrent()) {
                return;
            }
            options.showNotice(
                options.translate(
                    decreasing
                        ? "Sorted descending"
                        : "Sorted ascending"
                )
            );
        }
        catch (error) {
            if (isCurrent()) {
                throw error;
            }
        }
        finally {
            releaseLoading();
        }
    };

    const insertColumn = async function(
        columnInput: string,
        position: InsertPosition
    ): Promise<void> {
        const datasetName = options.getDatasetName();
        const columnName = String(columnInput || "").trim();

        if (!datasetName || !columnName) {
            return;
        }

        const isCurrent = captureAction(datasetName);
        options.hideHeaderMenu();
        if (!isCurrent()) {
            return;
        }
        const schema = options.getSchema();
        const currentIndex = (schema?.columns || []).findIndex((entry) => {
            return String(entry?.name || "") === columnName;
        });

        if (currentIndex < 0) {
            options.showNotice(
                options.translate("Column insertion failed")
            );
            return;
        }

        const insertAt = position === "before"
            ? currentIndex + 1
            : currentIndex + 2;
        const nextName = suggestedColumnName(schema, insertAt);
        const releaseLoading = options.showLoading(options.translate("Adding column..."));

        try {
            if (!isCurrent()) {
                return;
            }
            const result = await options.client.insertColumn(
                datasetName,
                columnName,
                nextName,
                position
            );

            if (!isCurrent()) {
                return;
            }
            options.showNotice(
                options.translate(
                    result
                        ? "Column added"
                        : "Column insertion failed"
                )
            );
        }
        catch (error) {
            if (isCurrent()) {
                throw error;
            }
        }
        finally {
            releaseLoading();
        }
    };

    const removeColumn = async function(
        columnInput: string
    ): Promise<void> {
        const datasetName = options.getDatasetName();
        const columnName = String(columnInput || "").trim();

        if (!datasetName || !columnName) {
            return;
        }

        const isCurrent = captureAction(datasetName);
        options.hideHeaderMenu();
        if (!isCurrent()) {
            return;
        }
        const confirmed = options.confirm(
            interpolateName(
                options.translate('Remove column "{name}"?'),
                columnName
            )
        );

        if (!confirmed || !isCurrent()) {
            return;
        }

        const releaseLoading = options.showLoading(options.translate("Removing column..."));

        try {
            if (!isCurrent()) {
                return;
            }
            const result = await options.client.removeColumn(
                datasetName,
                columnName
            );

            if (!isCurrent()) {
                return;
            }
            options.showNotice(
                options.translate(
                    result
                        ? "Column removed"
                        : "Column removal failed"
                )
            );
        }
        catch (error) {
            if (isCurrent()) {
                throw error;
            }
        }
        finally {
            releaseLoading();
        }
    };

    const insertRow = async function(
        rowInput: number,
        position: InsertPosition
    ): Promise<void> {
        const datasetName = options.getDatasetName();
        const rowNumber = Number(rowInput);

        if (
            !datasetName
            || !Number.isFinite(rowNumber)
            || rowNumber < 1
        ) {
            return;
        }

        const isCurrent = captureAction(datasetName);
        options.hideRowMenu();
        if (!isCurrent()) {
            return;
        }
        const insertAt = position === "before"
            ? rowNumber
            : rowNumber + 1;
        const nextName = suggestedRowName(
            options.getLoadedRowNames(),
            insertAt
        );
        const releaseLoading = options.showLoading(options.translate("Adding row..."));

        try {
            if (!isCurrent()) {
                return;
            }
            const result = await options.client.insertRow(
                datasetName,
                rowNumber,
                nextName,
                position
            );

            if (!isCurrent()) {
                return;
            }
            options.showNotice(
                options.translate(
                    result
                        ? "Row added"
                        : "Row insertion failed"
                )
            );
        }
        catch (error) {
            if (isCurrent()) {
                throw error;
            }
        }
        finally {
            releaseLoading();
        }
    };

    const removeRow = async function(rowInput: number): Promise<void> {
        const datasetName = options.getDatasetName();
        const rowNumber = Number(rowInput);

        if (
            !datasetName
            || !Number.isFinite(rowNumber)
            || rowNumber < 1
        ) {
            return;
        }

        const isCurrent = captureAction(datasetName);
        options.hideRowMenu();
        if (!isCurrent()) {
            return;
        }
        const confirmed = options.confirm(
            interpolateNumber(
                options.translate('Delete row "{number}"?'),
                rowNumber
            )
        );

        if (!confirmed || !isCurrent()) {
            return;
        }

        const releaseLoading = options.showLoading(options.translate("Deleting row..."));

        try {
            if (!isCurrent()) {
                return;
            }
            const result = await options.client.removeRow(
                datasetName,
                rowNumber
            );

            if (!isCurrent()) {
                return;
            }
            options.showNotice(
                options.translate(
                    result
                        ? "Row deleted"
                        : "Row deletion failed"
                )
            );
        }
        catch (error) {
            if (isCurrent()) {
                throw error;
            }
        }
        finally {
            releaseLoading();
        }
    };

    return {
        invalidate: function(): void {
            operationSequence += 1;
        },
        sortRowsByColumn,
        insertColumn,
        removeColumn,
        insertRow,
        removeRow
    };
};
