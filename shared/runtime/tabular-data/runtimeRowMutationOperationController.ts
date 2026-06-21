import type {
    RowInsertRequest,
    RowInsertResult,
    RowNameUpdateRequest,
    RowNameUpdateResult,
    RowRemoveRequest,
    RowRemoveResult,
    RowSortRequest,
    RowSortResult,
    RuntimeCapability,
    RuntimeSessionSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createRowInsertResult,
    createRowNameUpdateResult,
    createRowRemoveResult,
    createRowSortResult
} from "./tabularProtocol";
import type {
    RuntimeRowMutationExecutionController
} from "./runtimeRowMutationExecutionController";


export interface RuntimeRowMutationOperationControllerOptions {
    rowMutationExecutionController: RuntimeRowMutationExecutionController;
    getSnapshot(): RuntimeSessionSnapshot;
    getActiveObjectName(): string;
    hasRuntimeCapability(capability: RuntimeCapability): boolean;
}


export interface RuntimeRowMutationOperationController {
    insertRow(request: RowInsertRequest): Promise<RowInsertResult>;
    removeRow(request: RowRemoveRequest): Promise<RowRemoveResult>;
    sortRows(request: RowSortRequest): Promise<RowSortResult>;
    updateRowName(request: RowNameUpdateRequest): Promise<RowNameUpdateResult>;
}


export const createRuntimeRowMutationOperationController = function(
    options: RuntimeRowMutationOperationControllerOptions
): RuntimeRowMutationOperationController {
    return {
        insertRow: async function(request): Promise<RowInsertResult> {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (snapshot.status !== "ready") {
                return createRowInsertResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    rowIndex: request.rowIndex,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("tabular.writeRows")) {
                return createRowInsertResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    rowIndex: request.rowIndex,
                    message: "Selected provider does not advertise row editing."
                });
            }

            return options.rowMutationExecutionController.insertRow(request);
        },
        removeRow: async function(request): Promise<RowRemoveResult> {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (snapshot.status !== "ready") {
                return createRowRemoveResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    rowIndex: request.rowIndex,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("tabular.writeRows")) {
                return createRowRemoveResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    rowIndex: request.rowIndex,
                    message: "Selected provider does not advertise row editing."
                });
            }

            return options.rowMutationExecutionController.removeRow(request);
        },
        sortRows: async function(request): Promise<RowSortResult> {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (snapshot.status !== "ready") {
                return createRowSortResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    columnName: request.columnName,
                    direction: request.direction,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("tabular.writeRows")) {
                return createRowSortResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    columnName: request.columnName,
                    direction: request.direction,
                    message: "Selected provider does not advertise row editing."
                });
            }

            return options.rowMutationExecutionController.sortRows(request);
        },
        updateRowName: async function(request): Promise<RowNameUpdateResult> {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();
            const rowIndex = Math.round(Number(request.rowIndex));
            const name = String(request.name || "").trim();

            if (snapshot.status !== "ready") {
                return createRowNameUpdateResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    rowIndex,
                    name,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("tabular.rowNames")) {
                return createRowNameUpdateResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    rowIndex,
                    name,
                    message: "Selected provider does not advertise row-name editing."
                });
            }

            return options.rowMutationExecutionController.updateRowName(request);
        }
    };
};
