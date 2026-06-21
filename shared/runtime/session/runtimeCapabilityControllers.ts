import type {
    RuntimeCapability,
    RuntimeQueryController,
    RuntimeSessionSnapshot,
    RuntimeToolController
} from "../provider-contract/runtimeProvider";
import {
    createRuntimeFallbackQueryController
} from "../queries/runtimeFallbackQueryController";
import {
    createRuntimeQueryExecutionController
} from "../queries/runtimeQueryExecutionController";
import type {
    RuntimeQueryExecutionController
} from "../queries/runtimeQueryExecutionController";
import {
    createRuntimeFallbackToolController
} from "../tools/runtimeFallbackToolController";
import {
    createRuntimeToolExecutionController
} from "../tools/runtimeToolExecutionController";
import type {
    RuntimeToolExecutionController
} from "../tools/runtimeToolExecutionController";
import type {
    RuntimeInvisibleMutationState
} from "./runtimeInvisibleMutationState";
import {
    createRuntimeCapabilityRequestController
} from "./runtimeCapabilityRequestController";
import type {
    RuntimeCapabilityRequestController
} from "./runtimeCapabilityRequestController";


export interface RuntimeCapabilityControllersOptions {
    providerToolController?: RuntimeToolController;
    providerQueryController?: RuntimeQueryController;
    mutationState: RuntimeInvisibleMutationState;
    getWorkspaceObjectCount(): number;
    getSnapshot(): RuntimeSessionSnapshot;
    hasRuntimeCapability(capability: RuntimeCapability): boolean;
}


export interface RuntimeCapabilityControllers {
    toolExecutionController: RuntimeToolExecutionController;
    queryExecutionController: RuntimeQueryExecutionController;
    requestController: RuntimeCapabilityRequestController;
}


export const createRuntimeCapabilityControllers = function(
    options: RuntimeCapabilityControllersOptions
): RuntimeCapabilityControllers {
    const fallbackToolController = createRuntimeFallbackToolController();
    const toolExecutionController = createRuntimeToolExecutionController({
        providerToolController: options.providerToolController,
        fallbackToolController,
        getSnapshot: options.getSnapshot
    });
    const fallbackQueryController = createRuntimeFallbackQueryController({
        mutationState: options.mutationState,
        getWorkspaceObjectCount: options.getWorkspaceObjectCount
    });
    const queryExecutionController = createRuntimeQueryExecutionController({
        providerQueryController: options.providerQueryController,
        fallbackQueryController,
        getSnapshot: options.getSnapshot
    });
    const requestController = createRuntimeCapabilityRequestController({
        toolExecutionController,
        queryExecutionController,
        getSnapshot: options.getSnapshot,
        hasRuntimeCapability: options.hasRuntimeCapability
    });

    return {
        toolExecutionController,
        queryExecutionController,
        requestController
    };
};
