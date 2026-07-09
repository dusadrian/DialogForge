import type {
    DatasetVariableCategoryValue,
    DatasetVariableCommandMetadata,
    DatasetVariableMissingRangeValue
} from "../commands/visibleCommandText";


export type DatasetVariableColumnKey =
    | "name"
    | "type"
    | "width"
    | "decimals"
    | "label"
    | "values"
    | "align"
    | "measure";


export interface DatasetClipboardVariableMetadata extends DatasetVariableCommandMetadata {
    values: string;
}


export interface DataColumnClipboardPayload {
    kind: "dialog-dataset-data-column";
    version: 1;
    datasetName: string;
    columnName: string;
    rowCount: number;
    mode: "values" | "values-and-labels";
}


export type VariableMetadataClipboardPayload = {
    kind: "dialog-dataset-variable-metadata";
    version: 1;
    key: DatasetVariableColumnKey;
    text: string;
} & (
    | {
        key: "values";
        categories: DatasetVariableCategoryValue[];
        missingRange: DatasetVariableMissingRangeValue | null;
    }
    | {
        key: Exclude<DatasetVariableColumnKey, "values">;
    }
);


export interface DatasetEditorClipboardState {
    clearDataColumn: () => void;
    setDataColumn: (
        datasetName: string,
        columnName: string,
        rowCount: number,
        mode: DataColumnClipboardPayload["mode"],
        text: string
    ) => void;
    readDataColumn: (text: string) => DataColumnClipboardPayload | null;
    clearVariableMetadata: () => void;
    makeVariableMetadataText: (
        entry: DatasetClipboardVariableMetadata,
        key: DatasetVariableColumnKey
    ) => string;
    readVariableMetadata: (text: string) => VariableMetadataClipboardPayload | null;
}


export const quoteTsvCell = function(value: string): string {
    const text = String(value ?? "");

    if (!/[\t\r\n"]/.test(text)) return text;

    return `"${text.replace(/"/g, '""')}"`;
};


const cloneCategory = function(
    category: DatasetVariableCategoryValue
): DatasetVariableCategoryValue {
    return {
        value: String(category?.value || ""),
        label: String(category?.label || ""),
        isMissing: Boolean(category?.isMissing)
    };
};


const cloneMissingRange = function(
    range: DatasetVariableMissingRangeValue | null | undefined
): DatasetVariableMissingRangeValue | null {
    if (!range) return null;

    return {
        min: String(range.min || ""),
        max: String(range.max || "")
    };
};


const readVariableField = function(
    entry: DatasetClipboardVariableMetadata,
    key: DatasetVariableColumnKey
): string | number {
    return entry[key];
};


export const createDatasetEditorClipboardState = function(): DatasetEditorClipboardState {
    let dataColumnPayload: DataColumnClipboardPayload | null = null;
    let dataColumnText = "";
    let variableMetadataPayload: VariableMetadataClipboardPayload | null = null;
    let variableMetadataText = "";

    const clearDataColumn = function(): void {
        dataColumnPayload = null;
        dataColumnText = "";
    };

    const setDataColumn = function(
        datasetName: string,
        columnName: string,
        rowCount: number,
        mode: DataColumnClipboardPayload["mode"],
        text: string
    ): void {
        dataColumnPayload = {
            kind: "dialog-dataset-data-column",
            version: 1,
            datasetName: String(datasetName || "").trim(),
            columnName: String(columnName || "").trim(),
            rowCount: Math.max(0, Number(rowCount) || 0),
            mode
        };
        dataColumnText = text;
    };

    const readDataColumn = function(text: string): DataColumnClipboardPayload | null {
        if (!dataColumnPayload || String(text || "") !== dataColumnText) return null;

        return { ...dataColumnPayload };
    };

    const clearVariableMetadata = function(): void {
        variableMetadataPayload = null;
        variableMetadataText = "";
    };

    const makeVariableMetadataText = function(
        entry: DatasetClipboardVariableMetadata,
        key: DatasetVariableColumnKey
    ): string {
        if (key !== "values") {
            const value = readVariableField(entry, key);
            const text = value === undefined || value === null ? "" : String(value);
            variableMetadataPayload = {
                kind: "dialog-dataset-variable-metadata",
                version: 1,
                key,
                text
            };
            variableMetadataText = text;

            return text;
        }

        const categories = Array.isArray(entry.categories)
            ? entry.categories.map(cloneCategory)
            : [];
        const missingRange = cloneMissingRange(entry.missingRange);
        const lines = categories.map((category) => {
            return [
                quoteTsvCell(category.value),
                quoteTsvCell(category.label),
                category.isMissing ? "TRUE" : "FALSE"
            ].join("\t");
        });

        if (missingRange) {
            lines.push([
                quoteTsvCell(missingRange.min),
                quoteTsvCell(missingRange.max),
                "RANGE"
            ].join("\t"));
        }

        const text = lines.join("\n");
        variableMetadataPayload = {
            kind: "dialog-dataset-variable-metadata",
            version: 1,
            key: "values",
            text,
            categories,
            missingRange
        };
        variableMetadataText = text;

        return text;
    };

    const readVariableMetadata = function(
        text: string
    ): VariableMetadataClipboardPayload | null {
        if (
            !variableMetadataPayload ||
            String(text || "") !== variableMetadataText
        ) {
            return null;
        }

        if (variableMetadataPayload.key !== "values") {
            return { ...variableMetadataPayload };
        }

        return {
            ...variableMetadataPayload,
            categories: variableMetadataPayload.categories.map(cloneCategory),
            missingRange: cloneMissingRange(variableMetadataPayload.missingRange)
        };
    };

    return {
        clearDataColumn,
        setDataColumn,
        readDataColumn,
        clearVariableMetadata,
        makeVariableMetadataText,
        readVariableMetadata
    };
};
