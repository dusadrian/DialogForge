import type {
    CellUpdateBatchResult,
    CellUpdateRequest,
    CellUpdateResult,
    ColumnInsertRequest,
    ColumnInsertResult,
    ColumnRemoveRequest,
    ColumnRemoveResult,
    ColumnRenameRequest,
    ColumnRenameResult,
    DeclaredMissingSnapshot,
    DeclaredMissingUpdateRequest,
    DeclaredMissingUpdateResult,
    RowNameUpdateRequest,
    RowNameUpdateResult,
    RowInsertRequest,
    RowInsertResult,
    RowRemoveRequest,
    RowRemoveResult,
    RowSortRequest,
    RowSortResult,
    TabularColumnSnapshot,
    TabularPreviewSnapshot,
    TabularPreviewRequest,
    TabularSchemaSnapshot,
    ValueLabelSnapshot,
    ValueLabelUpdateRequest,
    ValueLabelUpdateResult,
    VariableMetadataSnapshot,
    VariableMetadataUpdateRequest,
    VariableMetadataUpdateResult
} from "../provider-contract/runtimeProvider";


type VariableMetadata = VariableMetadataSnapshot["variables"][number];
type ValueLabelSet = ValueLabelSnapshot["valueLabels"][number];
type DeclaredMissingSet = DeclaredMissingSnapshot["declaredMissing"][number];


export const createColumn = function(input: Partial<TabularColumnSnapshot>): TabularColumnSnapshot {
    return {
        name: input.name || "",
        type: input.type || "",
        role: input.role || "data"
    };
};


export const createTabularPreview = function(input: Partial<TabularPreviewSnapshot>): TabularPreviewSnapshot {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        columns: input.columns || [],
        rows: input.rows || [],
        rowNames: input.rowNames || [],
        rowOffset: input.rowOffset,
        columnOffset: input.columnOffset,
        totalRowCount: input.totalRowCount,
        totalColumnCount: input.totalColumnCount,
        message: input.message || "",
        readAt: new Date().toISOString()
    };
};


export const createTabularSchema = function(input: Partial<TabularSchemaSnapshot>): TabularSchemaSnapshot {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        columns: input.columns || [],
        rowCount: Number.isFinite(Number(input.rowCount)) ? Number(input.rowCount) : 0,
        columnCount: Number.isFinite(Number(input.columnCount)) ? Number(input.columnCount) : 0,
        message: input.message || "",
        readAt: new Date().toISOString()
    };
};


const normalizePositiveInteger = function(value: unknown, fallback: number): number {
    const next = Number(value);

    if (!Number.isFinite(next) || next < 1) {
        return fallback;
    }

    return Math.floor(next);
};


export const createTabularPreviewRequest = function(input: string | Partial<TabularPreviewRequest>): TabularPreviewRequest {
    if (typeof input === "string") {
        return {
            objectName: input
        };
    }

    const columns = Array.isArray(input.columns)
        ? input.columns.map((column) => {
            return String(column || "").trim();
        }).filter((column) => {
            return column.length > 0;
        })
        : undefined;

    return {
        objectName: String(input.objectName || "").trim(),
        rowStart: input.rowStart === undefined ? undefined : normalizePositiveInteger(input.rowStart, 1),
        rowCount: input.rowCount === undefined ? undefined : normalizePositiveInteger(input.rowCount, 50),
        columns,
        columnCount: input.columnCount === undefined
            ? undefined
            : normalizePositiveInteger(input.columnCount, 8)
    };
};


export const createCellUpdateRequest = function(input: Partial<CellUpdateRequest>): CellUpdateRequest {
    return {
        objectName: input.objectName || "",
        rowIndex: Number(input.rowIndex),
        columnName: input.columnName || "",
        value: input.value,
        uiCommandVisibility: input.uiCommandVisibility === "visible" ? "visible" : "hidden",
        visibleCommandText: input.visibleCommandText || ""
    };
};


