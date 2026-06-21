export type CompletionMode =
    | "path"
    | "namespace"
    | "namespace-internal"
    | "dollar"
    | "data-mask-variable"
    | "symbol";

export interface CompletionContext {
    mode: CompletionMode;
    token: string;
    quote?: string;
    stringContent?: string;
    replaceText?: string;
    ns?: string;
    object?: string;
    chain?: string;
    fn?: string;
    dataset?: string;
}

export interface CompletionFetchRequest {
    prefix?: string;
    packageName?: string;
    includeInternals?: boolean;
    code?: string;
    cursorColumn?: number;
}

export interface CompletionFetchResult {
    ok: boolean;
    value?: unknown;
}

export interface RuntimeCompletionSuggestion {
    label: string;
    kind?: string;
}

export interface CompletionModelOptions {
    enablePackageSuggestions?: boolean;
    completionFetch?: (
        request: CompletionFetchRequest,
        timeoutMs?: number
    ) => Promise<CompletionFetchResult>;
}

export interface CompletionModel {
    getCompletionContext(line: string): CompletionContext | null;
    getLocalCompletionSuggestions(context: CompletionContext): string[];
    getRuntimeCompletionSuggestions(
        context: CompletionContext,
        input: string,
        cursorColumn: number,
        timeoutMs?: number
    ): Promise<RuntimeCompletionSuggestion[]>;
    registerCommandInput(input: string): void;
    ingestObjectNames(names: string[]): void;
}
