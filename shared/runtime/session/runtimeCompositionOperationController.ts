import {
    createDialogExecutionResult
} from "../dialogs/dialogExecutionProtocol";
import {
    createStartupTaskExecutionResult
} from "../startup/startupTaskProtocol";
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
                return createDialogExecutionResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    dialogId: request.dialogId,
                    owner: request.owner,
                    message: "Selected provider does not advertise dialog execution."
                });
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

            return options.compositionExecutionController.executeStartupTask(
                snapshot.providerId,
                request
            );
        }
    };
};
