import {
    createCompletionItem,
    createCompletionRequest,
    createCompletionResult
} from "../../completions/completionProtocol";
import type {
    CompletionResult,
    RuntimeProvider,
    RuntimeSessionManager,
    RuntimeSessionSnapshot
} from "../../provider-contract/runtimeProvider";
import {
    createRuntimeSessionManager
} from "../../session/runtimeSessionManager";
import {
    filterRInternalCompletionSymbols
} from "../r/completions/rInternalCompletionSymbols";
import {
    createBrowserWebRSessionSnapshot
} from "./webRBrowserStartup";
import {
    readWebRCompletionResult,
    type WebRCompletionRequest,
    type WebRCompletionResult,
    type WebRCompletionRuntime
} from "./webRCompletionAdapter";


export interface WebRConsoleCompletionEntry {
    name?: string;
    columns?: unknown[];
}

export interface WebRConsoleCompletionBindings {
    runtimeSessionManager: RuntimeSessionManager | null | undefined;
    isRuntimeBusy(): boolean;
    workspaceObjectNames(): string[];
    workspaceEntries(): WebRConsoleCompletionEntry[];
    workspaceColumnNames(objectName: string): string[];
}


const createCompletionItems = function(
    values: string[],
    prefix: string,
    kind = "variable"
): Array<{ label: string; kind: string }> {
    return values
        .filter((name) => !prefix || name.startsWith(prefix))
        .map((name) => ({
            label: name,
            kind
        }));
};


const readDollarCompletionObject = function(code: unknown): string {
    const match = String(code || "").match(/([A-Za-z.][A-Za-z0-9._]*)\$([A-Za-z0-9._]*)$/);

    return String(match?.[1] || "");
};


const readWorkspaceColumnSymbols = function(
    entries: WebRConsoleCompletionEntry[]
): string[] {
    return entries.flatMap((entry) => {
        return Array.isArray(entry?.columns)
            ? entry.columns.map((name) => String(name || "")).filter(Boolean)
            : [];
    });
};


export const createBrowserWebRCompletionProvider = function(
    runtime: WebRCompletionRuntime,
    canReadRuntime: () => boolean
): RuntimeProvider {
    const snapshot: RuntimeSessionSnapshot = createBrowserWebRSessionSnapshot(
        "ready",
        "Browser WebR runtime is ready for completions.",
        "connected"
    );

    return {
        manifest: {
            id: "webr",
            label: "WebR",
            language: "r",
            status: "experimental",
            capabilities: ["completions.symbols"]
        },
        createSession: function() {
            return snapshot;
        },
        toolController: {
            readCompletions: async function(request) {
                const result = await readWebRCompletionResult(
                    runtime,
                    request,
                    { canReadRuntime }
                );

                if (!result) {
                    return createCompletionResult({
                        status: "unavailable",
                        providerId: snapshot.providerId,
                        prefix: request.prefix,
                        message: "WebR runtime completions are not available."
                    });
                }

                return createCompletionResult({
                    status: "ready",
                    providerId: snapshot.providerId,
                    prefix: request.prefix,
                    items: (result.value.items || []).map((item) => {
                        return createCompletionItem(item);
                    }),
                    exports: result.value.exports || [],
                    internals: result.value.internals || [],
                    symbols: result.value.symbols || [],
                    message: "WebR runtime completions read through the shared session manager."
                });
            }
        }
    };
};

export const createBrowserWebRCompletionSessionManager = function(
    runtime: WebRCompletionRuntime,
    canReadRuntime: () => boolean
): RuntimeSessionManager {
    return createRuntimeSessionManager(
        createBrowserWebRCompletionProvider(runtime, canReadRuntime)
    );
};


const readRuntimeCompletionsThroughSessionManager = async function(
    params: WebRCompletionRequest & { code?: unknown },
    bindings: WebRConsoleCompletionBindings
): Promise<CompletionResult | null> {
    if (!bindings.runtimeSessionManager || bindings.isRuntimeBusy()) {
        return null;
    }

    const result = await bindings.runtimeSessionManager.readCompletions(createCompletionRequest({
        prefix: String(params?.prefix || ""),
        source: "browser.webr.console",
        code: String(params?.code || ""),
        packageName: String(params?.packageName || "") || undefined
    }));

    return result.status === "ready" ? result : null;
};


export const readWebRConsoleCompletionResult = async function(
    params: WebRCompletionRequest & { code?: unknown },
    bindings: WebRConsoleCompletionBindings
): Promise<WebRCompletionResult> {
    const prefix = String(params?.prefix || "");
    const dollarObject = readDollarCompletionObject(params?.code);

    if (dollarObject) {
        const columns = bindings.workspaceColumnNames(dollarObject);

        return {
            ok: true,
            value: {
                items: createCompletionItems(columns, prefix)
            }
        };
    }

    const runtimeCompletions = await readRuntimeCompletionsThroughSessionManager(
        params,
        bindings
    );

    if (runtimeCompletions) {
        return {
            ok: true,
            value: {
                items: runtimeCompletions.items.map((item) => ({
                    label: item.label,
                    kind: item.kind
                })),
                exports: runtimeCompletions.exports || [],
                internals: runtimeCompletions.internals || [],
                symbols: runtimeCompletions.symbols || []
            }
        };
    }

    const objectNames = filterRInternalCompletionSymbols(
        bindings.workspaceObjectNames()
    );

    return {
        ok: true,
        value: {
            symbols: [
                ...objectNames,
                ...readWorkspaceColumnSymbols(bindings.workspaceEntries())
            ],
            items: createCompletionItems(objectNames, prefix)
        }
    };
};
