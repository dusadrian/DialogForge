import {
    createCompletionRequest
} from "../../../completions/completionProtocol";
import type {
    CompletionRequest,
    CompletionResult,
    RuntimeSessionSnapshot
} from "../../../provider-contract/runtimeProvider";
import { getRCompletionContext } from "./rCompletionContext";
import { filterRInternalCompletionSymbols } from "./rInternalCompletionSymbols";


export interface RConsoleCompletionInput {
    prefix?: unknown;
    code?: unknown;
    packageName?: unknown;
    cursorColumn?: unknown;
    includeInternals?: unknown;
}

export interface RConsoleCompletionEntry {
    name?: string;
    columns?: unknown[];
}

export interface RConsoleCompletionResult {
    ok: boolean;
    value: {
        exports?: string[];
        internals?: string[];
        symbols?: string[];
        items?: Array<{ label: string; kind: string; detail?: string }>;
    };
}


export const createRConsoleCompletionReader = function(options: {
    source: string;
    readSession(): {
        owner: unknown;
        snapshot: Pick<RuntimeSessionSnapshot, "status" | "lifecycleGeneration">;
    } | null;
    isRuntimeBusy(): boolean;
    readCompletions(request: CompletionRequest): Promise<CompletionResult>;
    workspaceEntries(): RConsoleCompletionEntry[];
}) {
    return function(
        input: RConsoleCompletionInput,
        timeoutMs?: number
    ): Promise<RConsoleCompletionResult> {
        return readRConsoleCompletionResult(input, {
            source: options.source,
            timeoutMs,
            canReadRuntime: function() {
                return options.readSession()?.snapshot.status === "ready"
                    && !options.isRuntimeBusy();
            },
            readRuntimeScope: function() {
                const session = options.readSession();
                return session ? {
                    owner: session.owner,
                    generation: session.snapshot.lifecycleGeneration
                } : null;
            },
            readCompletions: options.readCompletions,
            workspaceEntries: options.workspaceEntries
        });
    };
};


export const readRConsoleRuntimeCompletion = async function(
    input: RConsoleCompletionInput,
    options: {
        source: string;
        timeoutMs?: number;
        readCompletions(request: CompletionRequest): Promise<CompletionResult>;
    }
): Promise<{ ok: boolean; value: CompletionResult }> {
    const request = createCompletionRequest({
        prefix: String(input.prefix || ""),
        code: String(input.code || ""),
        packageName: String(input.packageName || ""),
        cursorColumn: Number(input.cursorColumn),
        includeInternals: input.includeInternals === true,
        timeoutMs: options.timeoutMs,
        source: options.source
    });
    const result = await options.readCompletions(request);

    return {
        ok: result.status === "ready",
        value: result
    };
};


export const readRConsoleCompletionResult = async function(
    input: RConsoleCompletionInput,
    bindings: {
        source: string;
        timeoutMs?: number;
        canReadRuntime(): boolean;
        readRuntimeScope?(): { owner: unknown; generation?: number } | null;
        readCompletions(request: CompletionRequest): Promise<CompletionResult>;
        workspaceEntries(): RConsoleCompletionEntry[];
    }
): Promise<RConsoleCompletionResult> {
    if (bindings.canReadRuntime()) {
        const scope = bindings.readRuntimeScope?.();
        const isCurrent = function(): boolean {
            if (!bindings.canReadRuntime()) {
                return false;
            }
            if (!bindings.readRuntimeScope) {
                return true;
            }

            const current = bindings.readRuntimeScope();
            return !!scope && !!current
                && scope.owner === current.owner
                && scope.generation === current.generation;
        };

        try {
            const result = await readRConsoleRuntimeCompletion(input, bindings);
            if (!isCurrent()) {
                return { ok: false, value: { symbols: [], items: [] } };
            }
            if (result.ok) {
                return result;
            }
        }
        catch {
            // Completion is opportunistic; use known metadata on query failure.
        }

        if (!isCurrent()) {
            return { ok: false, value: { symbols: [], items: [] } };
        }
    }

    const entries = bindings.workspaceEntries();
    const code = String(input.code || "");
    const cursor = Number(input.cursorColumn);
    const source = Number.isFinite(cursor) && cursor > 0
        ? code.slice(0, cursor - 1)
        : code;
    const context = getRCompletionContext(source);
    const prefix = String(input.prefix || "");
    let names: string[];

    if (context?.mode === "dollar") {
        // Cached columns describe top-level datasets, not nested member chains.
        const entry = context.chain === context.object
            ? entries.find((item) => item.name === context.object)
            : undefined;
        names = Array.isArray(entry?.columns)
            ? entry.columns.map((name) => String(name || "")).filter(Boolean)
            : [];
    }
    else {
        names = filterRInternalCompletionSymbols(entries.map((entry) => entry.name));
    }

    const symbols = context?.mode === "dollar" ? names : [
        ...names,
        ...entries.flatMap((entry) => Array.isArray(entry.columns)
            ? entry.columns.map((name) => String(name || "")).filter(Boolean)
            : [])
    ];
    return {
        ok: true,
        value: {
            symbols,
            items: [...new Set(names)]
                .filter((name) => !prefix || name.startsWith(prefix))
                .map((label) => ({ label, kind: "variable" }))
        }
    };
};
