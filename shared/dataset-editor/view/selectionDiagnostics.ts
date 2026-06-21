import type { DatasetEditorSelection, DatasetEditorState } from "../state/datasetEditorState";
import type { DatasetEditorContextAction } from "../context-menus/contextMenuActions";


export interface DatasetEditorDiagnosticField {
    name: string;
    value: string;
}


export interface DatasetEditorActionDiagnostic {
    label: string;
    command: string;
}


const text = function(value: unknown): string {
    return value === undefined || value === null ? "" : String(value);
};


export const createSelectionDiagnosticFields = function(state: DatasetEditorState): DatasetEditorDiagnosticField[] {
    const selection: DatasetEditorSelection = state.selection;
    const fields: DatasetEditorDiagnosticField[] = [
        { name: "selection", value: selection.kind }
    ];

    if (selection.kind === "data-cell") {
        fields.push({ name: "object", value: selection.objectName });
        fields.push({ name: "cell", value: selection.rowIndex + ", " + selection.columnName });
    }

    if (selection.kind === "data-row") {
        fields.push({ name: "object", value: selection.objectName });
        fields.push({ name: "row", value: text(selection.rowIndex) });
    }

    if (selection.kind === "data-column") {
        fields.push({ name: "object", value: selection.objectName });
        fields.push({ name: "column", value: selection.columnName });
    }

    if (selection.kind === "variable-cell") {
        fields.push({ name: "object", value: selection.objectName });
        fields.push({ name: "variable row", value: text(selection.rowIndex) });
        fields.push({ name: "metadata", value: selection.metadataKey });
    }

    if (selection.kind === "variable-row") {
        fields.push({ name: "object", value: selection.objectName });
        fields.push({ name: "variable row", value: text(selection.rowIndex) });
    }

    if (selection.kind === "metadata-range") {
        fields.push({ name: "object", value: selection.objectName });
        fields.push({ name: "metadata", value: selection.metadataKey });
        fields.push({ name: "range", value: selection.anchorRowIndex + "..." + selection.focusRowIndex });
    }

    fields.push({ name: "editing", value: state.editing.active ? "active" : "inactive" });

    return fields;
};


export const createActionDiagnostics = function(actions: DatasetEditorContextAction[]): DatasetEditorActionDiagnostic[] {
    return actions.map((action) => {
        return {
            label: action.label,
            command: action.command
        };
    });
};


export const selectionDiagnosticsApi = {
    createSelectionDiagnosticFields,
    createActionDiagnostics
};
