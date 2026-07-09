import type {
    CellUpdateRequest,
    VariableMetadataUpdateRequest
} from "../../runtime/provider-contract/runtimeProvider";
import type { DatasetEditorSelection } from "../state/datasetEditorState";


export interface DatasetEditorEditCommand {
    status: string;
    kind: string;
    cellRequest: CellUpdateRequest | null;
    metadataRequest: VariableMetadataUpdateRequest | null;
    message: string;
}


export interface DatasetEditorEditStateCommand {
    status: string;
    value: string;
    message: string;
}


const unavailable = function(message: string): DatasetEditorEditCommand {
    return {
        status: "unavailable",
        kind: "none",
        cellRequest: null,
        metadataRequest: null,
        message
    };
};


const unavailableEditState = function(message: string): DatasetEditorEditStateCommand {
    return {
        status: "unavailable",
        value: "",
        message
    };
};


export const createEditStartFromSelection = function(
    selection: DatasetEditorSelection,
    value: string
): DatasetEditorEditStateCommand {
    if (selection.kind !== "data-cell" && selection.kind !== "variable-cell") {
        return unavailableEditState("Select a data cell or variable metadata cell before editing.");
    }

    return {
        status: "ready",
        value,
        message: "Dataset editor edit state can start."
    };
};


export const createEditCommitFromSelection = function(
    selection: DatasetEditorSelection,
    variableName: string,
    value: string
): DatasetEditorEditCommand {
    if (selection.kind === "data-cell") {
        if (!selection.objectName || selection.rowIndex < 0 || !selection.columnName) {
            return unavailable("Select a data cell before committing an edit.");
        }

        return {
            status: "ready",
            kind: "data-cell",
            cellRequest: {
                objectName: selection.objectName,
                rowIndex: selection.rowIndex,
                columnName: selection.columnName,
                value,
                uiCommandVisibility: "hidden",
                visibleCommandText: ""
            },
            metadataRequest: null,
            message: "Data cell edit request created."
        };
    }

    if (selection.kind === "variable-cell") {
        if (!selection.objectName || !selection.metadataKey || !variableName) {
            return unavailable("Select a variable metadata cell before committing an edit.");
        }

        return {
            status: "ready",
            kind: "variable-cell",
            cellRequest: null,
            metadataRequest: {
                objectName: selection.objectName,
                variableName,
                metadataKey: selection.metadataKey,
                value,
                label: selection.metadataKey === "label" ? value : "",
                uiCommandVisibility: "hidden",
                visibleCommandText: ""
            },
            message: "Variable metadata edit request created."
        };
    }

    return unavailable("The current selection cannot be edited as a single cell.");
};


export const createCellEditFromInputs = function(
    objectName: string,
    rowIndex: number,
    columnName: string,
    value: string
): DatasetEditorEditCommand {
    const targetObject = String(objectName || "").trim();
    const targetColumn = String(columnName || "").trim();
    const targetRow = Math.round(Number(rowIndex));

    if (!targetObject || !Number.isFinite(targetRow) || targetRow < 0 || !targetColumn) {
        return unavailable("Data cell address is required before committing an edit.");
    }

    return {
        status: "ready",
        kind: "data-cell",
        cellRequest: {
            objectName: targetObject,
            rowIndex: targetRow,
            columnName: targetColumn,
            value,
            uiCommandVisibility: "hidden",
            visibleCommandText: ""
        },
        metadataRequest: null,
        message: "Data cell edit request created."
    };
};


export const editCommandsApi = {
    createCellEditFromInputs,
    createEditStartFromSelection,
    createEditCommitFromSelection
};
