import type { CellUpdateRequest, TabularPreviewSnapshot, VariableMetadataSnapshot } from "../../runtime/provider-contract/runtimeProvider";
import type { DatasetEditorSelection, DatasetVariableMetadataKey } from "../state/datasetEditorState";


export interface CopyPayload {
    status: string;
    kind: string;
    text: string;
    cells: CellUpdateRequest[];
    message: string;
}


const findColumn = function(preview: TabularPreviewSnapshot, columnName: string) {
    return preview.columns.find((column) => {
        return column.name === columnName;
    });
};


const metadataColumns: DatasetVariableMetadataKey[] = [
    "name",
    "type",
    "width",
    "decimals",
    "label",
    "values",
    "align",
    "measure"
];


const createEmptyPayload = function(message: string): CopyPayload {
    return {
        status: "empty",
        kind: "none",
        text: "",
        cells: [],
        message
    };
};


const createHiddenCellUpdate = function(
    objectName: string,
    rowIndex: number,
    columnName: string,
    value: unknown
): CellUpdateRequest {
    return {
        objectName,
        rowIndex,
        columnName,
        value,
        uiCommandVisibility: "hidden",
        visibleCommandText: ""
    };
};


const textValue = function(value: unknown): string {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value);
};


const quoteTsvCell = function(value: unknown): string {
    const text = textValue(value);

    if (!/[\t\r\n"]/.test(text)) {
        return text;
    }

    return '"' + text.replace(/"/g, '""') + '"';
};


const parseValueLabels = function(values: string | undefined): Map<string, string> {
    const labels = new Map<string, string>();
    const text = String(values || "").trim();

    if (!text) {
        return labels;
    }

    text.split(/[;\r\n]+/).forEach((entry) => {
        const separator = entry.indexOf("=");

        if (separator < 0) {
            return;
        }

        const value = entry.slice(0, separator).trim();
        const label = entry.slice(separator + 1).trim();

        if (value) {
            labels.set(value, label || value);
        }
    });

    return labels;
};


const createValueLabelMap = function(variable: VariableMetadataSnapshot["variables"][number] | undefined): Map<string, string> {
    const labels = new Map<string, string>();

    if (Array.isArray(variable?.categories)) {
        variable.categories.forEach((category) => {
            if (category.value) {
                labels.set(String(category.value), String(category.label || category.value));
            }
        });
    }

    if (labels.size > 0) {
        return labels;
    }

    return parseValueLabels(variable?.values);
};


const createValueLabelsTsv = function(variable: VariableMetadataSnapshot["variables"][number]): string {
    if (Array.isArray(variable.categories) && variable.categories.length > 0) {
        const lines = variable.categories.map((category) => {
            return [
                quoteTsvCell(category.value),
                quoteTsvCell(category.label),
                category.isMissing === true ? "TRUE" : "FALSE"
            ].join("\t");
        });

        if (variable.missingRange) {
            lines.push([
                quoteTsvCell(variable.missingRange.min),
                quoteTsvCell(variable.missingRange.max),
                "RANGE"
            ].join("\t"));
        }

        return lines.join("\n");
    }

    const values = variable.values;
    const labels = parseValueLabels(values);

    if (labels.size === 0) {
        return textValue(values);
    }

    return Array.from(labels.entries()).map(([value, label]) => {
        return [quoteTsvCell(value), quoteTsvCell(label)].join("\t");
    }).join("\n");
};


const getVariableMetadataValue = function(
    variable: VariableMetadataSnapshot["variables"][number],
    key: DatasetVariableMetadataKey
): string {
    return textValue(variable[key]);
};


const normalizeMetadataRange = function(selection: DatasetEditorSelection): { start: number; end: number } {
    const start = Math.min(selection.anchorRowIndex, selection.focusRowIndex);
    const end = Math.max(selection.anchorRowIndex, selection.focusRowIndex);

    return { start, end };
};


const createCellPayload = function(preview: TabularPreviewSnapshot, selection: DatasetEditorSelection): CopyPayload {
    const row = preview.rows[selection.rowIndex];
    const column = findColumn(preview, selection.columnName);

    if (!row || !column) {
        return createEmptyPayload("Selected cell is not available in the current preview.");
    }

    const value = row[column.name];

    return {
        status: "ready",
        kind: "data-cell",
        text: textValue(value),
        cells: [
            createHiddenCellUpdate(preview.objectName, selection.rowIndex, column.name, value)
        ],
        message: "Cell payload created."
    };
};


const createRowPayload = function(preview: TabularPreviewSnapshot, selection: DatasetEditorSelection): CopyPayload {
    const row = preview.rows[selection.rowIndex];

    if (!row) {
        return createEmptyPayload("Selected row is not available in the current preview.");
    }

    return {
        status: "ready",
        kind: "data-row",
        text: preview.columns.map((column) => {
            return row[column.name];
        }).join("\t"),
        cells: preview.columns.map((column) => {
            return createHiddenCellUpdate(preview.objectName, selection.rowIndex, column.name, row[column.name]);
        }),
        message: "Row payload created."
    };
};


const createColumnPayload = function(preview: TabularPreviewSnapshot, selection: DatasetEditorSelection): CopyPayload {
    const column = findColumn(preview, selection.columnName);

    if (!column) {
        return createEmptyPayload("Selected column is not available in the current preview.");
    }

    return {
        status: "ready",
        kind: "data-column",
        text: preview.rows.map((row) => {
            return row[column.name];
        }).join("\n"),
        cells: preview.rows.map((row, rowIndex) => {
            return createHiddenCellUpdate(preview.objectName, rowIndex, column.name, row[column.name]);
        }),
        message: "Column payload created."
    };
};


const createColumnValuesAndLabelsPayload = function(
    preview: TabularPreviewSnapshot,
    metadata: VariableMetadataSnapshot | null | undefined,
    selection: DatasetEditorSelection
): CopyPayload {
    const column = findColumn(preview, selection.columnName);

    if (!column) {
        return createEmptyPayload("Selected column is not available in the current preview.");
    }

    const variable = metadata?.variables.find((candidate) => {
        return candidate.name === column.name;
    });
    const labels = createValueLabelMap(variable);

    return {
        status: "ready",
        kind: "data-column-values-and-labels",
        text: preview.rows.map((row) => {
            const value = textValue(row[column.name]);
            const label = labels.get(value) || value;

            return [quoteTsvCell(value), quoteTsvCell(label)].join("\t");
        }).join("\n"),
        cells: preview.rows.map((row, rowIndex) => {
            return createHiddenCellUpdate(preview.objectName, rowIndex, column.name, row[column.name]);
        }),
        message: "Column values and labels payload created."
    };
};


const createVariableCellPayload = function(metadata: VariableMetadataSnapshot, selection: DatasetEditorSelection): CopyPayload {
    const variable = metadata.variables[selection.rowIndex];

    if (!variable || !selection.metadataKey) {
        return createEmptyPayload("Selected variable metadata cell is not available.");
    }

    const isValuesCell = selection.metadataKey === "values";

    return {
        status: "ready",
        kind: isValuesCell ? "variable-values-and-labels" : "variable-cell",
        text: isValuesCell
            ? createValueLabelsTsv(variable)
            : getVariableMetadataValue(variable, selection.metadataKey),
        cells: [],
        message: isValuesCell
            ? "Variable value-label payload created."
            : "Variable metadata cell payload created."
    };
};


const createVariableRowPayload = function(metadata: VariableMetadataSnapshot, selection: DatasetEditorSelection): CopyPayload {
    const variable = metadata.variables[selection.rowIndex];

    if (!variable) {
        return createEmptyPayload("Selected variable metadata row is not available.");
    }

    return {
        status: "ready",
        kind: "variable-row",
        text: metadataColumns.map((key) => {
            return getVariableMetadataValue(variable, key);
        }).join("\t"),
        cells: [],
        message: "Variable metadata row payload created."
    };
};


const createMetadataRangePayload = function(metadata: VariableMetadataSnapshot, selection: DatasetEditorSelection): CopyPayload {
    if (!selection.metadataKey) {
        return createEmptyPayload("No metadata column is selected.");
    }

    const range = normalizeMetadataRange(selection);
    const variables = metadata.variables.slice(range.start, range.end + 1);

    if (!variables.length) {
        return createEmptyPayload("Selected variable metadata range is not available.");
    }

    return {
        status: "ready",
        kind: "metadata-range",
        text: variables.map((variable) => {
            return getVariableMetadataValue(variable, selection.metadataKey as DatasetVariableMetadataKey);
        }).join("\n"),
        cells: [],
        message: "Variable metadata range payload created."
    };
};


export const createCopyPayload = function(
    preview: TabularPreviewSnapshot | null | undefined,
    selection: DatasetEditorSelection,
    metadata?: VariableMetadataSnapshot | null,
    options?: { includeValueLabels?: boolean }
): CopyPayload {
    if (!preview || preview.status !== "ready") {
        return createEmptyPayload("No ready preview is available.");
    }

    if (selection.kind === "data-cell") {
        return createCellPayload(preview, selection);
    }

    if (selection.kind === "data-row") {
        return createRowPayload(preview, selection);
    }

    if (selection.kind === "data-column") {
        if (options?.includeValueLabels) {
            return createColumnValuesAndLabelsPayload(preview, metadata, selection);
        }

        return createColumnPayload(preview, selection);
    }

    return createEmptyPayload("No dataset editor selection is active.");
};


export const createVariableMetadataCopyPayload = function(
    metadata: VariableMetadataSnapshot | null | undefined,
    selection: DatasetEditorSelection
): CopyPayload {
    if (!metadata || metadata.status !== "ready") {
        return createEmptyPayload("No ready variable metadata is available.");
    }

    if (selection.kind === "variable-cell") {
        return createVariableCellPayload(metadata, selection);
    }

    if (selection.kind === "variable-row") {
        return createVariableRowPayload(metadata, selection);
    }

    if (selection.kind === "metadata-range") {
        return createMetadataRangePayload(metadata, selection);
    }

    return createEmptyPayload("No variable metadata selection is active.");
};


export const copyPayloadApi = {
    createCopyPayload,
    createVariableMetadataCopyPayload
};
