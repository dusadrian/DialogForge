import type { VariableMetadataFieldKey } from "../../runtime/provider-contract/runtimeProvider";
import type {
    DatasetEditorAction,
    DatasetEditorSelection
} from "../state/datasetEditorState";


export interface ControlUpdate {
    id: string;
    value: string;
}


export interface SelectionControlPlan {
    action: DatasetEditorAction;
    controls: ControlUpdate[];
}


export interface EditControlPlan {
    inputId: string;
    status: string;
    message: string;
}


const textValue = function(value: string | null | undefined): string {
    return value || "";
};


export const createDataCellSelectionPlan = function(
    objectName: string,
    rowIndex: number,
    columnName: string,
    value: string | null
): SelectionControlPlan {
    return {
        action: {
            type: "selectCell",
            objectName,
            rowIndex,
            columnName
        },
        controls: [
            { id: "cellRow", value: String(rowIndex) },
            { id: "cellColumn", value: columnName },
            { id: "cellValue", value: textValue(value) }
        ]
    };
};


export const createDataRowSelectionPlan = function(
    objectName: string,
    rowIndex: number
): SelectionControlPlan {
    return {
        action: {
            type: "selectRow",
            objectName,
            rowIndex
        },
        controls: [
            { id: "rowNameIndex", value: String(rowIndex) }
        ]
    };
};


export const createDataColumnSelectionPlan = function(
    objectName: string,
    columnName: string
): SelectionControlPlan {
    return {
        action: {
            type: "selectColumn",
            objectName,
            columnName
        },
        controls: [
            { id: "cellColumn", value: columnName },
            { id: "columnRenameFrom", value: columnName }
        ]
    };
};


const variableControlUpdates = function(
    variableName: string,
    metadataKey?: VariableMetadataFieldKey,
    value?: string
): ControlUpdate[] {
    const controls: ControlUpdate[] = [
        { id: "variableName", value: variableName },
        { id: "valueLabelVariable", value: variableName },
        { id: "declaredMissingVariable", value: variableName }
    ];

    if (metadataKey) {
        controls.push({ id: "variableMetadataKey", value: metadataKey });
        controls.push({ id: "variableMetadataValue", value: textValue(value) });
    }

    return controls;
};


export const createVariableCellSelectionPlan = function(
    objectName: string,
    rowIndex: number,
    metadataKey: VariableMetadataFieldKey,
    variableName: string,
    value: string
): SelectionControlPlan {
    return {
        action: {
            type: "selectVariableCell",
            objectName,
            rowIndex,
            metadataKey
        },
        controls: variableControlUpdates(variableName, metadataKey, value)
    };
};


export const createMetadataRangeSelectionPlan = function(
    current: DatasetEditorSelection,
    objectName: string,
    rowIndex: number,
    metadataKey: VariableMetadataFieldKey,
    variableName: string,
    value: string
): SelectionControlPlan {
    if (metadataKey === "name") {
        return createVariableCellSelectionPlan(objectName, rowIndex, metadataKey, variableName, value);
    }

    const anchorRowIndex = (
        (current.kind === "variable-cell" || current.kind === "metadata-range")
        && current.metadataKey === metadataKey
    )
        ? (current.kind === "metadata-range" ? current.anchorRowIndex : current.rowIndex)
        : rowIndex;

    return {
        action: {
            type: "selectMetadataRange",
            objectName,
            metadataKey,
            anchorRowIndex,
            focusRowIndex: rowIndex
        },
        controls: variableControlUpdates(variableName, metadataKey, value)
    };
};


export const createVariableRowSelectionPlan = function(
    objectName: string,
    rowIndex: number,
    variableName: string
): SelectionControlPlan {
    return {
        action: {
            type: "selectVariableRow",
            objectName,
            rowIndex,
            variableName
        },
        controls: variableControlUpdates(variableName)
    };
};


export const createEditControlPlan = function(selection: DatasetEditorSelection): EditControlPlan {
    if (selection.kind === "data-cell") {
        return {
            inputId: "cellValue",
            status: "ready",
            message: "Data cell edit control selected."
        };
    }

    if (selection.kind === "variable-cell") {
        return {
            inputId: "variableMetadataValue",
            status: "ready",
            message: "Variable metadata edit control selected."
        };
    }

    return {
        inputId: "",
        status: "unavailable",
        message: "The current selection does not have a single edit control."
    };
};


export const selectionControlsApi = {
    createEditControlPlan,
    createDataCellSelectionPlan,
    createDataColumnSelectionPlan,
    createDataRowSelectionPlan,
    createMetadataRangeSelectionPlan,
    createVariableCellSelectionPlan,
    createVariableRowSelectionPlan
};
