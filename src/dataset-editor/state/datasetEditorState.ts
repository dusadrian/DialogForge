export type DatasetEditorSelectionKind =
    | "none"
    | "data-cell"
    | "data-row"
    | "data-column"
    | "variable-cell"
    | "variable-row"
    | "metadata-range";


export type DatasetVariableMetadataKey =
    | "name"
    | "type"
    | "role"
    | "width"
    | "decimals"
    | "label"
    | "values"
    | "align"
    | "measure";


export interface DatasetEditorSelection {
    kind: DatasetEditorSelectionKind;
    objectName: string;
    rowIndex: number;
    columnName: string;
    metadataKey: DatasetVariableMetadataKey | "";
    anchorRowIndex: number;
    focusRowIndex: number;
}


export interface DatasetEditorEditing {
    active: boolean;
    value: string;
}


export interface DatasetEditorViewport {
    dataStartRow: number;
    dataVisibleRows: number;
    dataStartColumn: number;
    dataVisibleColumns: number;
    variableStartRow: number;
    variableVisibleRows: number;
}


export type DatasetEditorColumnWidths = Record<string, number>;


export type DatasetEditorColumnOrder = Record<string, string[]>;


export interface DatasetEditorState {
    selection: DatasetEditorSelection;
    editing: DatasetEditorEditing;
    viewport: DatasetEditorViewport;
    columnWidths: DatasetEditorColumnWidths;
    columnOrder: DatasetEditorColumnOrder;
}


export type DatasetEditorAction =
    | {
        type: "selectCell";
        objectName: string;
        rowIndex: number;
        columnName: string;
    }
    | {
        type: "selectRow";
        objectName: string;
        rowIndex: number;
    }
    | {
        type: "selectColumn";
        objectName: string;
        columnName: string;
    }
    | {
        type: "selectVariableCell";
        objectName: string;
        rowIndex: number;
        metadataKey: DatasetVariableMetadataKey;
    }
    | {
        type: "selectVariableRow";
        objectName: string;
        rowIndex: number;
        variableName: string;
    }
    | {
        type: "selectMetadataRange";
        objectName: string;
        metadataKey: DatasetVariableMetadataKey;
        anchorRowIndex: number;
        focusRowIndex: number;
    }
    | {
        type: "beginEdit";
        value: string;
    }
    | {
        type: "endEdit";
    }
    | {
        type: "setViewport";
        viewport: Partial<DatasetEditorViewport>;
    }
    | {
        type: "setColumnWidth";
        objectName: string;
        columnName: string;
        width: number;
    }
    | {
        type: "setColumnOrder";
        objectName: string;
        columnNames: string[];
    }
    | {
        type: "moveColumn";
        objectName: string;
        columnName: string;
        targetIndex: number;
    };


const createDefaultViewport = function(): DatasetEditorViewport {
    return {
        dataStartRow: 0,
        dataVisibleRows: 50,
        dataStartColumn: 0,
        dataVisibleColumns: 20,
        variableStartRow: 0,
        variableVisibleRows: 50
    };
};


export const createInitialDatasetEditorState = function(): DatasetEditorState {
    return {
        selection: {
            kind: "none",
            objectName: "",
            rowIndex: -1,
            columnName: "",
            metadataKey: "",
            anchorRowIndex: -1,
            focusRowIndex: -1
        },
        editing: {
            active: false,
            value: ""
        },
        viewport: createDefaultViewport(),
        columnWidths: {},
        columnOrder: {}
    };
};


const preserveLayout = function(state: DatasetEditorState): Pick<DatasetEditorState, "viewport" | "columnWidths" | "columnOrder"> {
    return {
        viewport: Object.assign({}, state.viewport),
        columnWidths: Object.assign({}, state.columnWidths),
        columnOrder: Object.assign({}, state.columnOrder)
    };
};


const selectCell = function(_state: DatasetEditorState, action: Extract<DatasetEditorAction, { type: "selectCell" }>): DatasetEditorState {
    return {
        selection: {
            kind: "data-cell",
            objectName: action.objectName,
            rowIndex: action.rowIndex,
            columnName: action.columnName,
            metadataKey: "",
            anchorRowIndex: -1,
            focusRowIndex: -1
        },
        editing: {
            active: false,
            value: ""
        },
        ...preserveLayout(_state)
    };
};


