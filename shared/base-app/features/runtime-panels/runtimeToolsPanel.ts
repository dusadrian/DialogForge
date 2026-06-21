import type {
    CompletionResult,
    DependencyCheckResult,
    HelpTopicResult,
    InvisibleMutationResult,
    InvisibleQueryResult
} from "../../../runtime/provider-contract/runtimeProvider";


interface RuntimeToolsHelpers {
    appendField(host: HTMLElement, label: string, value: unknown): void;
    empty(host: HTMLElement): void;
}


const readDependencyCheckNames = function(value: string): string[] {
    return value.split(",").map((name) => {
        return name.trim();
    }).filter((name) => {
        return name.length > 0;
    });
};


const renderHelpTopic = function(
    status: HTMLElement,
    result: HelpTopicResult,
    helpers: RuntimeToolsHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "provider", result.providerId);
    helpers.appendField(status, "topic", result.topic);
    helpers.appendField(status, "kind", result.kind);
    helpers.appendField(status, "title", result.title);
    helpers.appendField(status, "path", result.path);
    helpers.appendField(status, "matches", String(result.matches.length));
    helpers.appendField(status, "body", result.body);
    helpers.appendField(status, "message", result.message);
};


const renderCompletions = function(
    status: HTMLElement,
    result: CompletionResult,
    helpers: RuntimeToolsHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "provider", result.providerId);
    helpers.appendField(status, "prefix", result.prefix);
    helpers.appendField(status, "message", result.message);

    result.items.forEach((item) => {
        helpers.appendField(status, item.label, item.kind + " - " + item.detail);
    });
};


const renderDependencyCheck = function(
    status: HTMLElement,
    result: DependencyCheckResult,
    helpers: RuntimeToolsHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "provider", result.providerId);
    helpers.appendField(status, "kind", result.kind);
    helpers.appendField(status, "message", result.message);

    result.items.forEach((item) => {
        helpers.appendField(status, item.name, item.status + " " + item.version);
    });
};


const renderInvisibleQuery = function(
    status: HTMLElement,
    result: InvisibleQueryResult,
    helpers: RuntimeToolsHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "provider", result.providerId);
    helpers.appendField(status, "query", result.query);
    helpers.appendField(status, "value", JSON.stringify(result.value));
    helpers.appendField(status, "message", result.message);
};


const renderInvisibleMutation = function(
    status: HTMLElement,
    result: InvisibleMutationResult,
    helpers: RuntimeToolsHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "provider", result.providerId);
    helpers.appendField(status, "mutation", result.mutation);
    helpers.appendField(status, "value", JSON.stringify(result.value));
    helpers.appendField(status, "message", result.message);
};


export const runtimeToolsPanelApi = {
    readDependencyCheckNames,
    renderCompletions,
    renderDependencyCheck,
    renderHelpTopic,
    renderInvisibleMutation,
    renderInvisibleQuery
};
