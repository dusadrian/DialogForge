export const rInternalCompletionSymbolNames = [
    "declared_missing_cell_json",
    "declared_missing_index_value"
] as const;

const rInternalCompletionSymbols = new Set<string>(rInternalCompletionSymbolNames);


export const isRInternalCompletionSymbol = function(value: unknown): boolean {
    const symbol = String(value || "").trim();

    return symbol.startsWith(".") || rInternalCompletionSymbols.has(symbol);
};


export const filterRInternalCompletionSymbols = function(values: unknown[]): string[] {
    return Array.isArray(values)
        ? values
            .map((value) => String(value || "").trim())
            .filter((value) => value && !isRInternalCompletionSymbol(value))
        : [];
};
