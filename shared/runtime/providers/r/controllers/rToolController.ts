import {
    createCompletionItem,
    createCompletionResult
} from "../../../completions/completionProtocol";
import {
    createDependencyCheckItem,
    createDependencyCheckResult
} from "../../../dependencies/dependencyProtocol";
import { createHelpTopicResult } from "../../../help/helpProtocol";
import type {
    RuntimeToolController
} from "../../../provider-contract/runtimeProvider";
import {
    asRuntimeControlArray,
    asRuntimeControlObject,
    parseRuntimeControlResultObject
} from "../protocol/runtimeControlEvents";
import { createRuntimeControlClient } from "../protocol/runtimeControlClient";


type RuntimeControlClient = ReturnType<typeof createRuntimeControlClient>;


export interface RToolControllerOptions {
    getClient(): RuntimeControlClient | null;
    createRequestId(prefix: string): string;
    checkPackageVersion(packageName: string): Promise<string>;
}


const defaultCompletionPackages = [
    "base",
    "stats",
    "utils",
    "graphics",
    "grDevices",
    "methods"
];


const hasOpenStringCompletionContext = function(code: string): boolean {
    let quote = "";
    let escaped = false;

    for (let index = 0; index < code.length; index += 1) {
        const character = code[index];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (character === "\\") {
            escaped = true;
            continue;
        }

        if (!quote) {
            if (character === "\"" || character === "'") {
                quote = character;
            }

            continue;
        }

        if (character === quote) {
            quote = "";
        }
    }

    return Boolean(quote);
};


const hasContextualCompletionRequest = function(code: string): boolean {
    return code.includes("$") || hasOpenStringCompletionContext(code);
};


const addCompletionLabels = function(
    labels: Map<string, { label: string; kind: string }>,
    source: unknown,
    prefix: string
): void {
    asRuntimeControlArray(source).forEach((entry) => {
        const item = asRuntimeControlObject(entry);
        const label = String(
            item.label
            || item.name
            || item.value
            || entry
            || ""
        ).trim();

        if (label && (!prefix || label.startsWith(prefix))) {
            labels.set(label, {
                label,
                kind: String(item.kind || "symbol").trim() || "symbol"
            });
        }
    });
};


export const createRToolController = function(
    options: RToolControllerOptions
): RuntimeToolController {
    const readCompletionPayload = async function(
        params: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        const client = options.getClient();

        if (!client) {
            return {};
        }

        const result = await client.execute({
            id: options.createRequestId("completion"),
            method: "completion.request",
            params: Object.assign({
                timeoutMs: 5000
            }, params)
        });

        if (!result.ok) {
            return {};
        }

        return parseRuntimeControlResultObject(result.result);
    };

    return {
        readHelpTopic: async function(request, snapshot) {
            const client = options.getClient();

            if (!client) {
                return createHelpTopicResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    topic: request.topic,
                    message: "R runtime-control session is not attached."
                });
            }

            const result = await client.execute({
                id: options.createRequestId("help-topic"),
                method: "show_help_topic",
                params: {
                    topic: request.topic,
                    package: request.package || "",
                    timeoutMs: 5000
                }
            });
            const payload = parseRuntimeControlResultObject(result.result);
            const matches = Array.isArray(payload.matches)
                ? payload.matches
                : [];
            const path = String(payload.path || "");

            return createHelpTopicResult({
                status: result.ok ? "ready" : "not-found",
                providerId: snapshot.providerId,
                topic: request.topic,
                kind: String(payload.kind || "single"),
                title: String(payload.title || request.topic),
                path,
                matches,
                body: String(
                    payload.body
                    || path
                    || payload.url
                    || payload.topic
                    || ""
                ),
                message: result.ok
                    ? "R runtime-control resolved help topic."
                    : String(
                        result.error
                        || "R help topic was not found."
                    )
            });
        },
        readCompletions: async function(request, snapshot) {
            if (!options.getClient()) {
                return createCompletionResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    prefix: request.prefix,
                    message: "R runtime-control session is not attached."
                });
            }

            const prefix = String(request.prefix || "");
            const code = String(request.code || "");
            const completionItems = new Map<
                string,
                { label: string; kind: string }
            >();
            const addRuntimeCompletionItems = function(values: unknown): void {
                if (!Array.isArray(values)) {
                    return;
                }

                values.forEach((value) => {
                    const item = value && typeof value === "object"
                        ? value as Record<string, unknown>
                        : {};
                    const label = String(item.label || value || "").trim();

                    if (
                        !label
                        || (prefix && !label.startsWith(prefix))
                        || completionItems.has(label)
                    ) {
                        return;
                    }

                    completionItems.set(label, {
                        label,
                        kind: String(item.kind || "symbol").trim() || "symbol"
                    });
                });
            };
            const workspacePayload = await readCompletionPayload({
                prefix,
                code,
                cursorColumn: request.cursorColumn || 0,
                package: request.packageName || "",
                includeInternals: request.includeInternals === true,
                timeoutMs: request.timeoutMs || 5000
            });

            addRuntimeCompletionItems(workspacePayload.items);
            addRuntimeCompletionItems(workspacePayload.symbols);

            const packages = request.packageName
                || hasContextualCompletionRequest(code)
                ? []
                : defaultCompletionPackages;

            for (const packageName of packages) {
                const packagePayload = await readCompletionPayload({
                    prefix,
                    package: packageName
                });

                addCompletionLabels(
                    completionItems,
                    packagePayload.exports,
                    prefix
                );
            }

            const items = Array.from(completionItems.values()).sort(
                (left, right) => left.label.localeCompare(right.label)
            ).map((item) => {
                return createCompletionItem({
                    label: item.label,
                    detail: "",
                    kind: item.kind
                });
            });

            return createCompletionResult({
                status: "ready",
                providerId: snapshot.providerId,
                prefix,
                items,
                exports: Array.isArray(workspacePayload.exports)
                    ? workspacePayload.exports.map((value) => {
                        return String(value || "");
                    }).filter(Boolean)
                    : [],
                internals: Array.isArray(workspacePayload.internals)
                    ? workspacePayload.internals.map((value) => {
                        return String(value || "");
                    }).filter(Boolean)
                    : [],
                symbols: Array.isArray(workspacePayload.symbols)
                    ? workspacePayload.symbols.map((value) => {
                        return String(value || "");
                    }).filter(Boolean)
                    : [],
                message: "R runtime-control returned completions."
            });
        },
        checkDependencies: async function(request, snapshot) {
            if (!options.getClient()) {
                return createDependencyCheckResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    kind: request.kind,
                    message: "R runtime-control session is not attached."
                });
            }

            const items = [];

            for (const name of request.names) {
                const version = await options.checkPackageVersion(name);

                items.push(createDependencyCheckItem({
                    name,
                    status: version ? "available" : "missing",
                    version,
                    message: version
                        ? "R package is available."
                        : "R package is not installed."
                }));
            }

            const missingCount = items.filter((item) => {
                return item.status !== "available";
            }).length;

            return createDependencyCheckResult({
                status: missingCount === 0 ? "ready" : "partial",
                providerId: snapshot.providerId,
                kind: request.kind,
                items,
                message: "R runtime-control checked package dependencies."
            });
        }
    };
};
