import type {
    CellUpdateBatchResult,
    CellUpdateRequest,
    CellUpdateResult,
    RuntimeSessionSnapshot,
    RuntimeTabularController
} from "../provider-contract/runtimeProvider";
import {
    createCellUpdateResult
} from "./tabularProtocol";
import type {
    RuntimeFallbackCellMutationController
} from "./runtimeFallbackCellMutationController";


export interface RuntimeCellMutationExecutionControllerOptions {
    providerTabularController?: RuntimeTabularController;
    fallbackCellMutationController: RuntimeFallbackCellMutationController;
    getSnapshot(): RuntimeSessionSnapshot;
    getWorkspaceGeneration(): number;
    getActiveObjectName(): string;
    materializeRows(objectName: string): boolean;
}


export interface RuntimeCellMutationExecutionController {
    writeCell(request: CellUpdateRequest): Promise<CellUpdateResult>;
    writeCells(requests: CellUpdateRequest[]): Promise<CellUpdateBatchResult>;
}


export const createRuntimeCellMutationExecutionController = function(
    options: RuntimeCellMutationExecutionControllerOptions
): RuntimeCellMutationExecutionController {
    const writeCell = async function(request: CellUpdateRequest): Promise<CellUpdateResult> {
        const snapshot = options.getSnapshot();
        const targetName = request.objectName || options.getActiveObjectName();

        if (snapshot.status !== "ready") {
            return createCellUpdateResult({
                status: "unavailable",
                providerId: snapshot.providerId,
                objectName: targetName,
                rowIndex: request.rowIndex,
                columnName: request.columnName,
                value: request.value,
                message: "Runtime session is not ready."
            });
        }

        if (targetName && options.providerTabularController) {
            return options.providerTabularController.writeCell(
                Object.assign({}, request, {
                    objectName: targetName
                }),
                snapshot
            );
        }

        if (!targetName || !options.materializeRows(targetName)) {
            return createCellUpdateResult({
                status: "not-tabular",
                providerId: snapshot.providerId,
                objectName: targetName,
                rowIndex: request.rowIndex,
                columnName: request.columnName,
                value: request.value,
                message: "Object does not advertise tabular write support."
            });
        }

        return options.fallbackCellMutationController.write(
            snapshot.providerId,
            targetName,
            request
        );
    };

    return {
        writeCell,
        writeCells: async function(requests) {
            const generation = options.getWorkspaceGeneration();
            const snapshot = options.getSnapshot();
            const activeObjectName = options.getActiveObjectName();
            const results = [];

            for (const request of requests || []) {
                if (generation !== options.getWorkspaceGeneration()) {
                    results.push(createCellUpdateResult({
                        status: "unavailable",
                        providerId: snapshot.providerId,
                        objectName: request.objectName || activeObjectName,
                        rowIndex: request.rowIndex,
                        columnName: request.columnName,
                        value: request.value,
                        message: "Runtime session changed; this cell edit was not attempted."
                    }));
                    continue;
                }

                results.push(await writeCell(request));
            }

            return options.fallbackCellMutationController.createBatchResult(
                snapshot.providerId,
                activeObjectName,
                results
            );
        }
    };
};
