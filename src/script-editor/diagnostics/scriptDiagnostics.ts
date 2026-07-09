export interface ScriptFragmentWarning {
    name?: string;
    message?: string;
    line?: number | null;
    column?: number | null;
}


export interface ScriptFragmentCheckResult {
    ok?: boolean;
    state?: string;
    message?: string;
    line?: number | null;
    column?: number | null;
    warnings?: ScriptFragmentWarning[];
}


export interface ScriptDiagnosticModel {
    getLineCount(): number;
    getLineMaxColumn(lineNumber: number): number;
}


export interface ScriptDiagnostic {
    severity: "error" | "warning";
    message: string;
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
}


const diagnosticPosition = function(
    model: ScriptDiagnosticModel,
    lineValue: number | null | undefined,
    columnValue: number | null | undefined,
    fallbackLine: number
): {
    line: number;
    startColumn: number;
    endColumn: number;
} {
    const lineCount = Math.max(1, Number(model.getLineCount()) || 1);
    const line = Math.max(
        1,
        Math.min(lineCount, Number(lineValue || fallbackLine))
    );
    const lineMaxColumn = Math.max(
        1,
        Number(model.getLineMaxColumn(line)) || 1
    );
    const startColumn = Math.max(
        1,
        Math.min(lineMaxColumn, Number(columnValue || 1))
    );

    return {
        line,
        startColumn,
        endColumn: Math.max(startColumn + 1, lineMaxColumn)
    };
};


export const createScriptDiagnostics = function(
    model: ScriptDiagnosticModel,
    result: ScriptFragmentCheckResult
): ScriptDiagnostic[] {
    const state = String(result?.state || "").toLowerCase();
    const diagnostics: ScriptDiagnostic[] = [];

    if (state === "invalid") {
        const lineCount = Math.max(1, Number(model.getLineCount()) || 1);
        const position = diagnosticPosition(
            model,
            result.line,
            result.column,
            lineCount
        );

        diagnostics.push({
            severity: "error",
            message: String(result.message || "Invalid R code."),
            startLineNumber: position.line,
            startColumn: position.startColumn,
            endLineNumber: position.line,
            endColumn: position.endColumn
        });
    }

    if (state === "complete" && Array.isArray(result.warnings)) {
        result.warnings.forEach((warning) => {
            const position = diagnosticPosition(
                model,
                warning.line,
                warning.column,
                1
            );

            diagnostics.push({
                severity: "warning",
                message: String(
                    warning.message || "Possible unresolved function."
                ),
                startLineNumber: position.line,
                startColumn: position.startColumn,
                endLineNumber: position.line,
                endColumn: position.endColumn
            });
        });
    }

    return diagnostics;
};
