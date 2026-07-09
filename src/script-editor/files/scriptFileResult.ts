export interface ScriptFileResult {
    status: string;
    canceled: boolean;
    filePath: string;
    content: string;
    message: string;
}


export const createScriptFileResult = function(
    input: Partial<ScriptFileResult>
): ScriptFileResult {
    return {
        status: input.status || "unknown",
        canceled: Boolean(input.canceled),
        filePath: input.filePath || "",
        content: input.content || "",
        message: input.message || ""
    };
};


export const createUnsupportedScriptFilePickerResult = function(
    message = "Browser file picker is unavailable."
): ScriptFileResult {
    return createScriptFileResult({
        status: "unsupported",
        message
    });
};


export const createCanceledScriptFileSelectionResult = function(): ScriptFileResult {
    return createScriptFileResult({
        status: "canceled",
        canceled: true,
        message: "Script selection was canceled."
    });
};


export const createOpenedScriptFileResult = function(
    filePath: string,
    content: string
): ScriptFileResult {
    return createScriptFileResult({
        status: "ready",
        filePath,
        content,
        message: "Script file was opened."
    });
};


export const createSavedScriptFileResult = function(
    filePath: string,
    content: string
): ScriptFileResult {
    return createScriptFileResult({
        status: "saved",
        filePath,
        content,
        message: "Script file was saved."
    });
};
