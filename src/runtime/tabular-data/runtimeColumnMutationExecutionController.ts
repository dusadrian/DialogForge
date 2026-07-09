import type {
    ColumnInsertRequest,
    ColumnInsertResult,
    ColumnRemoveRequest,
    ColumnRemoveResult,
    ColumnRenameRequest,
    ColumnRenameResult,
    RuntimeSessionSnapshot,
    RuntimeTabularController
} from "../provider-contract/runtimeProvider";
import {
    createColumnInsertResult,
    createColumnRemoveResult,
    createColumnRenameResult
} from "./tabularProtocol";
import type {
    RuntimeFallbackColumnMutationController
} from "./runtimeFallbackColumnMutationController";


export interface RuntimeColumnMutationExecutionControllerOptions {
    providerTabularController?: RuntimeTabularController;
    fallbackColumnMutationController: RuntimeFallbackColumnMutationController;
    getSnapshot(): RuntimeSessionSnapshot;
    getActiveObjectName(): string;
    materializeRows(objectName: string): boolean;
}


export interface RuntimeColumnMutationExecutionController {
    renameColumn(request: ColumnRenameRequest): Promise<ColumnRenameResult>;
    insertColumn(request: ColumnInsertRequest): Promise<ColumnInsertResult>;
    removeColumn(request: ColumnRemoveRequest): Promise<ColumnRemoveResult>;
}


export const createRuntimeColumnMutationExecutionController = function(
    options: RuntimeColumnMutationExecutionControllerOptions
): RuntimeColumnMutationExecutionController {
    return {
        renameColumn: async function(request) {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (targetName && options.providerTabularController?.renameColumn) {
                return options.providerTabularController.renameColumn(
                    Object.assign({}, request, {
                        objectName: targetName
                    }),
                    snapshot
                );
            }

            if (!targetName || !options.materializeRows(targetName)) {
                return createColumnRenameResult({
                    status: "not-tabular",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    fromName: request.fromName,
                    toName: request.toName,
                    message: "Object does not advertise column-name support."
                });
            }

            return options.fallbackColumnMutationController.rename(
                snapshot.providerId,
                targetName,
                request
            );
        },
        insertColumn: async function(request) {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (targetName && options.providerTabularController?.insertColumn) {
                return options.providerTabularController.insertColumn(
                    Object.assign({}, request, {
                        objectName: targetName
                    }),
                    snapshot
                );
            }

            if (!targetName || !options.materializeRows(targetName)) {
                return createColumnInsertResult({
                    status: "not-tabular",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    columnName: request.newName,
                    message: "Object does not advertise column editing."
                });
            }

            return options.fallbackColumnMutationController.insert(
                snapshot.providerId,
                targetName,
                request
            );
        },
        removeColumn: async function(request) {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (targetName && options.providerTabularController?.removeColumn) {
                return options.providerTabularController.removeColumn(
                    Object.assign({}, request, {
                        objectName: targetName
                    }),
                    snapshot
                );
            }

            if (!targetName || !options.materializeRows(targetName)) {
                return createColumnRemoveResult({
                    status: "not-tabular",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    columnName: request.columnName,
                    message: "Object does not advertise column editing."
                });
            }

            return options.fallbackColumnMutationController.remove(
                snapshot.providerId,
                targetName,
                request
            );
        }
    };
};
