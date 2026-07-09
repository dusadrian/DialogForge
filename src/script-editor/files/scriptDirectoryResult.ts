export interface ScriptDirectoryEntry {
    name: string;
    isDirectory: boolean;
    isFile: boolean;
}


export interface ScriptDirectoryResult {
    status: string;
    dirPath?: string;
    entries?: ScriptDirectoryEntry[];
    message?: string;
}


export const createUnsupportedScriptDirectoryResult = function(): ScriptDirectoryResult {
    return {
        status: "unsupported",
        entries: []
    };
};


export const createScriptEditorConfirmSaveResult = function(
    action = "save"
): { action: string } {
    return { action };
};
