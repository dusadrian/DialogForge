import {
    createScriptEditorShellController,
    type ScriptEditorShellControllerResult
} from "./scriptEditorShellController";
import {
    createScriptMonacoEditor,
    type ScriptMonacoTypography
} from "./scriptMonacoEditor";
import type {
    ScriptEditorInitPayload
} from "./scriptEditorIpcBindings";
import type {
    ScriptToolbarLabels
} from "./scriptToolbarView";
import type {
    ScriptWorkspaceTransport
} from "./scriptEditorWorkspaceView";
import type * as Monaco from "monaco-editor";


export interface ScriptEditorBootstrapFlowOptions {
    prepare(initPayload: ScriptEditorInitPayload): Promise<{
        monaco: typeof Monaco;
        root: HTMLElement;
    } | null>;
    transport: ScriptWorkspaceTransport;
    theme: string;
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
    setShell(result: ScriptEditorShellControllerResult): void;
    initializeTypography(settings: unknown): ScriptMonacoTypography;
    setEditor(editor: Monaco.editor.IStandaloneCodeEditor): void;
    restoreSessionTabs(): Promise<boolean>;
    createUntitledTab(): void;
    bindInput(
        monaco: typeof Monaco,
        editor: Monaco.editor.IStandaloneCodeEditor
    ): void;
    completeBootstrap(): void;
}


export const createScriptEditorBootstrapFlowController = function(
    options: ScriptEditorBootstrapFlowOptions
) {
    const bootstrap = async function(
        initPayload: ScriptEditorInitPayload
    ): Promise<void> {
        const prepared = await options.prepare(initPayload);

        if (!prepared) {
            return;
        }

        const shellController = createScriptEditorShellController({
            root: prepared.root,
            transport: options.transport,
            getToolbarLabels: options.getToolbarLabels,
            createFile: options.createFile,
            openScript: options.openScript,
            runScript: options.runScript,
            toggleOutline: options.toggleOutline,
            showHelp: options.showHelp,
            save: options.save,
            saveAs: options.saveAs,
            getFilePath: options.getFilePath,
            openFile: options.openFile,
            insertCode: options.insertCode
        });
        options.setShell(shellController);

        const typography = options.initializeTypography(
            initPayload?.terminalSettings
        );
        const editor = createScriptMonacoEditor({
            monaco: prepared.monaco,
            host: shellController.shellView.editorHost,
            theme: options.theme,
            typography
        });
        options.setEditor(editor);

        const restored = await options.restoreSessionTabs();

        if (!restored) {
            options.createUntitledTab();
        }

        options.bindInput(prepared.monaco, editor);
        options.completeBootstrap();
    };

    return {
        bootstrap
    };
};
