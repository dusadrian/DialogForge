export interface MainShellEnvironment {
    window: Window;
    document: Document;
    storage: Storage;
    dialogForge: DialogForgeApi;
    confirm(message: string): boolean;
}


export const createMainShellEnvironment = function(
    windowRef: Window
): MainShellEnvironment {
    return {
        window: windowRef,
        document: windowRef.document,
        storage: windowRef.localStorage,
        dialogForge: windowRef.dialogForge,
        confirm: function(message: string): boolean {
            return windowRef.confirm(message);
        }
    };
};
