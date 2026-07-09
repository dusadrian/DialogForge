import type {
    CellUpdateBatchResult,
    CellUpdateResult,
    ColumnInsertResult,
    ColumnRemoveResult,
    ColumnRenameResult,
    RowInsertResult,
    RowNameUpdateResult,
    RowRemoveResult,
    RowSortResult
} from "../provider-contract/runtimeProvider";
import {
    createCellUpdateResult
} from "./tabularProtocol";
import type {
    DatasetViewerCell
} from "./datasetViewerTypes";


export const datasetViewerRuntimeProviderId = "runtime";


export const createDatasetViewerMutationUpdatedAt = function(): string {
    return new Date().toISOString();
};


export const createDatasetViewerMutationMetadata = function(
    input: {
        providerId?: string;
        message: string;
    }
): {
    providerId: string;
    transcriptEvents: [];
    message: string;
    updatedAt: string;
} {
    return {
        providerId: input.providerId || datasetViewerRuntimeProviderId,
        transcriptEvents: [],
        message: input.message,
        updatedAt: createDatasetViewerMutationUpdatedAt()
    };
};


export const providerRowIndexFromDatasetViewerPayload = function(value: unknown): number {
    const rowNumber = Number(value);

    if (!Number.isFinite(rowNumber) || rowNumber < 1) {
        return Number.NaN;
    }

    return Math.floor(rowNumber) - 1;
};


export const stringFromDatasetViewerPayload = function(value: unknown): string {
    return String(value || "");
};


export const normalizedDatasetViewerPosition = function(value: unknown): "before" | "after" {
    return value === "after" ? "after" : "before";
};


export const createDatasetViewerCellFallback = function(value: unknown): DatasetViewerCell {
    const text = value === null || typeof value === "undefined"
        ? ""
        : String(value);

    return {
        display: text,
        raw: text
    };
};


export const createDatasetViewerCellUpdateResult = function(
    result: CellUpdateResult
): DatasetViewerCell | null {
    return result.status === "updated"
        ? result.cell || createDatasetViewerCellFallback(result.value)
        : null;
};


export const createDatasetViewerColumnRenameResult = function(
    result: ColumnRenameResult
): { column: string; name: string } | null {
    return result.status === "updated"
        ? {
            column: result.fromName,
            name: result.toName
        }
        : null;
};


export const createDatasetViewerRowNameResult = function(
    result: RowNameUpdateResult
): { row: number; name: string } | null {
    return result.status === "updated"
        ? {
            row: result.rowIndex + 1,
            name: result.name
        }
        : null;
};


export const createDatasetViewerUpdatedRowNameResult = function(input: {
    providerId?: string;
    objectName: string;
    rowIndex: number;
    name: string;
}): RowNameUpdateResult {
    return {
        status: "updated",
        ...createDatasetViewerMutationMetadata({
            providerId: input.providerId,
            message: "Row name updated."
        }),
        objectName: input.objectName,
        rowIndex: input.rowIndex,
        name: input.name
    };
};


export const createDatasetViewerRowInsertResult = function(
    result: RowInsertResult,
    fallback: {
        name?: unknown;
        position?: unknown;
    } = {}
) {
    const position = normalizedDatasetViewerPosition(fallback.position);

    return result.status === "updated"
        ? {
            name: result.objectName,
            row: result.rowIndex + 1,
            nextName: result.name || stringFromDatasetViewerPayload(fallback.name),
            position,
            rowCount: result.rowCount
        }
        : null;
};


export const createDatasetViewerUpdatedRowInsertResult = function(input: {
    providerId?: string;
    objectName: string;
    rowIndex: number;
    name: string;
    rowCount: number;
}): RowInsertResult {
    return {
        status: "updated",
        ...createDatasetViewerMutationMetadata({
            providerId: input.providerId,
            message: "Row inserted."
        }),
        objectName: input.objectName,
        rowIndex: input.rowIndex,
        name: input.name,
        rowCount: input.rowCount
    };
};


export const createDatasetViewerRowRemoveResult = function(
    result: RowRemoveResult
) {
    return result.status === "updated"
        ? {
            name: result.objectName,
            row: result.rowIndex + 1,
            rowCount: result.rowCount
        }
        : null;
};


export const createDatasetViewerUpdatedRowRemoveResult = function(input: {
    providerId?: string;
    objectName: string;
    rowIndex: number;
    rowCount: number;
}): RowRemoveResult {
    return {
        status: "updated",
        ...createDatasetViewerMutationMetadata({
            providerId: input.providerId,
            message: "Row removed."
        }),
        objectName: input.objectName,
        rowIndex: input.rowIndex,
        rowCount: input.rowCount
    };
};


