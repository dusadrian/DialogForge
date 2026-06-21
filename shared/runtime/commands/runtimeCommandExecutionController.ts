import type {
    ProductCommandRequest,
    ProductCommandResult,
    RuntimeCommandController,
    RuntimeProductCommandController,
    RuntimeSessionSnapshot,
    TranscriptEvent,
    VisibleCommandRequest
} from "../provider-contract/runtimeProvider";


export interface RuntimeCommandExecutionControllerOptions {
    providerCommandController?: RuntimeCommandController;
    fallbackCommandController: RuntimeCommandController;
    providerProductCommandController?: RuntimeProductCommandController;
    fallbackProductCommandController: RuntimeProductCommandController;
    getSnapshot(): RuntimeSessionSnapshot;
}


export interface RuntimeCommandExecutionController {
    executeVisibleCommand(
        request: VisibleCommandRequest
    ): Promise<TranscriptEvent[]>;
    executeProductCommand(
        request: ProductCommandRequest
    ): Promise<ProductCommandResult>;
}


export const createRuntimeCommandExecutionController = function(
    options: RuntimeCommandExecutionControllerOptions
): RuntimeCommandExecutionController {
    return {
        executeVisibleCommand: function(request) {
            const snapshot = options.getSnapshot();

            if (options.providerCommandController) {
                return options.providerCommandController.executeVisibleCommand(
                    request,
                    snapshot
                );
            }

            return options.fallbackCommandController.executeVisibleCommand(
                request,
                snapshot
            );
        },
        executeProductCommand: function(request) {
            const snapshot = options.getSnapshot();

            if (options.providerProductCommandController?.executeProductCommand) {
                return options.providerProductCommandController.executeProductCommand(
                    request,
                    snapshot
                );
            }

            return options.fallbackProductCommandController.executeProductCommand!(
                request,
                snapshot
            );
        }
    };
};
