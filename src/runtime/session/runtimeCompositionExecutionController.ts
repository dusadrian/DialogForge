import {
    createDialogExecutionResult
} from "../dialogs/dialogExecutionProtocol";
import type {
    RuntimeDialogExecutionController
} from "../dialogs/runtimeDialogExecutionController";
import {
    createStartupTaskExecutionResult
} from "../startup/startupTaskProtocol";
import type {
    RuntimeStartupTaskExecutionController
} from "../startup/runtimeStartupTaskExecutionController";
import type {
    DialogExecutionRequest,
    DialogExecutionResult,
    StartupTaskExecutionRequest,
    StartupTaskExecutionResult
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeCompositionRegistry
} from "./runtimeCompositionRegistry";


export interface RuntimeCompositionExecutionControllerOptions {
    compositionRegistry: RuntimeCompositionRegistry;
    dialogExecutionController: RuntimeDialogExecutionController;
    startupTaskExecutionController: RuntimeStartupTaskExecutionController;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
}


export interface RuntimeCompositionExecutionController {
    executeDialog(
        providerId: string,
        request: DialogExecutionRequest
    ): DialogExecutionResult;
    executeStartupTask(
        providerId: string,
        request: StartupTaskExecutionRequest
    ): Promise<StartupTaskExecutionResult>;
}


export const createRuntimeCompositionExecutionController = function(
    options: RuntimeCompositionExecutionControllerOptions
): RuntimeCompositionExecutionController {
    return {
        executeDialog: function(providerId, request) {
            const dialog = options.compositionRegistry.findDialog(
                request.dialogId,
                request.owner
            );

            if (!dialog) {
                return createDialogExecutionResult({
                    status: "not-registered",
                    providerId,
                    dialogId: request.dialogId,
                    owner: request.owner,
                    message: "Dialog target is not registered in the composed application."
                });
            }

            options.recordRuntimeEvent(
                dialog.sourceFile ? "dialog.source.loaded" : "dialog.execution.planned",
                "",
                dialog.sourceFile
                    ? "Dialog source loaded."
                    : "Placeholder dialog execution accepted.",
                {
                    dialogId: dialog.id,
                    owner: dialog.owner || ""
                }
            );

            return options.dialogExecutionController.execute(
                providerId,
                dialog
            );
        },
        executeStartupTask: async function(providerId, request) {
            const task = options.compositionRegistry.findStartupTask(
                request.taskId,
                request.owner
            );

            if (!task) {
                return createStartupTaskExecutionResult({
                    status: "not-registered",
                    providerId,
                    taskId: request.taskId,
                    owner: request.owner,
                    message: "Startup task is not registered in the composed application."
                });
            }

            if (!task.enabled) {
                return createStartupTaskExecutionResult({
                    status: "disabled",
                    providerId,
                    taskId: task.id,
                    owner: task.owner || "",
                    message: task.reason || "Startup task is disabled by runtime capabilities."
                });
            }

            return options.startupTaskExecutionController.execute(
                providerId,
                task,
                request
            );
        }
    };
};
