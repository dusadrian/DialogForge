import {
    createCompletionRequest
} from "../../completions/completionProtocol";
import type {
    CompletionResult,
    RuntimeSessionManager
} from "../../provider-contract/runtimeProvider";
import {
    filterRInternalCompletionSymbols
} from "../r/completions/rInternalCompletionSymbols";
import {
    type WebRCompletionRequest,
    type WebRCompletionResult
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
