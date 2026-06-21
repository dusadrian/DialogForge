import { getCompletionContext } from "./completionContext";
import {
    CompletionKnowledge,
    requestedPackages
} from "./completionKnowledge";
import {
    CompletionContext,
    CompletionFetchResult,
    CompletionModel,
    CompletionModelOptions,
    RuntimeCompletionSuggestion
} from "./completionTypes";

const stringArray = function(value: unknown): string[] {
    return Array.isArray(value)
        ? value
            .map((entry) => String(entry || "").trim())
            .filter(Boolean)
        : [];
};

const objectValue = function(result: CompletionFetchResult): Record<string, unknown> | null {
    return result.ok
        && result.value !== null
        && typeof result.value === "object"
        ? result.value as Record<string, unknown>
        : null;
};

export const createCompletionModel = function(
    options: CompletionModelOptions = {}
): CompletionModel {
    const packageSuggestionsEnabled = options.enablePackageSuggestions !== false;
    const fetchCompletions = options.completionFetch;
    const knowledge = new CompletionKnowledge();
    const packageRequests = new Set<string>();

    const prefetchPackage = async function(
        packageName: string,
        includeInternals: boolean
    ): Promise<void> {
        const normalizedName = String(packageName || "").trim();

        if (!normalizedName || !fetchCompletions) {
            return;
        }

        const requestKey = `${normalizedName}:${includeInternals ? "all" : "exp"}`;

        if (packageRequests.has(requestKey)) {
            return;
        }

        packageRequests.add(requestKey);

        try {
            const result = await fetchCompletions({
                packageName: normalizedName,
                includeInternals
            }, 2800);
            const value = objectValue(result);

            if (!value) {
                return;
            }

            knowledge.ingestPackageSymbols(
                normalizedName,
                stringArray(value.exports),
                stringArray(value.internals),
                includeInternals
            );
        }
        catch {
            // Runtime completion is opportunistic; local suggestions remain available.
        }
        finally {
            packageRequests.delete(requestKey);
        }
    };

    const getLocalCompletionSuggestions = function(
        context: CompletionContext
    ): string[] {
        return knowledge.suggestions(
            context,
            packageSuggestionsEnabled,
            (packageName, includeInternals) => {
                void prefetchPackage(packageName, includeInternals);
            }
        );
    };

    const getRuntimeCompletionSuggestions = async function(
        context: CompletionContext,
        input: string,
        cursorColumn: number,
        timeoutMs = 2500
    ): Promise<RuntimeCompletionSuggestion[]> {
        if (!fetchCompletions) {
            return [];
        }

        if (
            context.mode !== "path"
            && context.mode !== "dollar"
            && context.mode !== "data-mask-variable"
        ) {
            return [];
        }

        try {
            const dataset = String(context.dataset || "").trim();
            const code = context.mode === "data-mask-variable"
                ? `${dataset}$${String(context.token || "")}`
                : String(input || "");
            const column = context.mode === "data-mask-variable"
                ? code.length + 1
                : Math.max(1, Number(cursorColumn) || 1);
            const result = await fetchCompletions({
                code,
                cursorColumn: column
            }, timeoutMs);
            const value = objectValue(result);

            if (!value) {
                return [];
            }

            const items = Array.isArray(value.items) ? value.items : [];

            if (items.length > 0) {
                return items
                    .map((item) => {
                        const entry = item && typeof item === "object"
                            ? item as Record<string, unknown>
                            : {};

                        return {
                            label: String(entry.label || "").trim(),
                            kind: String(entry.kind || "").trim() || "file"
                        };
                    })
                    .filter((item) => item.label.length > 0);
            }

            return stringArray(value.symbols).map((label) => ({
                label,
                kind: "file"
            }));
        }
        catch {
            return [];
        }
    };

    const registerCommandInput = function(input: string): void {
        knowledge.ingestCommand(input);

        if (!packageSuggestionsEnabled) {
            return;
        }

        requestedPackages(input).forEach((packageName) => {
            void prefetchPackage(packageName, false);
        });
    };

    return {
        getCompletionContext,
        getLocalCompletionSuggestions,
        getRuntimeCompletionSuggestions,
        registerCommandInput,
        ingestObjectNames: function(names: string[]): void {
            knowledge.ingestObjectNames(names);
        }
    };
};

export type {
    CompletionContext,
    CompletionModel,
    CompletionModelOptions,
    RuntimeCompletionSuggestion
} from "./completionTypes";