const selectRow = function(_state: DatasetEditorState, action: Extract<DatasetEditorAction, { type: "selectRow" }>): DatasetEditorState {
    return {
        selection: {
            kind: "data-row",
            objectName: action.objectName,
            rowIndex: action.rowIndex,
            columnName: "",
            metadataKey: "",
            anchorRowIndex: -1,
            focusRowIndex: -1
        },
        editing: {
            active: false,
            value: ""
        },
        ...preserveLayout(_state)
    };
};


const selectColumn = function(_state: DatasetEditorState, action: Extract<DatasetEditorAction, { type: "selectColumn" }>): DatasetEditorState {
    return {
        selection: {
            kind: "data-column",
            objectName: action.objectName,
            rowIndex: -1,
            columnName: action.columnName,
            metadataKey: "",
            anchorRowIndex: -1,
            focusRowIndex: -1
        },
        editing: {
            active: false,
            value: ""
        },
        ...preserveLayout(_state)
    };
};


const selectVariableCell = function(_state: DatasetEditorState, action: Extract<DatasetEditorAction, { type: "selectVariableCell" }>): DatasetEditorState {
    return {
        selection: {
            kind: "variable-cell",
            objectName: action.objectName,
            rowIndex: action.rowIndex,
            columnName: "",
            metadataKey: action.metadataKey,
            anchorRowIndex: -1,
            focusRowIndex: -1
        },
        editing: {
            active: false,
            value: ""
        },
        ...preserveLayout(_state)
    };
};


const selectVariableRow = function(_state: DatasetEditorState, action: Extract<DatasetEditorAction, { type: "selectVariableRow" }>): DatasetEditorState {
    return {
        selection: {
            kind: "variable-row",
            objectName: action.objectName,
            rowIndex: action.rowIndex,
            columnName: action.variableName,
            metadataKey: "",
            anchorRowIndex: -1,
            focusRowIndex: -1
        },
        editing: {
            active: false,
            value: ""
        },
        ...preserveLayout(_state)
    };
};


const selectMetadataRange = function(_state: DatasetEditorState, action: Extract<DatasetEditorAction, { type: "selectMetadataRange" }>): DatasetEditorState {
    return {
        selection: {
            kind: "metadata-range",
            objectName: action.objectName,
            rowIndex: action.focusRowIndex,
            columnName: "",
            metadataKey: action.metadataKey,
            anchorRowIndex: action.anchorRowIndex,
            focusRowIndex: action.focusRowIndex
        },
        editing: {
            active: false,
            value: ""
        },
        ...preserveLayout(_state)
    };
};


const beginEdit = function(state: DatasetEditorState, action: Extract<DatasetEditorAction, { type: "beginEdit" }>): DatasetEditorState {
    if (state.selection.kind !== "data-cell" && state.selection.kind !== "variable-cell") {
        return state;
    }

    return {
        selection: Object.assign({}, state.selection),
        editing: {
            active: true,
            value: action.value
        },
        ...preserveLayout(state)
    };
};


const endEdit = function(state: DatasetEditorState): DatasetEditorState {
    return {
        selection: Object.assign({}, state.selection),
        editing: {
            active: false,
            value: ""
        },
        ...preserveLayout(state)
    };
};


const normalizeNonNegativeInteger = function(value: number, fallback: number): number {
    const normalized = Math.floor(Number(value));

    if (!Number.isFinite(normalized) || normalized < 0) {
        return fallback;
    }

    return normalized;
};


const normalizePositiveInteger = function(value: number, fallback: number): number {
    const normalized = Math.floor(Number(value));

    if (!Number.isFinite(normalized) || normalized < 1) {
        return fallback;
    }

    return normalized;
};


const setViewport = function(
    state: DatasetEditorState,
    action: Extract<DatasetEditorAction, { type: "setViewport" }>
): DatasetEditorState {
    const previous = state.viewport;

    return {
        selection: Object.assign({}, state.selection),
        editing: Object.assign({}, state.editing),
        viewport: {
            dataStartRow: normalizeNonNegativeInteger(action.viewport.dataStartRow ?? previous.dataStartRow, previous.dataStartRow),
            dataVisibleRows: normalizePositiveInteger(action.viewport.dataVisibleRows ?? previous.dataVisibleRows, previous.dataVisibleRows),
            dataStartColumn: normalizeNonNegativeInteger(action.viewport.dataStartColumn ?? previous.dataStartColumn, previous.dataStartColumn),
            dataVisibleColumns: normalizePositiveInteger(action.viewport.dataVisibleColumns ?? previous.dataVisibleColumns, previous.dataVisibleColumns),
            variableStartRow: normalizeNonNegativeInteger(action.viewport.variableStartRow ?? previous.variableStartRow, previous.variableStartRow),
            variableVisibleRows: normalizePositiveInteger(action.viewport.variableVisibleRows ?? previous.variableVisibleRows, previous.variableVisibleRows)
        },
        columnWidths: Object.assign({}, state.columnWidths),
        columnOrder: Object.assign({}, state.columnOrder)
    };
};


