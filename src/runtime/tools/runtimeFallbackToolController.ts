import {
    createCompletionItem,
    createCompletionResult
} from "../completions/completionProtocol";
import {
    createDependencyCheckItem,
    createDependencyCheckResult
} from "../dependencies/dependencyProtocol";
import { createHelpTopicResult } from "../help/helpProtocol";
import type {
    RuntimeToolController
} from "../provider-contract/runtimeProvider";


const availableDependencyVersions: Record<string, string> = {
    QCA: "placeholder",
    admisc: "placeholder",
    venn: "placeholder"
};


export const createRuntimeFallbackToolController = function(): RuntimeToolController {
    return {
        readHelpTopic: async function(request, snapshot) {
            return createHelpTopicResult({
                status: "ready",
                providerId: snapshot.providerId,
                topic: request.topic,
                title: "Help: " + request.topic,
                body: "Placeholder help topic for " + request.topic +
                    ". No language help system was queried.",
                message: "Placeholder help topic resolved."
            });
        },
        readCompletions: async function(request, snapshot) {
            const candidates = [
                createCompletionItem({
                    label: "sample_data",
                    detail: "Placeholder data frame",
                    kind: "object"
                }),
                createCompletionItem({
                    label: "sample_model",
                    detail: "Placeholder runtime object",
                    kind: "object"
                }),
                createCompletionItem({
                    label: "summary",
                    detail: "Placeholder command",
                    kind: "function"
                })
            ];
            const items = candidates.filter((item) => {
                return !request.prefix ||
                    item.label.indexOf(request.prefix) === 0;
            });

            return createCompletionResult({
                status: "ready",
                providerId: snapshot.providerId,
                prefix: request.prefix,
                items,
                message: "Placeholder completions resolved."
            });
        },
        checkDependencies: async function(request, snapshot) {
            const items = request.names.map((name) => {
                const version = availableDependencyVersions[name];

                if (version) {
                    return createDependencyCheckItem({
                        name,
                        status: "available",
                        version,
                        message: "Placeholder dependency is available."
                    });
                }

                return createDependencyCheckItem({
                    name,
                    status: "missing",
                    message: "Placeholder dependency is not registered."
                });
            });
            const missing = items.filter((item) => {
                return item.status !== "available";
            }).length;

            return createDependencyCheckResult({
                status: missing === 0 ? "ready" : "partial",
                providerId: snapshot.providerId,
                kind: request.kind,
                items,
                message: "Placeholder dependency check completed."
            });
        }
    };
};
