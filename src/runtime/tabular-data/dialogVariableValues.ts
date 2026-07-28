export interface DialogVariableValuesResult {
    name: string;
    variableName: string;
    isNumeric: boolean;
    values: unknown[];
    rowNames: string[];
    error?: string;
}


const parseRuntimeValue = function(value: unknown): unknown {
    if (typeof value !== "string") {
        return value;
    }

    try {
        return JSON.parse(value);
    }
    catch {
        return value;
    }
};


const asRecord = function(value: unknown): Record<string, unknown> {
    const parsed = parseRuntimeValue(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
};


export const createDialogVariableValuesResult = function(
    value: unknown,
    fallback: {
        name?: unknown;
        variableName?: unknown;
        error?: unknown;
    } = {}
): DialogVariableValuesResult {
    const source = asRecord(value);
    const error = String(source.error || fallback.error || "").trim();
    const result: DialogVariableValuesResult = {
        name: String(source.name || fallback.name || "").trim(),
        variableName: String(
            source.variableName || fallback.variableName || ""
        ).trim(),
        isNumeric: source.isNumeric === true,
        values: Array.isArray(source.values)
            ? source.values.slice()
            : [],
        rowNames: Array.isArray(source.rowNames)
            ? source.rowNames.map(String)
            : []
    };

    if (error) {
        result.error = error;
    }

    return result;
};
