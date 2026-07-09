import {
    filterRInternalCompletionSymbols
} from "../r/completions/rInternalCompletionSymbols";

export interface WebRCompletionRuntime {
    evalRString(command: string): Promise<string> | string;
}

export interface WebRCompletionRequest {
    prefix?: unknown;
    packageName?: unknown;
}

export interface WebRCompletionOptions {
    canReadRuntime?: () => boolean;
}

export interface WebRCompletionResult {
    ok: boolean;
    value: {
        exports?: string[];
        internals?: string[];
        symbols?: string[];
        items?: Array<{
            label: string;
            kind: string;
        }>;
    };
}


const parseCompletionSectionOutput = function(text: unknown): Record<string, string[]> {
    const sections: Record<string, string[]> = {};
    let section = "";

    String(text || "").split(/\r?\n/g).forEach((line) => {
        const value = String(line || "").trim();

        if (!value) {
            return;
        }

        if (/^[A-Z_]+$/.test(value)) {
            section = value.toLowerCase();
            if (!sections[section]) {
                sections[section] = [];
            }
            return;
        }

        if (section) {
            sections[section].push(value);
        }
    });

    return sections;
};


export const readWebRCompletionResult = async function(
    runtime: WebRCompletionRuntime | null | undefined,
    params: WebRCompletionRequest,
    options: WebRCompletionOptions = {}
): Promise<WebRCompletionResult | null> {
    if (!runtime || typeof runtime.evalRString !== "function") {
        return null;
    }

    if (
        typeof options.canReadRuntime === "function"
        && !options.canReadRuntime()
    ) {
        return null;
    }

    const prefix = String(params?.prefix || "");
    const packageName = String(params?.packageName || "").trim();

    if (packageName) {
        const text = await runtime.evalRString([
            "local({",
            `  .pkg <- ${JSON.stringify(packageName)}`,
            `  .prefix <- ${JSON.stringify(prefix)}`,
            "  .starts <- function(.values) {",
            "    .values <- unique(as.character(.values))",
            "    .values <- .values[nzchar(.values)]",
            "    if (nzchar(.prefix)) .values <- .values[startsWith(.values, .prefix)]",
            "    sort(.values)",
            "  }",
            "  .ns <- tryCatch(getNamespace(.pkg), error = function(.error) NULL)",
            "  .exports <- if (is.null(.ns)) character() else .starts(getNamespaceExports(.pkg))",
            "  .internals <- if (is.null(.ns)) character() else .starts(ls(.ns, all.names = TRUE))",
            "  cat(paste(c(\"EXPORTS\", .exports, \"INTERNALS\", .internals), collapse = \"\\n\"))",
            "})"
        ].join("\n"));
        const sections = parseCompletionSectionOutput(text);

        return {
            ok: true,
            value: {
                exports: filterRInternalCompletionSymbols(sections.exports || []),
                internals: filterRInternalCompletionSymbols(sections.internals || [])
            }
        };
    }

    const text = await runtime.evalRString([
        "local({",
        `  .prefix <- ${JSON.stringify(prefix)}`,
        "  .symbols <- ls(.GlobalEnv, all.names = FALSE)",
        "  if (nzchar(.prefix)) .symbols <- .symbols[startsWith(.symbols, .prefix)]",
        "  cat(paste(c(\"SYMBOLS\", sort(unique(.symbols))), collapse = \"\\n\"))",
        "})"
    ].join("\n"));
    const sections = parseCompletionSectionOutput(text);

    return {
        ok: true,
        value: {
            symbols: filterRInternalCompletionSymbols(sections.symbols || [])
        }
    };
};