export const createCellUpdateResult = function(input: Partial<CellUpdateResult>): CellUpdateResult {
    const rowIndex = Number(input.rowIndex);

    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        rowIndex: Number.isFinite(rowIndex) ? rowIndex : -1,
        columnName: input.columnName || "",
        value: input.value,
        cell: input.cell
            ? {
                display: String(input.cell.display || ""),
                raw: String(input.cell.raw || ""),
                declaredMissing: input.cell.declaredMissing === true
            }
            : undefined,
        transcriptEvents: input.transcriptEvents || [],
        message: input.message || "",
        updatedAt: new Date().toISOString()
    };
};


export const createVariableMetadata = function(input: Partial<VariableMetadata>): VariableMetadata {
    const metadata: VariableMetadata = {
        name: input.name || "",
        type: input.type || "",
        role: input.role || "data",
        label: input.label || ""
    };

    if (input.width !== undefined) {
        metadata.width = input.width;
    }

    if (input.decimals !== undefined) {
        metadata.decimals = input.decimals;
    }

    if (input.values !== undefined) {
        metadata.values = input.values;
    }

    if (input.categories !== undefined) {
        metadata.categories = input.categories.map((category) => {
            return {
                value: category.value,
                label: category.label,
                isMissing: category.isMissing === true
            };
        });
    }

    if (input.missingRange !== undefined) {
        metadata.missingRange = input.missingRange
            ? {
                min: String(input.missingRange.min || ""),
                max: String(input.missingRange.max || "")
            }
            : null;
    }

    if (input.align !== undefined) {
        metadata.align = input.align;
    }

    if (input.measure !== undefined) {
        metadata.measure = input.measure;
    }

    return metadata;
};


export const createVariableMetadataSnapshot = function(input: Partial<VariableMetadataSnapshot>): VariableMetadataSnapshot {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        variables: input.variables || [],
        message: input.message || "",
        refreshedAt: new Date().toISOString()
    };
};


export const createVariableMetadataUpdateRequest = function(
    input: Partial<VariableMetadataUpdateRequest>
): VariableMetadataUpdateRequest {
    const metadataKey = input.metadataKey || "label";
    const value = input.value !== undefined ? String(input.value) : String(input.label || "");

    return {
        objectName: input.objectName || "",
        variableName: input.variableName || "",
        metadataKey,
        value,
        label: input.label !== undefined ? input.label : (metadataKey === "label" ? value : ""),
        uiCommandVisibility: input.uiCommandVisibility === "visible" ? "visible" : "hidden",
        visibleCommandText: input.visibleCommandText || ""
    };
};


export const createVariableMetadataUpdateResult = function(
    input: Partial<VariableMetadataUpdateResult>
): VariableMetadataUpdateResult {
    const metadataKey = input.metadataKey || "label";
    const value = input.value !== undefined ? String(input.value) : String(input.label || "");

    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        variableName: input.variableName || "",
        metadataKey,
        value,
        label: input.label !== undefined ? input.label : (metadataKey === "label" ? value : ""),
        transcriptEvents: input.transcriptEvents || [],
        message: input.message || "",
        updatedAt: new Date().toISOString()
    };
};


export const createValueLabelSet = function(input: Partial<ValueLabelSet>): ValueLabelSet {
    return {
        variable: input.variable || "",
        labels: input.labels || []
    };
};


export const createValueLabelSnapshot = function(input: Partial<ValueLabelSnapshot>): ValueLabelSnapshot {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        valueLabels: input.valueLabels || [],
        message: input.message || "",
        refreshedAt: new Date().toISOString()
    };
};


export const createValueLabelUpdateRequest = function(input: Partial<ValueLabelUpdateRequest>): ValueLabelUpdateRequest {
    return {
        objectName: input.objectName || "",
        variableName: input.variableName || "",
        labels: input.labels || [],
        uiCommandVisibility: input.uiCommandVisibility === "visible" ? "visible" : "hidden",
        visibleCommandText: input.visibleCommandText || ""
    };
};


