import type {
    TabularPreviewSnapshot,
    VariableMetadataFieldKey,
    VariableMetadataSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import {
    createDatasetColumnLayoutKey,
    type DatasetEditorColumnOrder,
    type DatasetEditorColumnWidths,
    type DatasetEditorViewport
} from "../state/datasetEditorState";


export interface DataPreviewCellDescriptor {
    rowIndex: number;
    columnName: string;
    text: string;
    width: number;
}


export interface DataPreviewHeaderDescriptor {
    text: string;
    columnName: string;
    width: number;
}


export interface DataPreviewRowHeaderDescriptor {
    rowIndex: number;
    text: string;
}


export interface DataPreviewRowDescriptor {
    rowIndex: number;
    header: DataPreviewRowHeaderDescriptor;
    cells: DataPreviewCellDescriptor[];
}


export interface DataPreviewDescriptor {
    status: string;
    objectName: string;
    rowOffset: number;
    columnOffset: number;
    headers: DataPreviewHeaderDescriptor[];
    rows: DataPreviewRowDescriptor[];
}


export interface VariableMetadataCellDescriptor {
    rowIndex: number;
    variableName: string;
    metadataKey: VariableMetadataFieldKey;
    text: string;
}


export interface VariableMetadataHeaderDescriptor {
    text: string;
    metadataKey: VariableMetadataFieldKey;
}


export interface VariableMetadataRowHeaderDescriptor {
    rowIndex: number;
    variableName: string;
    text: string;
}


export interface VariableMetadataRowDescriptor {
    rowIndex: number;
    variableName: string;
    header: VariableMetadataRowHeaderDescriptor;
    cells: VariableMetadataCellDescriptor[];
}


export interface VariableMetadataTableDescriptor {
    status: string;
    objectName: string;
    rowOffset: number;
    headers: VariableMetadataHeaderDescriptor[];
    rows: VariableMetadataRowDescriptor[];
}


export interface DataPreviewDescriptorOptions {
    viewport?: Partial<DatasetEditorViewport>;
    columnWidths?: DatasetEditorColumnWidths;
    columnOrder?: DatasetEditorColumnOrder;
}


export interface VariableMetadataDescriptorOptions {
    viewport?: Partial<DatasetEditorViewport>;
}


const textValue = function(value: unknown): string {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value);
};


const normalizeNonNegativeInteger = function(value: unknown, fallback: number): number {
    const normalized = Math.floor(Number(value));

    if (!Number.isFinite(normalized) || normalized < 0) {
        return fallback;
    }

    return normalized;
};


const normalizePositiveInteger = function(value: unknown, fallback: number): number {
    const normalized = Math.floor(Number(value));

    if (!Number.isFinite(normalized) || normalized < 1) {
        return fallback;
    }

    return normalized;
};


const orderColumnNames = function(columnNames: string[], objectName: string, columnOrder?: DatasetEditorColumnOrder): string[] {
    const requestedOrder = objectName && columnOrder ? columnOrder[objectName] || [] : [];
    const ordered: string[] = [];

    requestedOrder.forEach((columnName) => {
        if (columnNames.indexOf(columnName) >= 0 && ordered.indexOf(columnName) < 0) {
            ordered.push(columnName);
        }
    });

    columnNames.forEach((columnName) => {
        if (ordered.indexOf(columnName) < 0) {
            ordered.push(columnName);
        }
    });

    return ordered;
};


const getColumnWidth = function(
    objectName: string,
    columnName: string,
    columnWidths?: DatasetEditorColumnWidths
): number {
    const key = createDatasetColumnLayoutKey(objectName, columnName);
    const width = columnWidths ? Number(columnWidths[key]) : 0;

    if (!Number.isFinite(width) || width < 24) {
        return 0;
    }

    return Math.round(width);
};