export const createDatasetColumnLayoutKey = function(objectName: string, columnName: string): string {
    return String(objectName || "").trim() + "::" + String(columnName || "").trim();
};


const setColumnWidth = function(
    state: DatasetEditorState,
    action: Extract<DatasetEditorAction, { type: "setColumnWidth" }>
): DatasetEditorState {
    const objectName = String(action.objectName || "").trim();
    const columnName = String(action.columnName || "").trim();
    const key = createDatasetColumnLayoutKey(objectName, columnName);
    const width = Math.round(Number(action.width));
    const columnWidths = Object.assign({}, state.columnWidths);

    if (!objectName || !columnName || !Number.isFinite(width) || width < 24) {
        return state;
    }

    columnWidths[key] = width;

    return {
        selection: Object.assign({}, state.selection),
        editing: Object.assign({}, state.editing),
        viewport: Object.assign({}, state.viewport),
        columnWidths,
        columnOrder: Object.assign({}, state.columnOrder)
    };
};


const normalizeColumnNames = function(columnNames: string[]): string[] {
    const normalized: string[] = [];

    columnNames.forEach((columnName) => {
        const value = String(columnName || "").trim();

        if (value && normalized.indexOf(value) < 0) {
            normalized.push(value);
        }
    });

    return normalized;
};


const setColumnOrder = function(
    state: DatasetEditorState,
    action: Extract<DatasetEditorAction, { type: "setColumnOrder" }>
): DatasetEditorState {
    const objectName = String(action.objectName || "").trim();
    const columnNames = normalizeColumnNames(action.columnNames);

    if (!objectName || columnNames.length === 0) {
        return state;
    }

    return {
        selection: Object.assign({}, state.selection),
        editing: Object.assign({}, state.editing),
        viewport: Object.assign({}, state.viewport),
        columnWidths: Object.assign({}, state.columnWidths),
        columnOrder: Object.assign({}, state.columnOrder, {
            [objectName]: columnNames
        })
    };
};


const moveColumn = function(
    state: DatasetEditorState,
    action: Extract<DatasetEditorAction, { type: "moveColumn" }>
): DatasetEditorState {
    const objectName = String(action.objectName || "").trim();
    const columnName = String(action.columnName || "").trim();
    const currentOrder = objectName ? state.columnOrder[objectName] || [] : [];
    const sourceIndex = currentOrder.indexOf(columnName);
    const targetIndex = normalizeNonNegativeInteger(action.targetIndex, sourceIndex);

    if (!objectName || !columnName || sourceIndex < 0 || targetIndex >= currentOrder.length) {
        return state;
    }

    const nextOrder = currentOrder.slice();
    const moved = nextOrder.splice(sourceIndex, 1)[0];

    nextOrder.splice(targetIndex, 0, moved);

    return setColumnOrder(state, {
        type: "setColumnOrder",
        objectName,
        columnNames: nextOrder
    });
};


export const datasetEditorReducer = function(state: DatasetEditorState, action: DatasetEditorAction): DatasetEditorState {
    if (action.type === "selectCell") {
        return selectCell(state, action);
    }

    if (action.type === "selectRow") {
        return selectRow(state, action);
    }

    if (action.type === "selectColumn") {
        return selectColumn(state, action);
    }

    if (action.type === "selectVariableCell") {
        return selectVariableCell(state, action);
    }

    if (action.type === "selectVariableRow") {
        return selectVariableRow(state, action);
    }

    if (action.type === "selectMetadataRange") {
        return selectMetadataRange(state, action);
    }

    if (action.type === "beginEdit") {
        return beginEdit(state, action);
    }

    if (action.type === "endEdit") {
        return endEdit(state);
    }

    if (action.type === "setViewport") {
        return setViewport(state, action);
    }

    if (action.type === "setColumnWidth") {
        return setColumnWidth(state, action);
    }

    if (action.type === "setColumnOrder") {
        return setColumnOrder(state, action);
    }

    if (action.type === "moveColumn") {
        return moveColumn(state, action);
    }

    return state;
};


export const datasetEditorStateApi = {
    createDatasetColumnLayoutKey,
    createInitialDatasetEditorState,
    datasetEditorReducer
};