export const createValueLabelUpdateResult = function(input: Partial<ValueLabelUpdateResult>): ValueLabelUpdateResult {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        variableName: input.variableName || "",
        labels: input.labels || [],
        transcriptEvents: input.transcriptEvents || [],
        message: input.message || "",
        updatedAt: new Date().toISOString()
    };
};


export const createDeclaredMissingSet = function(input: Partial<DeclaredMissingSet>): DeclaredMissingSet {
    return {
        variable: input.variable || "",
        values: input.values || []
    };
};


export const createDeclaredMissingSnapshot = function(input: Partial<DeclaredMissingSnapshot>): DeclaredMissingSnapshot {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        declaredMissing: input.declaredMissing || [],
        message: input.message || "",
        refreshedAt: new Date().toISOString()
    };
};


export const createDeclaredMissingUpdateRequest = function(input: Partial<DeclaredMissingUpdateRequest>): DeclaredMissingUpdateRequest {
    return {
        objectName: input.objectName || "",
        variableName: input.variableName || "",
        values: input.values || [],
        uiCommandVisibility: input.uiCommandVisibility === "visible" ? "visible" : "hidden",
        visibleCommandText: input.visibleCommandText || ""
    };
};


export const createDeclaredMissingUpdateResult = function(input: Partial<DeclaredMissingUpdateResult>): DeclaredMissingUpdateResult {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        variableName: input.variableName || "",
        values: input.values || [],
        transcriptEvents: input.transcriptEvents || [],
        message: input.message || "",
        updatedAt: new Date().toISOString()
    };
};


export const createCellUpdateBatchResult = function(input: Partial<CellUpdateBatchResult>): CellUpdateBatchResult {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        updated: input.updated || 0,
        failed: input.failed || 0,
        results: input.results || [],
        message: input.message || "",
        updatedAt: new Date().toISOString()
    };
};


export const createColumnRenameRequest = function(input: Partial<ColumnRenameRequest>): ColumnRenameRequest {
    return {
        objectName: input.objectName || "",
        fromName: input.fromName || "",
        toName: input.toName || "",
        uiCommandVisibility: input.uiCommandVisibility === "visible" ? "visible" : "hidden",
        visibleCommandText: input.visibleCommandText || ""
    };
};


export const createColumnRenameResult = function(input: Partial<ColumnRenameResult>): ColumnRenameResult {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        fromName: input.fromName || "",
        toName: input.toName || "",
        transcriptEvents: input.transcriptEvents || [],
        message: input.message || "",
        updatedAt: new Date().toISOString()
    };
};


export const createColumnInsertRequest = function(input: Partial<ColumnInsertRequest>): ColumnInsertRequest {
    return {
        objectName: input.objectName || "",
        referenceName: input.referenceName || "",
        newName: input.newName || "",
        position: input.position === "after" ? "after" : "before",
        uiCommandVisibility: input.uiCommandVisibility === "visible" ? "visible" : "hidden",
        visibleCommandText: input.visibleCommandText || ""
    };
};


export const createColumnInsertResult = function(input: Partial<ColumnInsertResult>): ColumnInsertResult {
    const columnIndex = Number(input.columnIndex);
    const columnCount = Number(input.columnCount);

    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        columnName: input.columnName || "",
        columnIndex: Number.isFinite(columnIndex) ? columnIndex : -1,
        columnCount: Number.isFinite(columnCount) ? columnCount : undefined,
        transcriptEvents: input.transcriptEvents || [],
        message: input.message || "",
        updatedAt: new Date().toISOString()
    };
};


export const createColumnRemoveRequest = function(input: Partial<ColumnRemoveRequest>): ColumnRemoveRequest {
    return {
        objectName: input.objectName || "",
        columnName: input.columnName || "",
        uiCommandVisibility: input.uiCommandVisibility === "visible" ? "visible" : "hidden",
        visibleCommandText: input.visibleCommandText || ""
    };
};


