import type {
    TabularPreviewSnapshot
} from "../../runtime/provider-contract/runtimeProvider";


export interface DatasetNavigationCommandBindings {
    getPreview(): TabularPreviewSnapshot | null;
    prompt(message: string, defaultValue: string): string | null;
    getGoToDialogId(): string;
    executeProductGoToDialog(
        dialogId: string,
        mode: "case" | "variable"
    ): void;
    selectRow(objectName: string, rowIndex: number): void;
    selectColumn(objectName: string, columnName: string): void;
}


export const createDatasetNavigationCommandController = function(
    bindings: DatasetNavigationCommandBindings
) {
    const goToCase = function(): void {
        const dialogId = bindings.getGoToDialogId();

        if (dialogId) {
            bindings.executeProductGoToDialog(dialogId, "case");
            return;
        }

        const value = bindings.prompt("Go to case", "1");
        const rowNumber = Number.parseInt(String(value || ""), 10);
        const preview = bindings.getPreview();

        if (
            Number.isFinite(rowNumber)
            && rowNumber > 0
            && preview?.objectName
        ) {
            bindings.selectRow(preview.objectName, rowNumber - 1);
        }
    };

    const goToVariable = function(): void {
        const dialogId = bindings.getGoToDialogId();

        if (dialogId) {
            bindings.executeProductGoToDialog(dialogId, "variable");
            return;
        }

        const value = String(
            bindings.prompt("Go to variable", "") || ""
        ).trim();
        const normalizedIndex = Number.parseInt(value, 10);
        const preview = bindings.getPreview();
        const columns = preview?.columns || [];
        const column = Number.isFinite(normalizedIndex) && normalizedIndex > 0
            ? columns[normalizedIndex - 1]
            : columns.find((candidate) => candidate.name === value);

        if (column && preview?.objectName) {
            bindings.selectColumn(preview.objectName, column.name);
        }
    };

    return {
        goToCase,
        goToVariable
    };
};
