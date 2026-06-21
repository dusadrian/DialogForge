import type {
    CompletionResult,
    DependencyCheckResult,
    HelpTopicResult,
    InvisibleMutationResult,
    InvisibleQueryResult
} from "../../../runtime/provider-contract/runtimeProvider";


export interface MainRuntimeToolsControllerBindings {
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


export interface MainRuntimeToolsController {
    readHelpTopic(): Promise<void>;
    readCompletions(): Promise<void>;
    checkDependencies(): Promise<void>;
    executeInvisibleQuery(): Promise<void>;
    executeInvisibleMutation(): Promise<void>;
}


export const createMainRuntimeToolsController = function(
    bindings: MainRuntimeToolsControllerBindings
): MainRuntimeToolsController {
    const readHelpTopic = async function(): Promise<void> {
        const result = await window.dialogForge.openHelpTopic({
            topic: bindings.helpTopic.value,
            source: "base-app.help"
        });

        bindings.renderHelpTopic(result);
    };

    const readCompletions = async function(): Promise<void> {
        const result = await window.dialogForge.readCompletions({
            prefix: bindings.completionPrefix.value,
            source: "base-app.completions"
        });

        bindings.renderCompletions(result);
    };

    const checkDependencies = async function(): Promise<void> {
        await bindings.checkDependencies(
            bindings.readDependencyNames(bindings.dependencyNames.value)
        );
    };

    const executeInvisibleQuery = async function(): Promise<void> {
        const result = await window.dialogForge.executeInvisibleQuery({
            query: bindings.invisibleQuery.value,
            source: "base-app.query"
        });

        bindings.renderInvisibleQuery(result);
    };

    const executeInvisibleMutation = async function(): Promise<void> {
        const result = await window.dialogForge.executeInvisibleMutation({
            mutation: bindings.invisibleMutationName.value,
            value: bindings.invisibleMutationValue.value,
            source: "base-app.mutation"
        });

        bindings.renderInvisibleMutation(result);
    };

    return {
        readHelpTopic,
        readCompletions,
        checkDependencies,
        executeInvisibleQuery,
        executeInvisibleMutation
    };
};
