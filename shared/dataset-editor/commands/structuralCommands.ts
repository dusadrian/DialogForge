import type {
    ColumnInsertRequest,
    ColumnRemoveRequest,
    ColumnRenameRequest,
    RowInsertRequest,
    RowNameUpdateRequest,
    RowRemoveRequest,
    RowSortRequest
} from "../../runtime/provider-contract/runtimeProvider";
import type { DatasetEditorSelection } from "../state/datasetEditorState";


type InsertPosition = "before" | "after";


export interface DatasetEditorCommandRequest<T> {
    status: string;
    request: T | null;
    message: string;
}


const normalizePosition = function(position: string): InsertPosition {
    return position === "before" ? "before" : "after";
};


const unavailable = function<T>(message: string): DatasetEditorCommandRequest<T> {
    return {
        status: "unavailable",
        request: null,
        message
    };
};


const ready = function<T>(request: T): DatasetEditorCommandRequest<T> {
    return {
        status: "ready",
        request,
        message: "Dataset editor command request created."
    };
};


const getSelectedColumnName = function(selection: DatasetEditorSelection): string {
    if (selection.kind === "data-column" || selection.kind === "data-cell" || selection.kind === "variable-row") {
        return selection.columnName;
    }

    return "";
};


const getSelectedRowIndex = function(selection: DatasetEditorSelection): number {
    if (selection.kind === "data-row" || selection.kind === "data-cell") {
        return selection.rowIndex;
    }

    return -1;
};


export const createSuggestedColumnName = function(
    columnNames: string[],
    referenceName: string,
    position: string
): string {
    const names = columnNames.map((name) => {
        return String(name || "").trim();
    }).filter(Boolean);
    const referenceIndex = names.indexOf(String(referenceName || "").trim());
    const insertIndex = referenceIndex < 0
        ? names.length + 1
        : referenceIndex + (normalizePosition(position) === "before" ? 1 : 2);
    let candidate = "column" + insertIndex;
    let suffix = 1;

    while (names.indexOf(candidate) >= 0) {
        suffix += 1;
        candidate = "column" + insertIndex + "_" + suffix;
    }

    return candidate;
};


export const createColumnInsertFromSelection = function(
    selection: DatasetEditorSelection,
    newName: string,
    position: string
): DatasetEditorCommandRequest<ColumnInsertRequest> {
    const referenceName = getSelectedColumnName(selection);
    const columnName = String(newName || "").trim();

    if (!selection.objectName || !referenceName) {
        return unavailable("Select a data column before inserting a column.");
    }

    if (!columnName) {
        return unavailable("New column name is required.");
    }

    return ready({
        objectName: selection.objectName,
        referenceName,
        newName: columnName,
        position: normalizePosition(position),
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const createColumnRemoveFromSelection = function(
    selection: DatasetEditorSelection
): DatasetEditorCommandRequest<ColumnRemoveRequest> {
    const columnName = getSelectedColumnName(selection);

    if (!selection.objectName || !columnName) {
        return unavailable("Select a data column before removing a column.");
    }

    return ready({
        objectName: selection.objectName,
        columnName,
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const createColumnRemoveConfirmationMessage = function(request: ColumnRemoveRequest): string {
    return `Remove column "${request.columnName}"?`;
};


export const createColumnRenameFromSelection = function(
    selection: DatasetEditorSelection,
    newName: string
): DatasetEditorCommandRequest<ColumnRenameRequest> {
    const fromName = getSelectedColumnName(selection);
    const toName = String(newName || "").trim();

    if (!selection.objectName || !fromName) {
        return unavailable("Select a data column before renaming a column.");
    }

    if (!toName) {
        return unavailable("New column name is required.");
    }

    return ready({
        objectName: selection.objectName,
        fromName,
        toName,
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const createColumnRenameFromInputs = function(
    objectName: string,
    fromName: string,
    newName: string
): DatasetEditorCommandRequest<ColumnRenameRequest> {
    const targetObject = String(objectName || "").trim();
    const sourceName = String(fromName || "").trim();
    const targetName = String(newName || "").trim();

    if (!targetObject || !sourceName) {
        return unavailable("Source column is required before renaming a column.");
    }

    if (!targetName) {
        return unavailable("New column name is required.");
    }

    return ready({
        objectName: targetObject,
        fromName: sourceName,
        toName: targetName,
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const createRowInsertFromSelection = function(
    selection: DatasetEditorSelection,
    position: string
): DatasetEditorCommandRequest<RowInsertRequest> {
    const rowIndex = getSelectedRowIndex(selection);

    if (!selection.objectName || rowIndex < 0) {
        return unavailable("Select a data row before inserting a row.");
    }

    return ready({
        objectName: selection.objectName,
        rowIndex,
        name: "",
        position: normalizePosition(position),
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const createRowRemoveFromSelection = function(
    selection: DatasetEditorSelection
): DatasetEditorCommandRequest<RowRemoveRequest> {
    const rowIndex = getSelectedRowIndex(selection);

    if (!selection.objectName || rowIndex < 0) {
        return unavailable("Select a data row before removing a row.");
    }

    return ready({
        objectName: selection.objectName,
        rowIndex,
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const createRowRemoveConfirmationMessage = function(request: RowRemoveRequest): string {
    return `Delete row "${request.rowIndex + 1}"?`;
};


export const createRowNameUpdateFromSelection = function(
    selection: DatasetEditorSelection,
    name: string
): DatasetEditorCommandRequest<RowNameUpdateRequest> {
    const rowIndex = getSelectedRowIndex(selection);
    const rowName = String(name || "").trim();

    if (!selection.objectName || rowIndex < 0) {
        return unavailable("Select a data row before renaming a row.");
    }

    if (!rowName) {
        return unavailable("Row name is required.");
    }

    return ready({
        objectName: selection.objectName,
        rowIndex,
        name: rowName,
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const createRowNameUpdateFromInputs = function(
    objectName: string,
    rowIndex: number,
    name: string
): DatasetEditorCommandRequest<RowNameUpdateRequest> {
    const targetObject = String(objectName || "").trim();
    const targetRow = Math.round(Number(rowIndex));
    const rowName = String(name || "").trim();

    if (!targetObject || !Number.isFinite(targetRow) || targetRow < 0) {
        return unavailable("Data row is required before renaming a row.");
    }

    if (!rowName) {
        return unavailable("Row name is required.");
    }

    return ready({
        objectName: targetObject,
        rowIndex: targetRow,
        name: rowName,
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const createRowSortFromSelection = function(
    selection: DatasetEditorSelection,
    direction: string
): DatasetEditorCommandRequest<RowSortRequest> {
    const columnName = getSelectedColumnName(selection);

    if (!selection.objectName || !columnName) {
        return unavailable("Select a data column before sorting rows.");
    }

    return ready({
        objectName: selection.objectName,
        columnName,
        direction: direction === "descending" ? "descending" : "ascending",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const structuralCommandsApi = {
    createColumnInsertFromSelection,
    createColumnRemoveConfirmationMessage,
    createColumnRemoveFromSelection,
    createColumnRenameFromInputs,
    createColumnRenameFromSelection,
    createSuggestedColumnName,
    createRowInsertFromSelection,
    createRowNameUpdateFromInputs,
    createRowNameUpdateFromSelection,
    createRowRemoveConfirmationMessage,
    createRowRemoveFromSelection,
    createRowSortFromSelection
};