export const createDatasetViewerColumnInsertResult = function(
    result: ColumnInsertResult,
    fallback: {
        column?: unknown;
        position?: unknown;
    } = {}
) {
    const position = normalizedDatasetViewerPosition(fallback.position);

    return result.status === "updated"
        ? {
            name: result.objectName,
            column: stringFromDatasetViewerPayload(fallback.column),
            nextName: result.columnName,
            columnIndex: result.columnIndex,
            columnCount: result.columnCount,
            position
        }
        : null;
};


export const createDatasetViewerUpdatedColumnInsertResult = function(input: {
    providerId?: string;
    objectName: string;
    columnName: string;
    columnIndex: number;
    columnCount: number;
}): ColumnInsertResult {
    return {
        status: "updated",
        ...createDatasetViewerMutationMetadata({
            providerId: input.providerId,
            message: "Column inserted."
        }),
        objectName: input.objectName,
        columnName: input.columnName,
        columnIndex: input.columnIndex,
        columnCount: input.columnCount
    };
};


export const createDatasetViewerColumnRemoveResult = function(
    result: ColumnRemoveResult
) {
    return result.status === "updated"
        ? {
            column: result.columnName,
            columnCount: result.columnCount
        }
        : null;
};


export const createDatasetViewerUpdatedColumnRemoveResult = function(input: {
    providerId?: string;
    objectName: string;
    columnName: string;
    columnCount: number;
}): ColumnRemoveResult {
    return {
        status: "updated",
        ...createDatasetViewerMutationMetadata({
            providerId: input.providerId,
            message: "Column removed."
        }),
        objectName: input.objectName,
        columnName: input.columnName,
        columnCount: input.columnCount
    };
};


export const createDatasetViewerRowSortResult = function(
    result: RowSortResult
) {
    return result.status === "updated"
        ? {
            name: result.objectName,
            column: result.columnName,
            decreasing: result.direction === "descending",
            rowCount: result.rowCount,
            command: result.command || ""
        }
        : null;
};


export const createDatasetViewerUpdatedRowSortResult = function(input: {
    providerId?: string;
    objectName: string;
    columnName: string;
    direction: "ascending" | "descending";
    rowCount: number;
    command: string;
}): RowSortResult {
    return {
        status: "updated",
        ...createDatasetViewerMutationMetadata({
            providerId: input.providerId,
            message: "Rows sorted."
        }),
        objectName: input.objectName,
        columnName: input.columnName,
        direction: input.direction,
        rowCount: input.rowCount,
        command: input.command
    };
};


export const collectDatasetViewerVariablePatchParams = function(
    payload: Record<string, unknown>
): Record<string, unknown> {
    const params: Record<string, unknown> = {
        name: String(payload.name || "").trim(),
        variableName: String(payload.variableName || "").trim()
    };

    [
        "type",
        "measure",
        "label",
        "width",
        "decimals",
        "align",
        "categories",
        "missingRange"
    ].forEach((key) => {
        const value = payload[key];

        if (
            Object.prototype.hasOwnProperty.call(payload, key)
            && value !== undefined
        ) {
            params[key] = value;
        }
    });

    return params;
};


export const createDatasetViewerCellUpdateBatchResult = function(
    input: {
        providerId: string;
        objectName: string;
        results: CellUpdateResult[];
    }
): CellUpdateBatchResult {
    const updated = input.results.filter((result) => {
        return result.status === "updated";
    }).length;
    const failed = input.results.length - updated;

    return {
        status: failed > 0 ? "partial" : "updated",
        providerId: input.providerId,
        objectName: input.objectName,
        updated,
        failed,
        results: input.results,
        message: `${updated} cell${updated === 1 ? "" : "s"} updated.`,
        updatedAt: new Date().toISOString()
    };
};


export const createDatasetViewerCellUpdateFailure = function(
    input: {
        providerId: string;
        objectName: string;
        rowIndex: number;
        columnName: string;
        value: unknown;
        message: string;
    }
): CellUpdateResult {
    return createCellUpdateResult({
        status: "failed",
        providerId: input.providerId,
        objectName: input.objectName,
        rowIndex: input.rowIndex,
        columnName: input.columnName,
        value: input.value,
        transcriptEvents: [],
        message: input.message
    });
};


export const createDatasetViewerCellUpdateSuccess = function(
    input: {
        providerId: string;
        objectName: string;
        rowIndex: number;
        columnName: string;
        value: unknown;
    }
): CellUpdateResult {
    return createCellUpdateResult({
        status: "updated",
        providerId: input.providerId,
        objectName: input.objectName,
        rowIndex: input.rowIndex,
        columnName: input.columnName,
        value: input.value,
        cell: createDatasetViewerCellFallback(input.value),
        transcriptEvents: [],
        message: "Cell updated."
    });
};
