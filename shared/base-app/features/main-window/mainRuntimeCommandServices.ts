import type {
    CompletionResult,
    HelpTopicResult,
    InvisibleMutationResult,
    InvisibleQueryResult,
    ProductCommandResult
} from "../../../runtime/provider-contract/runtimeProvider";
import {
    createMainProductCommandController
} from "../menu-commands/mainProductCommandController";
import {
    createMainRuntimeToolsController
} from "../runtime-panels/mainRuntimeToolsController";


export interface MainRuntimeCommandServicesOptions {
    getProductId(): string;
    installRequired(value: unknown): Promise<void>;
    updateRequired(value: unknown): Promise<void>;
    renderProductCommandResult(result: ProductCommandResult): void;
    refreshRuntimeEvents(): void;
    helpTopic: HTMLInputElement;
    completionPrefix: HTMLInputElement;
    dependencyNames: HTMLInputElement;
    invisibleQuery: HTMLInputElement;
    invisibleMutationName: HTMLInputElement;
    invisibleMutationValue: HTMLInputElement;
    readDependencyNames(value: string): string[];
    renderHelpTopic(result: HelpTopicResult): void;
    renderCompletions(result: CompletionResult): void;
    checkDependencies(names: string[], source?: string): Promise<void>;
    renderInvisibleQuery(result: InvisibleQueryResult): void;
    renderInvisibleMutation(result: InvisibleMutationResult): void;
}


export const createMainRuntimeCommandServices = function(
    options: MainRuntimeCommandServicesOptions
) {
    const productCommandController = createMainProductCommandController({
        getProductId: options.getProductId,
        installRequired: options.installRequired,
        updateRequired: options.updateRequired,
        renderResult: options.renderProductCommandResult,
        refreshRuntimeEvents: options.refreshRuntimeEvents,
        checkDependencies: options.checkDependencies
    });
    const runtimeToolsController = createMainRuntimeToolsController({
        helpTopic: options.helpTopic,
        completionPrefix: options.completionPrefix,
        dependencyNames: options.dependencyNames,
        invisibleQuery: options.invisibleQuery,
        invisibleMutationName: options.invisibleMutationName,
        invisibleMutationValue: options.invisibleMutationValue,
        readDependencyNames: options.readDependencyNames,
        renderHelpTopic: options.renderHelpTopic,
        renderCompletions: options.renderCompletions,
        checkDependencies: options.checkDependencies,
        renderInvisibleQuery: options.renderInvisibleQuery,
        renderInvisibleMutation: options.renderInvisibleMutation
    });

    return {
        executeProductCommand: productCommandController.execute,
        readHelpTopic: runtimeToolsController.readHelpTopic,
        readCompletions: runtimeToolsController.readCompletions,
        checkDependencies: runtimeToolsController.checkDependencies,
        executeInvisibleQuery: runtimeToolsController.executeInvisibleQuery,
        executeInvisibleMutation:
            runtimeToolsController.executeInvisibleMutation
    };
};
