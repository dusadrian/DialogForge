import type * as Monaco from "monaco-editor";
import type {
    ScriptDocument
} from "../state/scriptDocument";
import {
    bindScriptEditorInput
} from "./scriptEditorInputBindings";


export const createScriptEditorInputController = function(
    options: {
        runCodeAtCursor(): Promise<unknown> | unknown;
        saveCurrent(): Promise<unknown> | unknown;
        saveCurrentAs(): Promise<unknown> | unknown;
        openScript(): Promise<unknown> | unknown;
        createTab(): void;
        showHelpAtCursor(): Promise<unknown> | unknown;
        readClipboardText(): Promise<string>;
        insertCodeAtCursor(code: unknown): void;
        getActiveTab(): ScriptDocument | null;
        getEditor(): Monaco.editor.IStandaloneCodeEditor | null;
        persistSession(): void;
        closeCrumbPopup(): void;
        closeOutline(): void;
    }
) {
    const bind = function(
        monaco: typeof Monaco,
        editor: Monaco.editor.IStandaloneCodeEditor
    ): void {
        bindScriptEditorInput(
            monaco,
            editor,
            {
                run: () => {
                    void options.runCodeAtCursor();
                },
                save: () => {
                    void options.saveCurrent();
                },
                saveAs: () => {
                    void options.saveCurrentAs();
                },
                open: () => {
                    void options.openScript();
                },
                create: options.createTab,
                help: () => {
                    void options.showHelpAtCursor();
                },
                paste: () => {
                    void options.readClipboardText()
                        .then(options.insertCodeAtCursor);
                },
                pasteText: options.insertCodeAtCursor,
                scrollChanged: () => {
                    const active = options.getActiveTab();

                    if (!active) {
                        return;
                    }

                    active.scrollTop = Number(
                        options.getEditor()?.getScrollTop?.() || 0
                    );
                    options.persistSession();
                },
                dismissPopups: () => {
                    options.closeCrumbPopup();
                    options.closeOutline();
                }
            }
        );
    };

    return {
        bind
    };
};
