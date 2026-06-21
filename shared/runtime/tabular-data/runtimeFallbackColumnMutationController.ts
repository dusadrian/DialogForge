import type {
    ColumnInsertRequest,
    ColumnInsertResult,
    ColumnRemoveRequest,
    ColumnRemoveResult,
    ColumnRenameRequest,
    ColumnRenameResult
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeFallbackTabularRow,
    RuntimeFallbackTabularState
} from "../session/runtimeFallbackTabularState";
import {
    createColumnInsertResult,
    createColumnRemoveResult,
    createColumnRenameResult
} from "./tabularProtocol";


export interface RuntimeFallbackColumnMutationControllerOptions {
    state: RuntimeFallbackTabularState;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
}


export interface RuntimeFallbackColumnMutationController {
    rename(
        providerId: string,
        objectName: string,
        request: ColumnRenameRequest
    ): ColumnRenameResult;
    insert(
        providerId: string,
        objectName: string,
        request: ColumnInsertRequest
    ): ColumnInsertResult;
    remove(
        providerId: string,
        objectName: string,
        request: ColumnRemoveRequest
    ): ColumnRemoveResult;
}


export const createRuntimeFallbackColumnMutationController = function(
    options: RuntimeFallbackColumnMutationControllerOptions
): RuntimeFallbackColumnMutationController {
    const rowsFor = function(objectName: string): RuntimeFallbackTabularRow[] {
        return options.state.rows[objectName] || [];
    };

    return {
        rename: function(providerId, objectName, request) {
            if (!request.fromName || !request.toName) {
                return createColumnRenameResult({
                    status: "invalid",
                    providerId,
                    objectName,
                    fromName: request.fromName,
                    toName: request.toName,
                    message: "Both source and target column names are required."
                });
            }

            const rows = rowsFor(objectName);

            if (request.toName in (rows[0] || {})) {
                return createColumnRenameResult({
                    status: "conflict",
                    providerId,
                    objectName,
                    fromName: request.fromName,
                    toName: request.toName,
                    message: "Target column name already exists."
                });
            }

            let renamed = 0;

            rows.forEach((row) => {
                if (request.fromName in row) {
                    row[request.toName] = row[request.fromName];
                    delete row[request.fromName];
                    renamed += 1;
                }
            });

            if (renamed === 0) {
                return createColumnRenameResult({
                    status: "invalid-column",
                    providerId,
                    objectName,
                    fromName: request.fromName,
                    toName: request.toName,
                    message: "Source column is not available."
                });
            }

            options.recordRuntimeEvent(
                "tabular.column.renamed",
                objectName,
                "Placeholder column renamed.",
                {
                    fromName: request.fromName,
                    toName: request.toName
                }
            );

            return createColumnRenameResult({
                status: "updated",
                providerId,
                objectName,
                fromName: request.fromName,
                toName: request.toName,
                message: "Placeholder column renamed in session memory."
            });
        },
        insert: function(providerId, objectName, request) {
            const rows = rowsFor(objectName);
            const first = rows[0] || {};
            const columnNames = Object.keys(first);
            const referenceIndex = columnNames.indexOf(request.referenceName);

            if (!request.newName || referenceIndex < 0) {
                return createColumnInsertResult({
                    status: "invalid",
                    providerId,
                    objectName,
                    columnName: request.newName,
                    message: "A new column name and valid reference column are required."
                });
            }

            if (request.newName in first) {
                return createColumnInsertResult({
                    status: "conflict",
                    providerId,
                    objectName,
                    columnName: request.newName,
                    message: "Column name already exists."
                });
            }

            const insertAt = request.position === "after"
                ? referenceIndex + 1
                : referenceIndex;

            options.state.rows[objectName] = rows.map((row) => {
                const next: RuntimeFallbackTabularRow = {};

                columnNames.forEach((columnName, index) => {
                    if (index === insertAt) {
                        next[request.newName] = "";
                    }

                    next[columnName] = row[columnName];
                });

                if (insertAt >= columnNames.length) {
                    next[request.newName] = "";
                }

                return next;
            });

            options.recordRuntimeEvent(
                "tabular.column.inserted",
                objectName,
                "Placeholder column inserted.",
                {
                    columnName: request.newName,
                    columnIndex: insertAt
                }
            );

            return createColumnInsertResult({
                status: "updated",
                providerId,
                objectName,
                columnName: request.newName,
                columnIndex: insertAt,
                message: "Placeholder column inserted in session memory."
            });
        },
        remove: function(providerId, objectName, request) {
            const rows = rowsFor(objectName);

            if (!request.columnName || !(request.columnName in (rows[0] || {}))) {
                return createColumnRemoveResult({
                    status: "invalid-column",
                    providerId,
                    objectName,
                    columnName: request.columnName,
                    message: "Column is not available."
                });
            }

            rows.forEach((row) => {
                delete row[request.columnName];
            });

            options.recordRuntimeEvent(
                "tabular.column.removed",
                objectName,
                "Placeholder column removed.",
                {
                    columnName: request.columnName
                }
            );

            return createColumnRemoveResult({
                status: "updated",
                providerId,
                objectName,
                columnName: request.columnName,
                message: "Placeholder column removed from session memory."
            });
        }
    };
};