export const createColumnRemoveResult = function(input: Partial<ColumnRemoveResult>): ColumnRemoveResult {
    const columnCount = Number(input.columnCount);

    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        columnName: input.columnName || "",
        columnCount: Number.isFinite(columnCount) ? columnCount : undefined,
        transcriptEvents: input.transcriptEvents || [],
        message: input.message || "",
        updatedAt: new Date().toISOString()
    };
};


export const createRowNameUpdateRequest = function(input: Partial<RowNameUpdateRequest>): RowNameUpdateRequest {
    return {
        objectName: input.objectName || "",
        rowIndex: Number(input.rowIndex),
        name: input.name || "",
        uiCommandVisibility: input.uiCommandVisibility === "visible" ? "visible" : "hidden",
        visibleCommandText: input.visibleCommandText || ""
    };
};


export const createRowInsertRequest = function(input: Partial<RowInsertRequest>): RowInsertRequest {
    return {
        objectName: input.objectName || "",
        rowIndex: Number(input.rowIndex),
        name: input.name || "",
        position: input.position === "after" ? "after" : "before",
        uiCommandVisibility: input.uiCommandVisibility === "visible" ? "visible" : "hidden",
        visibleCommandText: input.visibleCommandText || ""
    };
};


export const createRowInsertResult = function(input: Partial<RowInsertResult>): RowInsertResult {
    const rowIndex = Number(input.rowIndex);
    const rowCount = Number(input.rowCount);

    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        rowIndex: Number.isFinite(rowIndex) ? rowIndex : -1,
        name: input.name || "",
        rowCount: Number.isFinite(rowCount) ? rowCount : undefined,
        transcriptEvents: input.transcriptEvents || [],
        message: input.message || "",
        updatedAt: new Date().toISOString()
    };
};


export const createRowRemoveRequest = function(input: Partial<RowRemoveRequest>): RowRemoveRequest {
    return {
        objectName: input.objectName || "",
        rowIndex: Number(input.rowIndex),
        uiCommandVisibility: input.uiCommandVisibility === "visible" ? "visible" : "hidden",
        visibleCommandText: input.visibleCommandText || ""
    };
};


export const createRowRemoveResult = function(input: Partial<RowRemoveResult>): RowRemoveResult {
    const rowIndex = Number(input.rowIndex);
    const rowCount = Number(input.rowCount);

    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        rowIndex: Number.isFinite(rowIndex) ? rowIndex : -1,
        rowCount: Number.isFinite(rowCount) ? rowCount : undefined,
        transcriptEvents: input.transcriptEvents || [],
        message: input.message || "",
        updatedAt: new Date().toISOString()
    };
};


export const createRowSortRequest = function(input: Partial<RowSortRequest>): RowSortRequest {
    return {
        objectName: input.objectName || "",
        columnName: input.columnName || "",
        direction: input.direction === "descending" ? "descending" : "ascending",
        naLast: input.naLast === undefined ? true : Boolean(input.naLast),
        emptyLast: input.emptyLast === undefined ? true : Boolean(input.emptyLast),
        uiCommandVisibility: input.uiCommandVisibility === "visible" ? "visible" : "hidden",
        visibleCommandText: input.visibleCommandText || ""
    };
};


export const createRowSortResult = function(input: Partial<RowSortResult>): RowSortResult {
    const rowCount = Number(input.rowCount);

    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        columnName: input.columnName || "",
        direction: input.direction === "descending" ? "descending" : "ascending",
        rowCount: Number.isFinite(rowCount) ? rowCount : undefined,
        command: input.command || "",
        transcriptEvents: input.transcriptEvents || [],
        message: input.message || "",
        updatedAt: new Date().toISOString()
    };
};


export const createRowNameUpdateResult = function(input: Partial<RowNameUpdateResult>): RowNameUpdateResult {
    const rowIndex = Number(input.rowIndex);

    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        rowIndex: Number.isFinite(rowIndex) ? rowIndex : -1,
        name: input.name || "",
        transcriptEvents: input.transcriptEvents || [],
        message: input.message || "",
        updatedAt: new Date().toISOString()
    };
};
