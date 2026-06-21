import type {
    ColumnInsertRequest,
    ColumnInsertResult,
    ColumnRemoveRequest,
    ColumnRemoveResult,
    ColumnRenameRequest,
    ColumnRenameResult,
    RuntimeCapability,
    RuntimeSessionSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createColumnInsertResult,
    createColumnRemoveResult,
    createColumnRenameResult
} from "./tabularProtocol";
import type {
    RuntimeColumnMutationExecutionController
} from "./runtimeColumnMutationExecutionController";


export interface RuntimeColumnMutationOperationControllerOptions {
    columnMutationExecutionController: RuntimeColumnMutationExecutionController;
    getSnapshot(): RuntimeSessionSnapshot;
    getActiveObjectName(): string;
    hasRuntimeCapability(capability: RuntimeCapability): boolean;
}


export interface RuntimeColumnMutationOperationController {
    renameColumn(request: ColumnRenameRequest): Promise<ColumnRenameResult>;
    insertColumn(request: ColumnInsertRequest): Promise<ColumnInsertResult>;
    removeColumn(request: ColumnRemoveRequest): Promise<ColumnRemoveResult>;
}


export const createRuntimeColumnMutationOperationController = function(
    options: RuntimeColumnMutationOperationControllerOptions
): RuntimeColumnMutationOperationController {
    return {
        renameColumn: async function(request): Promise<ColumnRenameResult> {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (snapshot.status !== "ready") {
                return createColumnRenameResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    fromName: request.fromName,
                    toName: request.toName,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("tabular.columnNames")) {
                return createColumnRenameResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    fromName: request.fromName,
                    toName: request.toName,
                    message: "Selected provider does not advertise column-name editing."
                });
            }

            return options.columnMutationExecutionController.renameColumn(request);
        },
        insertColumn: async function(request): Promise<ColumnInsertResult> {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (snapshot.status !== "ready") {
                return createColumnInsertResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    columnName: request.newName,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("tabular.writeColumns")) {
                return createColumnInsertResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    columnName: request.newName,
                    message: "Selected provider does not advertise column editing."
                });
            }

            return options.columnMutationExecutionController.insertColumn(request);
        },
        removeColumn: async function(request): Promise<ColumnRemoveResult> {
            const snapshot = options.getSnapshot();
            const targetName = request.objectName || options.getActiveObjectName();

            if (snapshot.status !== "ready") {
                return createColumnRemoveResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    columnName: request.columnName,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("tabular.writeColumns")) {
                return createColumnRemoveResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    columnName: request.columnName,
                    message: "Selected provider does not advertise column editing."
                });
            }

            return options.columnMutationExecutionController.removeColumn(request);
        }
    };
};
