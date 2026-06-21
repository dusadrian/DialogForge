import { ensureConsoleSyntaxReady } from "../consoleSyntax";
import type { CompletionModel } from "./completionTypes";
import { registerConsoleCompletionProvider } from "./consoleCompletionProvider";
import { CONSOLE_EDITOR_MIN_HEIGHT } from "./consoleEditorPresentationController";
import type * as Monaco from "monaco-editor";


export interface ConsoleEditorMonacoBindings {
    isCancelled(): boolean;
    getHost(): HTMLDivElement | null;
    getCompletionModel?(): CompletionModel;
    getLineNumberOptions(): {
        lineNumbers: (lineNumber: number) => string;
        lineNumbersMinChars: number;
    };
    getTypography(): {
        fontFamily: string;
        fontSize: number;
        lineHeight: number;
    };
    wireCommands(
        monaco: typeof Monaco,
        editor: Monaco.editor.IStandaloneCodeEditor
    ): Monaco.IDisposable[];
    onCreated(
        editor: Monaco.editor.IStandaloneCodeEditor,
        model: Monaco.editor.ITextModel
    ): void;
    onModelChanged(): void;
    onContentSizeChanged(contentHeight: number): void;
    onCursorSelectionChanged(): void;
    onPaste(text: string): void;
    onReady(): void;
    onDisposed(): void;
    refreshInteractivity(): void;
    syncHeight(): void;
    showLoadError(message: string): void;
}


export interface ConsoleEditorMonacoController {
    initialize(): Promise<void>;
    dispose(): void;
    getEditor(): Monaco.editor.IStandaloneCodeEditor | null;
    getModel(): Monaco.editor.ITextModel | null;
}


export const createConsoleEditorMonacoController = function(
    bindings: ConsoleEditorMonacoBindings
): ConsoleEditorMonacoController {
    let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
    let model: Monaco.editor.ITextModel | null = null;
    let modelChangeDisposable: Monaco.IDisposable | null = null;
    let contentSizeDisposable: Monaco.IDisposable | null = null;
    let editorDisposables: Monaco.IDisposable[] = [];
    let editorDomPasteHandler: ((event: ClipboardEvent) => void) | null = null;

    const initialize = async function(): Promise<void> {
        try {
            const monaco = await ensureConsoleSyntaxReady();
            const editorHost = bindings.getHost();

            if (bindings.isCancelled() || !editorHost) {
                return;
            }

            registerConsoleCompletionProvider(
                monaco,
                bindings.getCompletionModel?.()
            );

            model = monaco.editor.createModel("", "r");

            const typography = bindings.getTypography();
            editor = monaco.editor.create(editorHost, {
                model,
                minimap: { enabled: false },
                scrollbar: {
                    vertical: "hidden",
                    horizontal: "hidden"
                },
                overviewRulerLanes: 0,
                ...bindings.getLineNumberOptions(),
                glyphMargin: false,
                folding: false,
                lineDecorationsWidth: "1.0ch",
                renderLineHighlight: "none",
                overviewRulerBorder: false,
                fontFamily: typography.fontFamily,
                fontSize: typography.fontSize,
                lineHeight: typography.lineHeight,
                wordWrap: "on",
                quickSuggestions: {
                    other: true,
                    comments: false,
                    strings: false
                },
                suggestOnTriggerCharacters: true,
                acceptSuggestionOnEnter: "on",
                tabCompletion: "on",
                contextmenu: false,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 0, bottom: 0 },
                fixedOverflowWidgets: true
            });

            bindings.onCreated(editor, model);

            try {
                editor.updateOptions({
                    cursorStyle: "line",
                    cursorBlinking: "blink",
                    bracketPairColorization: { enabled: false }
                });
            }
            catch {}

            modelChangeDisposable = model.onDidChangeContent(() => {
                bindings.onModelChanged();
            });

            contentSizeDisposable = editor.onDidContentSizeChange((event) => {
                bindings.onContentSizeChanged(Number(
                    event?.contentHeight || CONSOLE_EDITOR_MIN_HEIGHT
                ));
            });

            editorDisposables.push(
                editor.onDidChangeCursorSelection(() => {
                    bindings.onCursorSelectionChanged();
                })
            );

            editorDisposables.push(...bindings.wireCommands(monaco, editor));

            try {
                const domNode = editor.getDomNode?.();

                if (domNode) {
                    editorDomPasteHandler = function(
                        event: ClipboardEvent
                    ): void {
                        try {
                            const text = String(
                                event?.clipboardData?.getData("text/plain")
                                || ""
                            );

                            if (!text) {
                                return;
                            }

                            event.preventDefault();
                            event.stopPropagation();
                            bindings.onPaste(text);
                        }
                        catch {}
                    };
                    domNode.addEventListener(
                        "paste",
                        editorDomPasteHandler,
                        true
                    );
                }
            }
            catch {}

            bindings.refreshInteractivity();
            bindings.syncHeight();
            bindings.onReady();
        }
        catch (error: unknown) {
            const message = error instanceof Error
                ? error.message
                : String(error || "unknown");

            bindings.showLoadError(message);
        }
    };

    const dispose = function(): void {
        try {
            modelChangeDisposable?.dispose?.();
        }
        catch {}
        modelChangeDisposable = null;

        try {
            contentSizeDisposable?.dispose?.();
        }
        catch {}
        contentSizeDisposable = null;

        editorDisposables.forEach((disposable) => {
            try {
                disposable?.dispose?.();
            }
            catch {}
        });
        editorDisposables = [];

        try {
            const domNode = editor?.getDomNode?.();

            if (domNode && editorDomPasteHandler) {
                domNode.removeEventListener(
                    "paste",
                    editorDomPasteHandler,
                    true
                );
            }
        }
        catch {}
        editorDomPasteHandler = null;

        try {
            editor?.dispose?.();
        }
        catch {}
        editor = null;

        try {
            model?.dispose?.();
        }
        catch {}
        model = null;

        bindings.onDisposed();
    };

    return {
        initialize,
        dispose,
        getEditor: function(): Monaco.editor.IStandaloneCodeEditor | null {
            return editor;
        },
        getModel: function(): Monaco.editor.ITextModel | null {
            return model;
        }
    };
};
