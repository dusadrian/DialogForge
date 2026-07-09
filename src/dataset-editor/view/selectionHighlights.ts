import type { DatasetEditorSelection } from "../state/datasetEditorState";


export const isDataPreviewCellSelected = function(
    selection: DatasetEditorSelection,
    rowIndex: number,
    columnName: string
): boolean {
    return selection.kind === "data-cell" && selection.rowIndex === rowIndex && selection.columnName === columnName;
};


export const isDataPreviewRowSelected = function(selection: DatasetEditorSelection, rowIndex: number): boolean {
    return selection.kind === "data-row" && selection.rowIndex === rowIndex;
};


export const isDataPreviewColumnSelected = function(selection: DatasetEditorSelection, columnName: string): boolean {
    return selection.kind === "data-column" && selection.columnName === columnName;
};


export const isVariableMetadataCellSelected = function(
    selection: DatasetEditorSelection,
    rowIndex: number,
    metadataKey: string
): boolean {
    if (selection.kind === "variable-cell") {
        return selection.rowIndex === rowIndex && selection.metadataKey === metadataKey;
    }

    if (selection.kind !== "metadata-range" || selection.metadataKey !== metadataKey) {
        return false;
    }

    const start = Math.min(selection.anchorRowIndex, selection.focusRowIndex);
    const end = Math.max(selection.anchorRowIndex, selection.focusRowIndex);

    return rowIndex >= start && rowIndex <= end;
};


export const isVariableMetadataRowSelected = function(selection: DatasetEditorSelection, rowIndex: number): boolean {
    return selection.kind === "variable-row" && selection.rowIndex === rowIndex;
};


export const selectionHighlightsApi = {
    isDataPreviewCellSelected,
    isDataPreviewRowSelected,
    isDataPreviewColumnSelected,
    isVariableMetadataCellSelected,
    isVariableMetadataRowSelected
};
