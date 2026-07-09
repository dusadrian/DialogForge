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
    showLoading: (message: string) => void;
    hideLoading: () => void;
    showNotice: (message: string) => void;
    rememberCommand: (command: string) => void;
    resetSelectionAfterSort: (columnName: string) => void;
    refreshDataset: (datasetName: string) => Promise<void>;
}


export interface DatasetStructuralActions {
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
    const sortRowsByColumn = async function(
        columnInput: string,
        decreasing: boolean
    ): Promise<void> {
        const datasetName = options.getDatasetName();
        const columnName = String(columnInput || "").trim();

        if (!datasetName || !columnName) {
            return;
        }

        options.hideHeaderMenu();
        options.showLoading(
            options.translate(
                decreasing
                    ? "Sorting descending..."
                    : "Sorting ascending..."
            )
        );

        try {
            const result = await options.client.sortRows(
                datasetName,
                columnName,
                {
                    decreasing,
                    naLast: true,
                    emptyLast: true
                }
            );

            if (!result) {
                options.showNotice(options.translate("Sort failed"));
                return;
            }

            options.rememberCommand(String(result.command || ""));
            options.resetSelectionAfterSort(columnName);
            await options.refreshDataset(datasetName);
            options.showNotice(
                options.translate(
                    decreasing
                        ? "Sorted descending"
                        : "Sorted ascending"
                )
            );
        }
        finally {
            options.hideLoading();
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

        options.hideHeaderMenu();
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
        options.showLoading(options.translate("Adding column..."));

        try {
            const result = await options.client.insertColumn(
                datasetName,
                columnName,
                nextName,
                position
            );

            options.showNotice(
                options.translate(
                    result
                        ? "Column added"
                        : "Column insertion failed"
                )
            );
        }
        finally {
            options.hideLoading();
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

        options.hideHeaderMenu();
        const confirmed = options.confirm(
            interpolateName(
                options.translate('Remove column "{name}"?'),
                columnName
            )
        );

        if (!confirmed) {
            return;
        }

        options.showLoading(options.translate("Removing column..."));

        try {
            const result = await options.client.removeColumn(
                datasetName,
                columnName
            );

            options.showNotice(
                options.translate(
                    result
                        ? "Column removed"
                        : "Column removal failed"
                )
            );
        }
        finally {
            options.hideLoading();
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

        options.hideRowMenu();
        const insertAt = position === "before"
            ? rowNumber
            : rowNumber + 1;
        const nextName = suggestedRowName(
            options.getLoadedRowNames(),
            insertAt
        );
        options.showLoading(options.translate("Adding row..."));

        try {
            const result = await options.client.insertRow(
                datasetName,
                rowNumber,
                nextName,
                position
            );

            options.showNotice(
                options.translate(
                    result
                        ? "Row added"
                        : "Row insertion failed"
                )
            );
        }
        finally {
            options.hideLoading();
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

        options.hideRowMenu();
        const confirmed = options.confirm(
            interpolateNumber(
                options.translate('Delete row "{number}"?'),
                rowNumber
            )
        );

        if (!confirmed) {
            return;
        }

        options.showLoading(options.translate("Deleting row..."));

        try {
            const result = await options.client.removeRow(
                datasetName,
                rowNumber
            );

            options.showNotice(
                options.translate(
                    result
                        ? "Row deleted"
                        : "Row deletion failed"
                )
            );
        }
        finally {
            options.hideLoading();
        }
    };

    return {
        sortRowsByColumn,
        insertColumn,
        removeColumn,
        insertRow,
        removeRow
    };
};
