export type RScriptFragmentState =
    | "complete"
    | "incomplete"
    | "invalid"
    | "unknown";

export interface RScriptFragmentCompletenessRuntime {
    evalRString(command: string): Promise<string>;
}


export const buildRScriptFragmentCompletenessCommand = function(code: unknown): string {
    return [
        "tryCatch({",
        `  parse(text = ${JSON.stringify(String(code || ""))})`,
        "  \"complete\"",
        "}, error = function(e) {",
        "  message <- conditionMessage(e)",
        "  if (grepl(\"unexpected end|end of input\", message, ignore.case = TRUE)) \"incomplete\" else \"invalid\"",
        "})"
    ].join("\n");
};


export const normalizeRScriptFragmentState = function(value: unknown): RScriptFragmentState {
    const state = String(value || "").toLowerCase();

    if (
        state === "complete"
        || state === "incomplete"
        || state === "invalid"
    ) {
        return state;
    }

    return "unknown";
};


export const checkRScriptFragmentCompleteness = async function(
    runtime: RScriptFragmentCompletenessRuntime,
    code: unknown
): Promise<RScriptFragmentState> {
    const result = await runtime.evalRString(
        buildRScriptFragmentCompletenessCommand(code)
    );

    return normalizeRScriptFragmentState(result);
};
