export interface ScriptEditorActionControllerOptions {
    createDocument(): void;
    openSelectedFile(): Promise<unknown> | unknown;
    runCurrent(): Promise<unknown> | unknown;
    toggleOutline(event: MouseEvent): void;
    showHelp(): Promise<unknown> | unknown;
    saveCurrent(): Promise<unknown> | unknown;
    saveCurrentAs(): Promise<unknown> | unknown;
}


export interface ScriptEditorActionController {
    createFile(): void;
    openFile(): void;
    run(): void;
    toggleOutline(event: MouseEvent): void;
    showHelp(): void;
    save(): void;
    saveAs(): void;
}


export const createScriptEditorActionController = function(
    options: ScriptEditorActionControllerOptions
): ScriptEditorActionController {
    return {
        createFile() {
            options.createDocument();
        },
        openFile() {
            void options.openSelectedFile();
        },
        run() {
            void options.runCurrent();
        },
        toggleOutline(event) {
            options.toggleOutline(event);
        },
        showHelp() {
            void options.showHelp();
        },
        save() {
            void options.saveCurrent();
        },
        saveAs() {
            void options.saveCurrentAs();
        }
    };
};
