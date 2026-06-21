export interface ScriptFileResult {
    status: string;
    canceled: boolean;
    filePath: string;
    content: string;
    message: string;
}


export const createScriptFileResult = function(input: Partial<ScriptFileResult>): ScriptFileResult {
    return {
        status: input.status || "unknown",
        canceled: Boolean(input.canceled),
        filePath: input.filePath || "",
        content: input.content || "",
        message: input.message || ""
    };
};

