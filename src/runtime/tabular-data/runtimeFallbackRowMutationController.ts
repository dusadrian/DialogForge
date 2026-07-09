import type {
    RowInsertRequest,
    RowInsertResult,
    RowNameUpdateRequest,
    RowNameUpdateResult,
    RowRemoveRequest,
    RowRemoveResult,
    RowSortRequest,
    RowSortResult
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeFallbackTabularRow,
    RuntimeFallbackTabularState
} from "../session/runtimeFallbackTabularState";
import {
    createRowInsertResult,
    createRowNameUpdateResult,
    createRowRemoveResult,
    createRowSortResult
} from "./tabularProtocol";


export interface RuntimeFallbackRowMutationControllerOptions {
    state: RuntimeFallbackTabularState;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
}


export interface RuntimeFallbackRowMutationController {
    insert(
        providerId: string,
        objectName: string,
        request: RowInsertRequest
    ): RowInsertResult;
    remove(
        providerId: string,
        objectName: string,
        request: RowRemoveRequest
    ): RowRemoveResult;
    sort(
        providerId: string,
        objectName: string,
        request: RowSortRequest
    ): RowSortResult;
    updateName(
        providerId: string,
        objectName: string,
        request: RowNameUpdateRequest
    ): RowNameUpdateResult;
}


const isEmptySortValue = function(value: unknown): boolean {
    return value === null || value === undefined || value === "";
};


const compareSortValues = function(a: unknown, b: unknown): number {
    if (typeof a === "number" && typeof b === "number") {
        return a - b;
    }

    const numericA = typeof a === "string" ? Number(a) : NaN;
    const numericB = typeof b === "string" ? Number(b) : NaN;

    if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
        return numericA - numericB;
    }

    return String(a).localeCompare(String(b), undefined, {
        numeric: true,
        sensitivity: "base"
    });
};


export const createRuntimeFallbackRowMutationController = function(
    options: RuntimeFallbackRowMutationControllerOptions
): RuntimeFallbackRowMutationController {
    const rowsFor = function(objectName: string): RuntimeFallbackTabularRow[] {
        return options.state.rows[objectName] || [];
    };

    return {
        insert: function(providerId, objectName, request) {
            const rows = rowsFor(objectName);
            const requestedIndex = Math.max(
                0,
                Math.min(rows.length - 1, Math.round(Number(request.rowIndex)))
            );
            const insertAt = request.position === "after"
                ? requestedIndex + 1
                : requestedIndex;
            const emptyRow: RuntimeFallbackTabularRow = {};

            Object.keys(rows[0] || {}).forEach((columnName) => {
                emptyRow[columnName] = "";
            });

            rows.splice(insertAt, 0, emptyRow);

            if (options.state.rowNames[objectName]) {
                options.state.rowNames[objectName].splice(insertAt, 0, "");
            }

            options.recordRuntimeEvent(
                "tabular.row.inserted",
                objectName,
                "Placeholder row inserted.",
                {
                    rowIndex: insertAt
                }
            );

            return createRowInsertResult({
                status: "updated",
                providerId,
                objectName,
                rowIndex: insertAt,
                message: "Placeholder row inserted in session memory."
            });
        },
        remove: function(providerId, objectName, request) {
            const rowIndex = Math.round(Number(request.rowIndex));
            const rows = rowsFor(objectName);

            if (!Number.isFinite(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) {
                return createRowRemoveResult({
                    status: "invalid-row",
                    providerId,
                    objectName,
                    rowIndex,
                    message: "Row is not available."
                });
            }

            rows.splice(rowIndex, 1);

            if (options.state.rowNames[objectName]) {
                options.state.rowNames[objectName].splice(rowIndex, 1);
            }

            options.recordRuntimeEvent(
                "tabular.row.removed",
                objectName,
                "Placeholder row removed.",
                {
                    rowIndex
                }
            );

            return createRowRemoveResult({
                status: "updated",
                providerId,
                objectName,
                rowIndex,
                message: "Placeholder row removed from session memory."
            });
        },
        sort: function(providerId, objectName, request) {
            const rows = rowsFor(objectName);
            const first = rows[0] || {};

            if (!request.columnName || !(request.columnName in first)) {
                return createRowSortResult({
                    status: "invalid-column",
                    providerId,
                    objectName,
                    columnName: request.columnName,
                    direction: request.direction,
                    message: "Sort column is not available."
                });
            }

            const directionMultiplier = request.direction === "descending" ? -1 : 1;
            const emptyMultiplier = request.emptyLast === false ? -1 : 1;
            const rowNames = options.state.rowNames[objectName] || [];
            const pairs = rows.map((row, index) => {
                return {
                    row,
                    rowName: rowNames[index] || ""
                };
            });

            pairs.sort((left, right) => {
                const leftValue = left.row[request.columnName];
                const rightValue = right.row[request.columnName];
                const leftEmpty = isEmptySortValue(leftValue);
                const rightEmpty = isEmptySortValue(rightValue);

                if (leftEmpty || rightEmpty) {
                    if (leftEmpty === rightEmpty) {
                        return 0;
                    }

                    return leftEmpty ? emptyMultiplier : -emptyMultiplier;
                }

                return compareSortValues(leftValue, rightValue) * directionMultiplier;
            });

            options.state.rows[objectName] = pairs.map((pair) => {
                return pair.row;
            });

            if (options.state.rowNames[objectName]) {
                options.state.rowNames[objectName] = pairs.map((pair) => {
                    return pair.rowName;
                });
            }

            options.recordRuntimeEvent(
                "tabular.rows.sorted",
                objectName,
                "Placeholder rows sorted.",
                {
                    columnName: request.columnName,
                    direction: request.direction
                }
            );

            return createRowSortResult({
                status: "updated",
                providerId,
                objectName,
                columnName: request.columnName,
                direction: request.direction,
                message: "Placeholder rows sorted in session memory."
            });
        },
        updateName: function(providerId, objectName, request) {
            const rowIndex = Math.round(Number(request.rowIndex));
            const name = String(request.name || "").trim();
            const rows = rowsFor(objectName);

            if (!Number.isFinite(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) {
                return createRowNameUpdateResult({
                    status: "invalid-row",
                    providerId,
                    objectName,
                    rowIndex,
                    name,
                    message: "Row is not available."
                });
            }

            if (!name) {
                return createRowNameUpdateResult({
                    status: "invalid",
                    providerId,
                    objectName,
                    rowIndex,
                    name,
                    message: "Row name is required."
                });
            }

            if (!options.state.rowNames[objectName]) {
                options.state.rowNames[objectName] = [];
            }

            options.state.rowNames[objectName][rowIndex] = name;
            options.recordRuntimeEvent(
                "tabular.row-name.updated",
                objectName,
                "Placeholder row name updated.",
                {
                    rowIndex,
                    name
                }
            );

            return createRowNameUpdateResult({
                status: "updated",
                providerId,
                objectName,
                rowIndex,
                name,
                message: "Placeholder row name updated in session memory."
            });
        }
    };
};
