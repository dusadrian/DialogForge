import type {
    RowInsertRequest,
    RowInsertResult,
    RowNameUpdateRequest,
    RowNameUpdateResult,
    RowRemoveRequest,
    RowRemoveResult,
    RowSortRequest,
    RowSortResult,
    RuntimeSessionSnapshot,
    RuntimeTabularController
} from "../provider-contract/runtimeProvider";
import {
    createRowInsertResult,
    createRowNameUpdateResult,
    createRowRemoveResult,
    createRowSortResult
} from "./tabularProtocol";
import type {
    RuntimeFallbackRowMutationController
} from "./runtimeFallbackRowMutationController";


export interface RuntimeRowMutationExecutionControllerOptions {
    providerTabularController?: RuntimeTabularController;
    fallbackRowMutationController: RuntimeFallbackRowMutationController;
    getSnapshot(): RuntimeSessionSnapshot;
    getActiveObjectName(): string;
    materializeRows(objectName: string): boolean;
}


export interface RuntimeRowMutationExecutionController {
    insertRow(request: RowInsertRequest): Promise<RowInsertResult>;
    removeRow(request: RowRemoveRequest): Promise<RowRemoveResult>;
    sortRows(request: RowSortRequest): Promise<RowSortResult>;
    updateRowName(request: RowNameUpdateRequest): Promise<RowNameUpdateResult>;
}


export const createRuntimeRowMutationExecutionController = function(
    options: RuntimeRowMutationExecutionControllerOptions
): RuntimeRowMutationExecutionController {
    return {
        insertRow: async function(request) {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (targetName && options.providerTabularController?.insertRow) {
                return options.providerTabularController.insertRow(
                    Object.assign({}, request, {
                        objectName: targetName
                    }),
                    snapshot
                );
            }

            if (!targetName || !options.materializeRows(targetName)) {
                return createRowInsertResult({
                    status: "not-tabular",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    rowIndex: request.rowIndex,
                    message: "Object does not advertise row editing."
                });
            }

            return options.fallbackRowMutationController.insert(
                snapshot.providerId,
                targetName,
                request
            );
        },
        removeRow: async function(request) {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();
            const rowIndex = Math.round(Number(request.rowIndex));

            if (targetName && options.providerTabularController?.removeRow) {
                return options.providerTabularController.removeRow(
                    Object.assign({}, request, {
                        objectName: targetName
                    }),
                    snapshot
                );
            }

            if (!targetName || !options.materializeRows(targetName)) {
                return createRowRemoveResult({
                    status: "not-tabular",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    rowIndex,
                    message: "Object does not advertise row editing."
                });
            }

            return options.fallbackRowMutationController.remove(
                snapshot.providerId,
                targetName,
                request
            );
        },
        sortRows: async function(request) {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (targetName && options.providerTabularController?.sortRows) {
                return options.providerTabularController.sortRows(
                    Object.assign({}, request, {
                        objectName: targetName
                    }),
                    snapshot
                );
            }

            if (!targetName || !options.materializeRows(targetName)) {
                return createRowSortResult({
                    status: "not-tabular",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    columnName: request.columnName,
                    direction: request.direction,
                    message: "Object does not advertise row editing."
                });
            }

            return options.fallbackRowMutationController.sort(
                snapshot.providerId,
                targetName,
                request
            );
        },
        updateRowName: async function(request) {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();
            const rowIndex = Math.round(Number(request.rowIndex));
            const name = String(request.name || "").trim();

            if (targetName && options.providerTabularController?.updateRowName) {
                return options.providerTabularController.updateRowName(
                    Object.assign({}, request, {
                        objectName: targetName
                    }),
                    snapshot
                );
            }

            if (!targetName || !options.materializeRows(targetName)) {
                return createRowNameUpdateResult({
                    status: "not-tabular",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    rowIndex,
                    name,
                    message: "Object does not advertise row-name editing."
                });
            }

            return options.fallbackRowMutationController.updateName(
                snapshot.providerId,
                targetName,
                request
            );
        }
    };
};
