export interface DatasetLocalColumnRenameColumn {
    name?: string;
}


export interface DatasetLocalColumnRenameControllerOptions<
    Column extends DatasetLocalColumnRenameColumn,
    Variable extends DatasetLocalColumnRenameColumn
> {
    getSchemaColumns(): Column[];
    getLoadedColumns(): Column[];
    getVariables(): Variable[] | null;
    renameSelection(previousName: string, nextName: string): void;
}


export const createDatasetLocalColumnRenameController = function<
    Column extends DatasetLocalColumnRenameColumn,
    Variable extends DatasetLocalColumnRenameColumn
>(
    options: DatasetLocalColumnRenameControllerOptions<Column, Variable>
) {
    const renameColumnCollection = function(
        columns: DatasetLocalColumnRenameColumn[],
        previousName: string,
        nextName: string
    ): void {
        columns.forEach((entry) => {
            if (String(entry?.name || "") === previousName) {
                entry.name = nextName;
            }
        });
    };

    const apply = function(column: string, nextName: string): void {
        const previousName = String(column || "").trim();
        const updatedName = String(nextName || "").trim();

        if (
            !previousName
            || !updatedName
            || previousName === updatedName
        ) {
            return;
        }

        renameColumnCollection(
            options.getSchemaColumns(),
            previousName,
            updatedName
        );
        renameColumnCollection(
            options.getLoadedColumns(),
            previousName,
            updatedName
        );

        const variables = options.getVariables();
        if (Array.isArray(variables)) {
            renameColumnCollection(
                variables,
                previousName,
                updatedName
            );
        }

        options.renameSelection(previousName, updatedName);
    };

    return {
        apply
    };
};
