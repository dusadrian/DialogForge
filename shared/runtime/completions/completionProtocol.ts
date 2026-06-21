import type { CompletionRequest, CompletionResult } from "../provider-contract/runtimeProvider";


type CompletionItem = CompletionResult["items"][number];


export const createCompletionRequest = function(input: Partial<CompletionRequest>): CompletionRequest {
    const cursorColumn = Number(input.cursorColumn || 0);
    const timeoutMs = Number(input.timeoutMs || 0);

    return {
        prefix: String(input && input.prefix ? input.prefix : "").trim(),
        source: String(input && input.source ? input.source : "base-app.completions").trim(),
        code: String(input && input.code ? input.code : ""),
        cursorColumn: Number.isFinite(cursorColumn) && cursorColumn > 0 ? cursorColumn : undefined,
        timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined,
        packageName: String(input && input.packageName ? input.packageName : "").trim() || undefined,
        includeInternals: input.includeInternals === true
    };
};


export const createCompletionItem = function(input: Partial<CompletionItem>): CompletionItem {
    return {
        label: input.label || "",
        detail: input.detail || "",
        kind: input.kind || "symbol"
    };
};


export const createCompletionResult = function(input: Partial<CompletionResult>): CompletionResult {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        prefix: input.prefix || "",
        items: input.items || [],
        exports: input.exports || [],
        internals: input.internals || [],
        symbols: input.symbols || [],
        message: input.message || "",
        resolvedAt: new Date().toISOString()
    };
};
