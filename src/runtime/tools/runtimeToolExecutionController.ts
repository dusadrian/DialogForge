import type {
    CompletionRequest,
    CompletionResult,
    DependencyCheckRequest,
    DependencyCheckResult,
    HelpTopicRequest,
    HelpTopicResult,
    RuntimeSessionSnapshot,
    RuntimeToolController
} from "../provider-contract/runtimeProvider";


export interface RuntimeToolExecutionControllerOptions {
    providerToolController?: RuntimeToolController;
    fallbackToolController: RuntimeToolController;
    getSnapshot(): RuntimeSessionSnapshot;
}


export interface RuntimeToolExecutionController {
    readHelpTopic(request: HelpTopicRequest): Promise<HelpTopicResult>;
    readCompletions(request: CompletionRequest): Promise<CompletionResult>;
    checkDependencies(request: DependencyCheckRequest): Promise<DependencyCheckResult>;
}


export const createRuntimeToolExecutionController = function(
    options: RuntimeToolExecutionControllerOptions
): RuntimeToolExecutionController {
    return {
        readHelpTopic: function(request) {
            const snapshot = options.getSnapshot();

            if (options.providerToolController?.readHelpTopic) {
                return options.providerToolController.readHelpTopic(
                    request,
                    snapshot
                );
            }

            return options.fallbackToolController.readHelpTopic!(
                request,
                snapshot
            );
        },
        readCompletions: function(request) {
            const snapshot = options.getSnapshot();

            if (options.providerToolController?.readCompletions) {
                return options.providerToolController.readCompletions(
                    request,
                    snapshot
                );
            }

            return options.fallbackToolController.readCompletions!(
                request,
                snapshot
            );
        },
        checkDependencies: function(request) {
            const snapshot = options.getSnapshot();

            if (options.providerToolController?.checkDependencies) {
                return options.providerToolController.checkDependencies(
                    request,
                    snapshot
                );
            }

            return options.fallbackToolController.checkDependencies!(
                request,
                snapshot
            );
        }
    };
};
