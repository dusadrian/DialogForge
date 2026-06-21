import type { DatasetEditorSelection } from "../state/datasetEditorState";


export interface DatasetEditorContextAction {
    id: string;
    label: string;
    command: string;
}


const action = function(id: string, label: string, command: string): DatasetEditorContextAction {
    return { id, label, command };
};


export const selectionContainsVariableMetadataCell = function(
    selection: DatasetEditorSelection,
    rowIndex: number,
    metadataKey: string
): boolean {
    if (selection.kind !== "metadata-range") {
        return false;
    }

    const start = Math.min(selection.anchorRowIndex, selection.focusRowIndex);
    const end = Math.max(selection.anchorRowIndex, selection.focusRowIndex);

    return metadataKey === selection.metadataKey && rowIndex >= start && rowIndex <= end;
};


export const getDatasetEditorContextActions = function(selection: DatasetEditorSelection): DatasetEditorContextAction[] {
    if (selection.kind === "data-cell") {
        return [
            action("data-cell.edit", "Edit", "dataset.beginEdit"),
            action("data-cell.copy", "Copy", "dataset.copy"),
            action("data-cell.paste", "Paste", "dataset.pasteFromClipboard"),
            action("data-row.insert-after", "Insert row after", "dataset.insertRow.after"),
            action("data-row.remove", "Remove row", "dataset.removeRow"),
            action("data-column.insert-after", "Insert column after", "dataset.insertColumn.after"),
            action("data-column.remove", "Remove column", "dataset.removeColumn")
        ];
    }

    if (selection.kind === "data-row") {
        return [
            action("data-row.copy", "Copy row", "dataset.copy"),
            action("data-row.paste", "Paste row", "dataset.pasteFromClipboard"),
            action("data-row.rename", "Rename row", "dataset.renameRow"),
            action("data-row.insert-before", "Insert row before", "dataset.insertRow.before"),
            action("data-row.insert-after", "Insert row after", "dataset.insertRow.after"),
            action("data-row.remove", "Remove row", "dataset.removeRow")
        ];
    }

    if (selection.kind === "data-column") {
        return [
            action("data-column.copy", "Copy column", "dataset.copyValues"),
            action("data-column.copy-values-and-labels", "Copy values and labels", "dataset.copy"),
            action("data-column.paste", "Paste column", "dataset.pasteFromClipboard"),
            action("data-column.insert-before", "Insert column before", "dataset.insertColumn.before"),
            action("data-column.insert-after", "Insert column after", "dataset.insertColumn.after"),
            action("data-column.sort-ascending", "Sort ascending", "dataset.sortRows.ascending"),
            action("data-column.sort-descending", "Sort descending", "dataset.sortRows.descending"),
            action("data-column.rename", "Rename column", "dataset.renameColumn"),
            action("data-column.remove", "Remove column", "dataset.removeColumn")
        ];
    }

    if (selection.kind === "variable-cell") {
        const actions = [
            action("variable-cell.edit", "Edit", "dataset.beginEdit"),
            action("variable-cell.copy", "Copy", "dataset.copy"),
            action("variable-cell.paste", "Paste", "dataset.pasteFromClipboard"),
            action("variable-cell.update", "Update metadata", "dataset.updateVariableMetadata")
        ];

        if (selection.metadataKey === "values") {
            actions.push(action("variable-cell.value-labels", "Update value labels", "dataset.updateValueLabels"));
            actions.push(action("variable-cell.declared-missing", "Update missing values", "dataset.updateDeclaredMissing"));
        }

        return actions;
    }

    if (selection.kind === "metadata-range") {
        return [
            action("metadata-range.paste", "Paste", "dataset.pasteFromClipboard")
        ];
    }

    if (selection.kind === "variable-row") {
        return [
            action("variable-row.copy", "Copy row", "dataset.copy"),
            action("variable-row.insert-before", "Add row before", "dataset.insertColumn.before"),
            action("variable-row.insert-after", "Add row after", "dataset.insertColumn.after"),
            action("variable-row.remove", "Remove row", "dataset.removeColumn")
        ];
    }

    return [];
};


export const contextMenuActionsApi = {
    getDatasetEditorContextActions,
    selectionContainsVariableMetadataCell
};
