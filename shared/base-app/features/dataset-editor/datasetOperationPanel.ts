import type { CopyPayload } from "../../../dataset-editor/clipboard/copyPayload";
import type { PastePayload } from "../../../dataset-editor/clipboard/pastePayload";
import type { ClipboardResult } from "../../../shell-electron/clipboard/clipboardResult";
import type {
    CellUpdateBatchResult,
    CellUpdateResult,
    ColumnInsertResult,
    ColumnRemoveResult,
    ColumnRenameResult,
    DeclaredMissingUpdateResult,
    RowInsertResult,
    RowNameUpdateResult,
    RowRemoveResult,
    RowSortResult,
    ValueLabelUpdateResult,
    VariableMetadataUpdateResult
} from "../../../runtime/provider-contract/runtimeProvider";


interface DatasetOperationHelpers {
    appendField(host: HTMLElement, label: string, value: unknown): void;
    empty(host: HTMLElement): void;
}


interface PasteApplyResult {
    status: string;
    updates: number;
    failed?: number;
    results?: Array<
        CellUpdateResult
        | DeclaredMissingUpdateResult
        | ValueLabelUpdateResult
        | VariableMetadataUpdateResult
    >;
    message: string;
}


const renderCellUpdate = function(
    status: HTMLElement,
    result: CellUpdateResult | CellUpdateBatchResult,
    helpers: DatasetOperationHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "object", result.objectName);
    if ("rowIndex" in result) {
        helpers.appendField(status, "cell", result.rowIndex + ", " + result.columnName);
    }
    helpers.appendField(status, "message", result.message);
};


const renderColumnRename = function(
    status: HTMLElement,
    result: ColumnRenameResult,
    helpers: DatasetOperationHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "object", result.objectName);
    helpers.appendField(status, "from", result.fromName);
    helpers.appendField(status, "to", result.toName);
    helpers.appendField(status, "message", result.message);
};


const renderColumnStructure = function(
    status: HTMLElement,
    result: ColumnInsertResult | ColumnRemoveResult,
    helpers: DatasetOperationHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "object", result.objectName);
    helpers.appendField(status, "column", result.columnName);
    if ("columnIndex" in result) {
        helpers.appendField(status, "index", result.columnIndex);
    }
    helpers.appendField(status, "message", result.message);
};


const renderCommandRequestStatus = function(
    status: HTMLElement,
    result: { status: string; message: string },
    helpers: DatasetOperationHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "message", result.message);
};


const renderRowNameUpdate = function(
    status: HTMLElement,
    result: RowNameUpdateResult,
    helpers: DatasetOperationHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "object", result.objectName);
    helpers.appendField(status, "row", result.rowIndex);
    helpers.appendField(status, "name", result.name);
    helpers.appendField(status, "message", result.message);
};


const renderRowStructure = function(
    status: HTMLElement,
    result: RowInsertResult | RowRemoveResult | RowSortResult,
    helpers: DatasetOperationHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "object", result.objectName);
    if ("rowIndex" in result) {
        helpers.appendField(status, "row", result.rowIndex);
    }
    if ("columnName" in result) {
        helpers.appendField(status, "column", result.columnName);
        helpers.appendField(status, "direction", result.direction);
    }
    helpers.appendField(status, "message", result.message);
};


const renderCopyPayload = function(
    status: HTMLElement,
    payload: CopyPayload,
    helpers: DatasetOperationHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", payload.status);
    helpers.appendField(status, "kind", payload.kind);
    helpers.appendField(status, "text", payload.text);
    helpers.appendField(status, "cells", String(payload.cells.length));
    helpers.appendField(status, "message", payload.message);
};


const renderClipboardResult = function(
    status: HTMLElement,
    result: ClipboardResult,
    helpers: DatasetOperationHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "clipboard", result.status);
    helpers.appendField(status, "length", result.textLength);
    helpers.appendField(status, "message", result.message);
};


const renderPastePayload = function(
    status: HTMLElement,
    payload: PastePayload,
    helpers: DatasetOperationHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", payload.status);
    helpers.appendField(status, "width", payload.width);
    helpers.appendField(status, "height", payload.height);
    helpers.appendField(status, "message", payload.message);

    if (payload.status === "ready") {
        helpers.appendField(status, "first row", payload.rows[0]);
    }
};


const renderPasteApplyResult = function(
    documentRef: Document,
    status: HTMLElement,
    details: HTMLElement,
    result: PasteApplyResult,
    helpers: DatasetOperationHelpers
): void {
    helpers.empty(status);
    helpers.empty(details);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "updates", result.updates);
    if (Number.isFinite(result.failed)) {
        helpers.appendField(status, "failed", result.failed);
    }
    helpers.appendField(status, "message", result.message);

    if (Array.isArray(result.results) && result.results.length > 0) {
        result.results.forEach((updateResult) => {
            const row = documentRef.createElement("div");

            row.className = "commandField";
            if ("rowIndex" in updateResult) {
                helpers.appendField(row, "cell", updateResult.rowIndex + ", " + updateResult.columnName);
            } else if ("metadataKey" in updateResult) {
                helpers.appendField(row, "metadata", updateResult.variableName + ", " + updateResult.metadataKey);
            } else if ("labels" in updateResult) {
                helpers.appendField(row, "value labels", updateResult.variableName + ", " + updateResult.labels.length);
            } else {
                helpers.appendField(row, "missing values", updateResult.variableName + ", " + updateResult.values.length);
            }
            helpers.appendField(row, "status", updateResult.status);
            helpers.appendField(row, "message", updateResult.message);
            details.appendChild(row);
        });
    }
};


const renderVariableMetadataUpdate = function(
    status: HTMLElement,
    result: VariableMetadataUpdateResult,
    helpers: DatasetOperationHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "object", result.objectName);
    helpers.appendField(status, "variable", result.variableName);
    helpers.appendField(status, "metadata", result.metadataKey);
    helpers.appendField(status, "value", result.value);
    helpers.appendField(status, "label", result.label);
    helpers.appendField(status, "message", result.message);
};


const renderValueLabelUpdate = function(
    status: HTMLElement,
    result: ValueLabelUpdateResult,
    helpers: DatasetOperationHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "object", result.objectName);
    helpers.appendField(status, "variable", result.variableName);
    helpers.appendField(status, "labels", String(result.labels.length));
    helpers.appendField(status, "message", result.message);
};


const renderDeclaredMissingUpdate = function(
    status: HTMLElement,
    result: DeclaredMissingUpdateResult,
    helpers: DatasetOperationHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "object", result.objectName);
    helpers.appendField(status, "variable", result.variableName);
    helpers.appendField(status, "values", String(result.values.length));
    helpers.appendField(status, "message", result.message);
};


export const datasetOperationPanelApi = {
    renderCellUpdate,
    renderClipboardResult,
    renderColumnRename,
    renderColumnStructure,
    renderCommandRequestStatus,
    renderCopyPayload,
    renderDeclaredMissingUpdate,
    renderPasteApplyResult,
    renderPastePayload,
    renderRowNameUpdate,
    renderRowStructure,
    renderValueLabelUpdate,
    renderVariableMetadataUpdate
};
