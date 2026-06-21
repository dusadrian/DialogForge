import type {
    InvisibleMutationRequest,
    InvisibleMutationResult,
    InvisibleQueryRequest,
    InvisibleQueryResult,
    RuntimeQueryController,
    RuntimeSessionSnapshot
} from "../provider-contract/runtimeProvider";


export interface RuntimeQueryExecutionControllerOptions {
    providerQueryController?: RuntimeQueryController;
    fallbackQueryController: RuntimeQueryController;
    getSnapshot(): RuntimeSessionSnapshot;
}


export interface RuntimeQueryExecutionController {
    executeInvisibleQuery(
        request: InvisibleQueryRequest
    ): Promise<InvisibleQueryResult>;
    executeInvisibleMutation(
        request: InvisibleMutationRequest
    ): Promise<InvisibleMutationResult>;
}


export const createRuntimeQueryExecutionController = function(
    options: RuntimeQueryExecutionControllerOptions
): RuntimeQueryExecutionController {
    return {
        executeInvisibleQuery: function(request) {
            const snapshot = options.getSnapshot();

            if (options.providerQueryController?.executeInvisibleQuery) {
                return options.providerQueryController.executeInvisibleQuery(
                    request,
                    snapshot
                );
            }

            return options.fallbackQueryController.executeInvisibleQuery!(
                request,
                snapshot
            );
        },
        executeInvisibleMutation: function(request) {
            const snapshot = options.getSnapshot();

            if (options.providerQueryController?.executeInvisibleMutation) {
                return options.providerQueryController.executeInvisibleMutation(
                    request,
                    snapshot
                );
            }

            return options.fallbackQueryController.executeInvisibleMutation!(
                request,
                snapshot
            );
        }
    };
};
