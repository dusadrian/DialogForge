import type {
    ScriptBreadcrumbView
} from "./scriptBreadcrumbView";
import type {
    ScriptEditorShell
} from "./scriptEditorShell";
import {
    createScriptEditorWorkspaceView,
    openScriptFileThroughTransport,
    type ScriptWorkspaceTransport
} from "./scriptEditorWorkspaceView";
import {
    createScriptToolbarView,
    type ScriptToolbarLabels,
    type ScriptToolbarView
} from "./scriptToolbarView";


export interface ScriptEditorShellControllerResult {
    breadcrumbView: ScriptBreadcrumbView;
    outlineButton: HTMLButtonElement;
    shellView: ScriptEditorShell;
    toolbarView: ScriptToolbarView;
}


export const createScriptEditorShellController = function(
    options: {
        root: HTMLElement;
        transport: ScriptWorkspaceTransport;
        getToolbarLabels(): ScriptToolbarLabels;
        createFile(): void;
        openScript(): void;
        runScript(): void;
        toggleOutline(event: MouseEvent): void;
        showHelp(): void;
        save(): void;
        saveAs(): void;
        getFilePath(file: File): string;
        openFile(
            filePath: string,
            content: string,
            preferCurrent: boolean
        ): Promise<unknown> | unknown;
        insertCode(code: unknown): void;
    }
): ScriptEditorShellControllerResult {
    const toolbarView = createScriptToolbarView(
        options.getToolbarLabels(),
        {
            createFile: options.createFile,
            openFile: options.openScript,
            run: options.runScript,
            toggleOutline: options.toggleOutline,
            showHelp: options.showHelp,
            save: options.save,
            saveAs: options.saveAs
        }
    );

    const workspaceView = createScriptEditorWorkspaceView({
        root: options.root,
        toolbar: toolbarView.element,
        transport: options.transport,
        getFilePath: options.getFilePath,
        openFile: async (filePath, preferCurrent) => {
            const opened = await openScriptFileThroughTransport(
                options.transport,
                filePath
            );

            if (!opened) {
                return;
            }

            await options.openFile(
                opened.filePath,
                opened.content,
                preferCurrent
            );
        },
        insertCode: options.insertCode
    });

    return {
        breadcrumbView: workspaceView.breadcrumbs,
        outlineButton: toolbarView.outlineButton,
        shellView: workspaceView.shell,
        toolbarView
    };
};
