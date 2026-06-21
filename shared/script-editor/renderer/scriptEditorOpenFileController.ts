export interface SelectedScriptEditorFile {
    filePath: string;
    content: string;
}


export interface ScriptEditorOpenFileControllerOptions {
    chooseFile(): Promise<SelectedScriptEditorFile | null>;
    openFile(
        filePath: string,
        content: string,
        preferCurrent: boolean
    ): Promise<void>;
}


export interface ScriptEditorOpenFileController {
    openSelectedFile(): Promise<boolean>;
}


export const createScriptEditorOpenFileController = function(
    options: ScriptEditorOpenFileControllerOptions
): ScriptEditorOpenFileController {
    const openSelectedFile = async function(): Promise<boolean> {
        const selected = await options.chooseFile();

        if (!selected) {
            return false;
        }

        await options.openFile(
            selected.filePath,
            selected.content,
            true
        );

        return true;
    };

    return {
        openSelectedFile
    };
};
