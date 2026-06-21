import type {
    DeclaredMissingUpdateRequest,
    VariableMetadataFieldKey,
    VariableMetadataUpdateRequest,
    ValueLabelUpdateRequest
} from "../../runtime/provider-contract/runtimeProvider";
import type { DatasetEditorSelection } from "../state/datasetEditorState";
import type { DatasetEditorCommandRequest } from "./structuralCommands";


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


export const createVariableMetadataUpdateFromSelection = function(
    selection: DatasetEditorSelection,
    variableName: string,
    value: string
): DatasetEditorCommandRequest<VariableMetadataUpdateRequest> {
    const metadataKey = selection.metadataKey as VariableMetadataFieldKey;
    const targetVariable = String(variableName || "").trim();

    if (selection.kind !== "variable-cell" || !selection.objectName || !metadataKey) {
        return unavailable("Select a variable metadata cell before updating metadata.");
    }

    if (!targetVariable) {
        return unavailable("Variable name is required.");
    }

    return ready({
        objectName: selection.objectName,
        variableName: targetVariable,
        metadataKey,
        value: String(value ?? ""),
        label: metadataKey === "label" ? String(value ?? "") : "",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const createVariableMetadataUpdateFromInputs = function(
    objectName: string,
    variableName: string,
    metadataKey: VariableMetadataFieldKey,
    value: string
): DatasetEditorCommandRequest<VariableMetadataUpdateRequest> {
    const targetObject = String(objectName || "").trim();
    const targetVariable = String(variableName || "").trim();

    if (!targetObject) {
        return unavailable("Dataset object is required.");
    }

    if (!targetVariable) {
        return unavailable("Variable name is required.");
    }

    if (!metadataKey) {
        return unavailable("Metadata field is required.");
    }

    return ready({
        objectName: targetObject,
        variableName: targetVariable,
        metadataKey,
        value: String(value ?? ""),
        label: metadataKey === "label" ? String(value ?? "") : "",
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const createValueLabelUpdateFromSelection = function(
    selection: DatasetEditorSelection,
    variableName: string,
    value: unknown,
    label: string
): DatasetEditorCommandRequest<ValueLabelUpdateRequest> {
    const targetVariable = String(variableName || "").trim();

    if (selection.kind !== "variable-cell" || selection.metadataKey !== "values" || !selection.objectName) {
        return unavailable("Select a Values metadata cell before updating value labels.");
    }

    if (!targetVariable) {
        return unavailable("Variable name is required.");
    }

    return ready({
        objectName: selection.objectName,
        variableName: targetVariable,
        labels: [
            {
                value,
                label: String(label || "")
            }
        ],
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const createValueLabelUpdateFromInputs = function(
    objectName: string,
    variableName: string,
    value: unknown,
    label: string
): DatasetEditorCommandRequest<ValueLabelUpdateRequest> {
    const targetObject = String(objectName || "").trim();
    const targetVariable = String(variableName || "").trim();

    if (!targetObject) {
        return unavailable("Dataset object is required.");
    }

    if (!targetVariable) {
        return unavailable("Variable name is required.");
    }

    return ready({
        objectName: targetObject,
        variableName: targetVariable,
        labels: [
            {
                value,
                label: String(label || "")
            }
        ],
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const createDeclaredMissingUpdateFromSelection = function(
    selection: DatasetEditorSelection,
    variableName: string,
    value: unknown,
    label: string
): DatasetEditorCommandRequest<DeclaredMissingUpdateRequest> {
    const targetVariable = String(variableName || "").trim();

    if (selection.kind !== "variable-cell" || selection.metadataKey !== "values" || !selection.objectName) {
        return unavailable("Select a Values metadata cell before updating declared missing values.");
    }

    if (!targetVariable) {
        return unavailable("Variable name is required.");
    }

    return ready({
        objectName: selection.objectName,
        variableName: targetVariable,
        values: [
            {
                value,
                label: String(label || "")
            }
        ],
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const createDeclaredMissingUpdateFromInputs = function(
    objectName: string,
    variableName: string,
    value: unknown,
    label: string
): DatasetEditorCommandRequest<DeclaredMissingUpdateRequest> {
    const targetObject = String(objectName || "").trim();
    const targetVariable = String(variableName || "").trim();

    if (!targetObject) {
        return unavailable("Dataset object is required.");
    }

    if (!targetVariable) {
        return unavailable("Variable name is required.");
    }

    return ready({
        objectName: targetObject,
        variableName: targetVariable,
        values: [
            {
                value,
                label: String(label || "")
            }
        ],
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    });
};


export const metadataCommandsApi = {
    createDeclaredMissingUpdateFromInputs,
    createVariableMetadataUpdateFromSelection,
    createVariableMetadataUpdateFromInputs,
    createValueLabelUpdateFromInputs,
    createValueLabelUpdateFromSelection,
    createDeclaredMissingUpdateFromSelection
};