export const createDataPreviewDescriptor = function(
    preview: TabularPreviewSnapshot,
    options: DataPreviewDescriptorOptions = {}
): DataPreviewDescriptor {
    if (preview.status !== "ready") {
        return {
            status: preview.status,
            objectName: preview.objectName,
            rowOffset: 0,
            columnOffset: 0,
            headers: [],
            rows: []
        };
    }

    const sourceColumns = preview.columns.map((column) => {
        return column.name;
    });
    const orderedColumns = orderColumnNames(sourceColumns, preview.objectName, options.columnOrder);
    const previewRowOffset = normalizeNonNegativeInteger(preview.rowOffset, 0);
    const previewColumnOffset = normalizeNonNegativeInteger(preview.columnOffset, 0);
    const isWindowedPreview = previewRowOffset > 0 || previewColumnOffset > 0;
    const rowOffset = isWindowedPreview ? previewRowOffset : normalizeNonNegativeInteger(options.viewport?.dataStartRow, 0);
    const rowLimit = normalizePositiveInteger(options.viewport?.dataVisibleRows, preview.rows.length || 1);
    const columnOffset = isWindowedPreview ? previewColumnOffset : normalizeNonNegativeInteger(options.viewport?.dataStartColumn, 0);
    const columnLimit = normalizePositiveInteger(options.viewport?.dataVisibleColumns, orderedColumns.length || 1);
    const sourceRowOffset = isWindowedPreview ? 0 : rowOffset;
    const sourceColumnOffset = isWindowedPreview ? 0 : columnOffset;
    const columns = orderedColumns.slice(sourceColumnOffset, sourceColumnOffset + columnLimit);
    const rows = preview.rows.slice(sourceRowOffset, sourceRowOffset + rowLimit);

    return {
        status: "ready",
        objectName: preview.objectName,
        rowOffset,
        columnOffset,
        headers: columns.map((columnName) => {
            return {
                text: columnName,
                columnName,
                width: getColumnWidth(preview.objectName, columnName, options.columnWidths)
            };
        }),
        rows: rows.map((row, visibleRowIndex) => {
            const rowIndex = rowOffset + visibleRowIndex;
            const rowNameIndex = isWindowedPreview ? visibleRowIndex : rowIndex;
            const rowName = preview.rowNames ? textValue(preview.rowNames[rowNameIndex]) : "";

            return {
                rowIndex,
                header: {
                    rowIndex,
                    text: rowName || String(rowIndex)
                },
                cells: columns.map((columnName) => {
                    return {
                        rowIndex,
                        columnName,
                        text: textValue(row[columnName]),
                        width: getColumnWidth(preview.objectName, columnName, options.columnWidths)
                    };
                })
            };
        })
    };
};


export const createVariableMetadataTableDescriptor = function(
    snapshot: VariableMetadataSnapshot,
    fields: VariableMetadataFieldKey[],
    options: VariableMetadataDescriptorOptions = {}
): VariableMetadataTableDescriptor {
    if (snapshot.status !== "ready") {
        return {
            status: snapshot.status,
            objectName: snapshot.objectName,
            rowOffset: 0,
            headers: [],
            rows: []
        };
    }
    const rowOffset = normalizeNonNegativeInteger(options.viewport?.variableStartRow, 0);
    const rowLimit = normalizePositiveInteger(options.viewport?.variableVisibleRows, snapshot.variables.length || 1);
    const variables = snapshot.variables.slice(rowOffset, rowOffset + rowLimit);

    return {
        status: "ready",
        objectName: snapshot.objectName,
        rowOffset,
        headers: fields.map((metadataKey) => {
            return {
                text: metadataKey,
                metadataKey
            };
        }),
        rows: variables.map((variable, visibleRowIndex) => {
            const rowIndex = rowOffset + visibleRowIndex;

            return {
                rowIndex,
                variableName: variable.name,
                header: {
                    rowIndex,
                    variableName: variable.name,
                    text: String(rowIndex)
                },
                cells: fields.map((metadataKey) => {
                    return {
                        rowIndex,
                        variableName: variable.name,
                        metadataKey,
                        text: textValue(variable[metadataKey])
                    };
                })
            };
        })
    };
};


export const tableDescriptorsApi = {
    createDataPreviewDescriptor,
    createVariableMetadataTableDescriptor
};
