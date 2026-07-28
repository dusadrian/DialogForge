import type {
    DependencyCheckRequest,
    DependencyCheckResult,
    RuntimeCommandController,
    RuntimeProductCommandController,
    RuntimeSessionSnapshot,
    WorkspaceUpdate
} from "../provider-contract/runtimeProvider";
import {
    createRuntimeFallbackProductCommandController
} from "../product-commands/runtimeFallbackProductCommandController";
import {
    createRuntimeCommandExecutionController
} from "./runtimeCommandExecutionController";
import type {
    RuntimeCommandExecutionController
} from "./runtimeCommandExecutionController";
import {
    createRuntimeCommandOperationController
} from "./runtimeCommandOperationController";
import type {
    RuntimeCommandOperationController
} from "./runtimeCommandOperationController";
import {
    createRuntimeFallbackCommandController
} from "./runtimeFallbackCommandController";


export interface RuntimeCommandControllersOptions {
    providerCommandController?: RuntimeCommandController;
    providerProductCommandController?: RuntimeProductCommandController;
    getSnapshot(): RuntimeSessionSnapshot;
    hasDependencyCapability(): boolean;
    checkDependencies(request: DependencyCheckRequest): Promise<DependencyCheckResult>;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
    completeVisibleCommand?(
        request: Parameters<
            RuntimeCommandExecutionController["executeVisibleCommand"]
        >[0]
    ): Promise<WorkspaceUpdate | null>;
    applyWorkspaceUpdate(update: WorkspaceUpdate): void;
}


export interface RuntimeCommandControllers {
    executionController: RuntimeCommandExecutionController;
    operationController: RuntimeCommandOperationController;
}


export const createRuntimeCommandControllers = function(
    options: RuntimeCommandControllersOptions
): RuntimeCommandControllers {
    const fallbackCommandController = createRuntimeFallbackCommandController();
    const fallbackProductCommandController =
        createRuntimeFallbackProductCommandController({
            hasDependencyCapability: options.hasDependencyCapability,
            checkDependencies: options.checkDependencies
        });
    const executionController = createRuntimeCommandExecutionController({
        providerCommandController: options.providerCommandController,
        fallbackCommandController,
        providerProductCommandController: options.providerProductCommandController,
        fallbackProductCommandController,
        getSnapshot: options.getSnapshot
    });
    const operationController = createRuntimeCommandOperationController({
        commandExecutionController: executionController,
        getSnapshot: options.getSnapshot,
        recordRuntimeEvent: options.recordRuntimeEvent,
        completeVisibleCommand: options.completeVisibleCommand,
        applyWorkspaceUpdate: options.applyWorkspaceUpdate
    });

    return {
        executionController,
        operationController
    };
};
