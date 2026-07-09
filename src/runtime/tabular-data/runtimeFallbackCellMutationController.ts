import type {
    CellUpdateBatchResult,
    CellUpdateRequest,
    CellUpdateResult
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeFallbackTabularState
} from "../session/runtimeFallbackTabularState";
import {
    createCellUpdateBatchResult,
    createCellUpdateResult
} from "./tabularProtocol";


export interface RuntimeFallbackCellMutationControllerOptions {
    state: RuntimeFallbackTabularState;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
}


export interface RuntimeFallbackCellMutationController {
    write(
        providerId: string,
        objectName: string,
        request: CellUpdateRequest
    ): CellUpdateResult;
    createBatchResult(
        providerId: string,
        fallbackObjectName: string,
        results: CellUpdateResult[]
    ): CellUpdateBatchResult;
}


export const createRuntimeFallbackCellMutationController = function(
    options: RuntimeFallbackCellMutationControllerOptions
): RuntimeFallbackCellMutationController {
    return {
        write: function(providerId, objectName, request) {
            const row = options.state.rows[objectName]?.[request.rowIndex];

            if (!row || !(request.columnName in row)) {
                return createCellUpdateResult({
                    status: "invalid-cell",
                    providerId,
                    objectName,
                    rowIndex: request.rowIndex,
                    columnName: request.columnName,
                    value: request.value,
                    message: "Cell address is not valid."
                });
            }

            row[request.columnName] = request.value;
            options.recordRuntimeEvent(
                "tabular.cell.updated",
                objectName,
                "Placeholder cell updated.",
                {
                    rowIndex: request.rowIndex,
                    columnName: request.columnName
                }
            );

            return createCellUpdateResult({
                status: "updated",
                providerId,
                objectName,
                rowIndex: request.rowIndex,
                columnName: request.columnName,
                value: request.value,
                message: "Placeholder cell updated in session memory."
            });
        },
        createBatchResult: function(providerId, fallbackObjectName, results) {
            const updated = results.filter((result) => {
                return result.status === "updated";
            }).length;
            const objectName = results.length > 0
                ? results[0].objectName
                : fallbackObjectName;

            return createCellUpdateBatchResult({
                status: updated === results.length ? "updated" : "partial",
                providerId,
                objectName,
                updated,
                failed: results.length - updated,
                results,
                message: "Cell update batch processed."
            });
        }
    };
};
