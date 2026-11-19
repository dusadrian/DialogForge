import {
    createDialogExecutionResult
} from "../dialogs/dialogExecutionProtocol";
import {
    createStartupTaskExecutionResult
} from "../startup/startupTaskProtocol";
import {
    createUnsupportedOperationResult
} from "../../core/contracts/operationResult";
import type {
    DialogExecutionRequest,
    DialogExecutionResult,
    RuntimeCapability,
    RuntimeSessionSnapshot,
    StartupTaskExecutionRequest,
    StartupTaskExecutionResult
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeCompositionExecutionController
} from "./runtimeCompositionExecutionController";


export interface RuntimeCompositionOperationControllerOptions {
    compositionExecutionController: RuntimeCompositionExecutionController;
    getSnapshot(): RuntimeSessionSnapshot;
    hasRuntimeCapability(capability: RuntimeCapability): boolean;
}


export interface RuntimeCompositionOperationController {
    executeDialog(request: DialogExecutionRequest): DialogExecutionResult;
    executeStartupTask(
        request: StartupTaskExecutionRequest
    ): Promise<StartupTaskExecutionResult>;
}


export const createRuntimeCompositionOperationController = function(
    options: RuntimeCompositionOperationControllerOptions
): RuntimeCompositionOperationController {
    let startupGeneration: number | undefined;
    const automaticTasks = new Map<string, Promise<StartupTaskExecutionResult>>();

    return {
        executeDialog: function(request): DialogExecutionResult {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                return createDialogExecutionResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    dialogId: request.dialogId,
                    owner: request.owner,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("commands.invisible")) {
                return createDialogExecutionResult(createUnsupportedOperationResult({
                    providerId: snapshot.providerId,
                    dialogId: request.dialogId,
                    owner: request.owner,
                    message: "Selected provider does not advertise dialog execution."
                }));
            }

            if (!request.dialogId) {
                return createDialogExecutionResult({
                    status: "invalid",
                    providerId: snapshot.providerId,
                    dialogId: request.dialogId,
                    owner: request.owner,
                    message: "Dialog id is required."
                });
            }

            return options.compositionExecutionController.executeDialog(
                snapshot.providerId,
                request
            );
        },
        executeStartupTask: async function(request): Promise<StartupTaskExecutionResult> {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                return createStartupTaskExecutionResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    taskId: request.taskId,
                    owner: request.owner,
                    message: "Runtime session is not ready."
                });
            }

            if (!request.taskId) {
                return createStartupTaskExecutionResult({
                    status: "invalid",
                    providerId: snapshot.providerId,
                    taskId: request.taskId,
                    owner: request.owner,
                    message: "Startup task id is required."
                });
            }

            if (request.generation !== undefined && request.generation !== snapshot.lifecycleGeneration) {
                throw new Error("Runtime startup request belongs to a retired session.");
            }
            if (startupGeneration !== snapshot.lifecycleGeneration) {
                startupGeneration = snapshot.lifecycleGeneration;
                automaticTasks.clear();
            }
            const key = JSON.stringify([request.owner, request.taskId]);
            const previous = automaticTasks.get(key);
            if (request.automatic && previous) {
                return previous;
            }

            const execution = options.compositionExecutionController.executeStartupTask(
                snapshot.providerId,
                { ...request, generation: snapshot.lifecycleGeneration }
            );
            // An explicit Run can also satisfy the automatic startup gate.
            // A retired generation retains its own promise and cannot write here later.
            automaticTasks.set(key, execution);
            return execution;
        }
    };
};
