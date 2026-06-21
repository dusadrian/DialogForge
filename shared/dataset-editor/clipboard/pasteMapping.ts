import type { CellUpdateRequest, TabularPreviewSnapshot, VariableMetadataSnapshot } from "../../runtime/provider-contract/runtimeProvider";
import type { DatasetEditorSelection, DatasetVariableMetadataKey } from "../state/datasetEditorState";
import type { PastePayload } from "./pastePayload";


interface StartCell {
    rowIndex: number;
    columnName: string;
}


export interface VariableMetadataPasteUpdate {
    objectName: string;
    rowIndex: number;
    variableName: string;
    metadataKey: DatasetVariableMetadataKey;
    value: string;
}


const getStartCell = function(selection: DatasetEditorSelection): StartCell {
    if (selection.kind === "data-cell") {
        return {
            rowIndex: selection.rowIndex,
            columnName: selection.columnName
        };
    }

    if (selection.kind === "data-row") {
        return {
            rowIndex: selection.rowIndex,
            columnName: ""
        };
    }

    if (selection.kind === "data-column") {
        return {
            rowIndex: 0,
            columnName: selection.columnName
        };
    }

    return {
        rowIndex: -1,
        columnName: ""
    };
};


const getMetadataRangeRows = function(selection: DatasetEditorSelection): { start: number; end: number } {
    if (selection.kind !== "metadata-range") {
        return {
            start: selection.rowIndex,
            end: selection.rowIndex
        };
    }

    return {
        start: Math.min(selection.anchorRowIndex, selection.focusRowIndex),
        end: Math.max(selection.anchorRowIndex, selection.focusRowIndex)
    };
};


const findColumnIndex = function(preview: TabularPreviewSnapshot, columnName: string): number {
    return preview.columns.findIndex((column) => {
        return column.name === columnName;
    });
};


const hasVariableMetadataTarget = function(selection: DatasetEditorSelection): selection is DatasetEditorSelection & { metadataKey: DatasetVariableMetadataKey } {
    return (selection.kind === "variable-cell" || selection.kind === "metadata-range") && Boolean(selection.metadataKey);
};


export const createPasteCellUpdates = function(
    preview: TabularPreviewSnapshot | null | undefined,
    selection: DatasetEditorSelection,
    payload: PastePayload | null | undefined
): CellUpdateRequest[] {
    if (!preview || preview.status !== "ready") {
        return [];
    }

    if (!payload || payload.status !== "ready") {
        return [];
    }

    const startCell = getStartCell(selection);
    const startColumn = startCell.columnName ? findColumnIndex(preview, startCell.columnName) : 0;

    if (startCell.rowIndex < 0 || startColumn < 0) {
        return [];
    }

    const updates: CellUpdateRequest[] = [];

    payload.rows.forEach((row, rowOffset) => {
        row.forEach((value, columnOffset) => {
            const column = preview.columns[startColumn + columnOffset];

            if (column && preview.rows[startCell.rowIndex + rowOffset]) {
                updates.push({
                    objectName: preview.objectName,
                    rowIndex: startCell.rowIndex + rowOffset,
                    columnName: column.name,
                    value,
                    uiCommandVisibility: "hidden",
                    visibleCommandText: ""
                });
            }
        });
    });

    return updates;
};


export const createVariableMetadataPasteUpdates = function(
    metadata: VariableMetadataSnapshot | null | undefined,
    selection: DatasetEditorSelection,
    payload: PastePayload | null | undefined
): VariableMetadataPasteUpdate[] {
    if (!metadata || metadata.status !== "ready") {
        return [];
    }

    if (!payload || payload.status !== "ready") {
        return [];
    }

    if (!hasVariableMetadataTarget(selection)) {
        return [];
    }

    const range = getMetadataRangeRows(selection);
    const updates: VariableMetadataPasteUpdate[] = [];

    payload.rows.forEach((row, rowOffset) => {
        const rowIndex = range.start + rowOffset;
        const variable = metadata.variables[rowIndex];

        if (!variable || rowIndex > range.end) {
            return;
        }

        updates.push({
            objectName: metadata.objectName,
            rowIndex,
            variableName: variable.name,
            metadataKey: selection.metadataKey,
            value: String(row[0] ?? "")
        });
    });

    return updates;
};


export const pasteMappingApi = {
    createPasteCellUpdates,
    createVariableMetadataPasteUpdates
};
