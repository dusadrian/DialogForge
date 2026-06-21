import type * as Monaco from "monaco-editor";

import type { CompletionModel } from "./completionTypes";


export type ConsoleHistoryDirection = "up" | "down";


export interface ConsoleEditorCommandBindings {
    monaco: typeof Monaco;
    editor: Monaco.editor.IStandaloneCodeEditor;
    getModel(): Monaco.editor.ITextModel | null;
    getInputValue(): string;
    navigateHistory(direction: ConsoleHistoryDirection): boolean;
    getCompletionModel?(): CompletionModel | undefined;
    adjustFontSize?(delta: number): number | void;
    interruptExecution?(): Promise<void> | void;
    scrollToPrompt?(): void;
    clearInput(): void;
    submitInput(): Promise<void> | void;
    insertText(text: string): void;
    showContextualHelp(): void;
    disarmEscapeClear(): void;
}


const readClipboardText = async function(): Promise<string> {
    try {
        if (navigator?.clipboard?.readText) {
            const text = await navigator.clipboard.readText();

            if (typeof text === "string") {
                return text;
            }
        }
    }
    catch {}

    return "";
};


const writeClipboardText = async function(text: string): Promise<boolean> {
    const normalized = String(text || "");

    if (!normalized) {
        return false;
    }

    try {
        const host = (window as unknown as {
            dialogForge?: {
                writeClipboardText?(value: string): Promise<boolean> | boolean | void;
            };
        }).dialogForge;

        if (host?.writeClipboardText) {
            await host.writeClipboardText(normalized);
            return true;
        }
    }
    catch {}

    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(normalized);
            return true;
        }
    }
    catch {}

    return false;
};


const getDocumentSelectionText = function(): string {
    try {
        return String(window.getSelection?.()?.toString?.() || "");
    }
    catch {
        return "";
    }
};


export const wireConsoleEditorCommands = function(
    bindings: ConsoleEditorCommandBindings
): Monaco.IDisposable[] {
    const { monaco, editor } = bindings;
    const KeyCode = monaco.KeyCode;
    const KeyMod = monaco.KeyMod;

    const acceptSuggestion = function(): void {
        try {
            editor.trigger("keyboard", "acceptSelectedSuggestion", {});
        }
        catch {}
    };

    const triggerSuggestion = function(): void {
        try {
            editor.trigger("keyboard", "editor.action.triggerSuggest", {});
        }
        catch {}
    };

    const isSuggestionVisible = function(): boolean {
        try {
            const contribution = editor.getContribution(
                "editor.contrib.suggestController"
            ) as unknown as {
                model?: { state?: unknown };
            } | null;
            const modelState = contribution?.model?.state;

            return Boolean(modelState && Number(modelState) !== 0);
        }
        catch {
            return false;
        }
    };

    const replaceRangeText = function(
        range: Monaco.IRange,
        text: string,
        source: string
    ): void {
        try {
            editor.executeEdits(source, [{
                range,
                text,
                forceMoveMarkers: true
            }]);
        }
        catch {}
    };

    const moveCursorToLineStart = function(): void {
        const position = editor.getPosition?.();

        if (!position) {
            return;
        }

        try {
            editor.setPosition({
                lineNumber: Number(position.lineNumber || 1),
                column: 1
            });
        }
        catch {}
    };

    const moveCursorToLineEnd = function(): void {
        const position = editor.getPosition?.();
        const model = bindings.getModel();

        if (!position || !model) {
            return;
        }

        const lineNumber = Number(position.lineNumber || 1);
        const column = Number(model.getLineMaxColumn?.(lineNumber) || 1);

        try {
            editor.setPosition({
                lineNumber,
                column
            });
        }
        catch {}
    };

    const scrollToPrompt = function(): void {
        try {
            bindings.scrollToPrompt?.();
        }
        catch {}

        try {
            editor.focus?.();
        }
        catch {}
    };

    const pasteClipboardText = function(): void {
        void readClipboardText().then((text) => {
            bindings.insertText(text);
        });
    };

    const disposable = editor.onKeyDown((event: Monaco.IKeyboardEvent) => {
        try {
            if (Number(event?.keyCode) !== Number(KeyCode.Escape)) {
                bindings.disarmEscapeClear();
            }

            const keyCode = Number(event?.keyCode);
            const isCtrlCmd = Boolean(event?.ctrlKey || event?.metaKey);
            const isShift = Boolean(event?.shiftKey);
            const isAlt = Boolean(event?.altKey);
            const keyText = String(event?.browserEvent?.key || "");

            if (
                isCtrlCmd
                && !isAlt
                && (keyText === "+" || keyText === "=" || keyText === "Add")
            ) {
                event.preventDefault();
                event.stopPropagation();
                bindings.adjustFontSize?.(1);
                return;
            }

            if (
                isCtrlCmd
                && !isAlt
                && (keyText === "-" || keyText === "_" || keyText === "Subtract")
            ) {
                event.preventDefault();
                event.stopPropagation();
                bindings.adjustFontSize?.(-1);
                return;
            }

            if (
                isSuggestionVisible()
                && (
                    keyCode === Number(KeyCode.UpArrow)
                    || keyCode === Number(KeyCode.DownArrow)
                )
            ) {
                return;
            }

            if (
                !isCtrlCmd
                && !isShift
                && !isAlt
                && keyCode === Number(KeyCode.UpArrow)
            ) {
                if (bindings.navigateHistory("up")) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                return;
            }

            if (
                !isCtrlCmd
                && !isShift
                && !isAlt
                && keyCode === Number(KeyCode.DownArrow)
            ) {
                if (bindings.navigateHistory("down")) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                return;
            }

            if (
                isCtrlCmd
                && !isShift
                && !isAlt
                && keyCode === Number(KeyCode.UpArrow)
            ) {
                if (bindings.navigateHistory("up")) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                return;
            }

            if (
                isCtrlCmd
                && !isShift
                && !isAlt
                && keyCode === Number(KeyCode.DownArrow)
            ) {
                event.preventDefault();
                event.stopPropagation();
                scrollToPrompt();
                return;
            }

            if (
                isCtrlCmd
                && !isShift
                && !isAlt
                && keyCode === Number(KeyCode.LeftArrow)
            ) {
                event.preventDefault();
                event.stopPropagation();
                moveCursorToLineStart();
                return;
            }

            if (
                isCtrlCmd
                && !isShift
                && !isAlt
                && keyCode === Number(KeyCode.RightArrow)
            ) {
                event.preventDefault();
                event.stopPropagation();
                moveCursorToLineEnd();
                return;
            }

            if (
                !isCtrlCmd
                && !isShift
                && !isAlt
                && keyCode === Number(KeyCode.Tab)
                && !isSuggestionVisible()
            ) {
                const position = editor.getPosition?.();
                const model = bindings.getModel();
                const modelValue = String(model?.getValueInRange?.({
                    startLineNumber: Number(position?.lineNumber || 1),
                    startColumn: 1,
                    endLineNumber: Number(position?.lineNumber || 1),
                    endColumn: Number(position?.column || 1)
                }) || "");
                const context = bindings.getCompletionModel?.()
                    ?.getCompletionContext?.(modelValue);

                if (context?.mode === "path") {
                    event.preventDefault();
                    event.stopPropagation();

                    const replaceText = String(
                        context.replaceText || context.token || ""
                    );
                    const range = new monaco.Range(
                        Number(position?.lineNumber || 1),
                        Math.max(
                            1,
                            Number(position?.column || 1) - replaceText.length
                        ),
                        Number(position?.lineNumber || 1),
                        Number(position?.column || 1)
                    );

                    void Promise.resolve(
                        bindings.getCompletionModel?.()
                            ?.getRuntimeCompletionSuggestions?.(
                                context,
                                modelValue,
                                Number(position?.column || 1),
                                3200
                            ) || []
                    ).then((items) => {
                        if (items.length === 1) {
                            replaceRangeText(
                                range,
                                String(items[0]?.label || ""),
                                "dm.pathCompletion"
                            );
                            return;
                        }

                        triggerSuggestion();
                    }).catch(() => {
                        triggerSuggestion();
                    });
                    return;
                }
            }

            if (
                isCtrlCmd
                && !isShift
                && !isAlt
                && keyCode === Number(KeyCode.KeyC)
            ) {
                const documentSelection = getDocumentSelectionText();

                if (documentSelection) {
                    event.preventDefault();
                    event.stopPropagation();
                    void writeClipboardText(documentSelection);
                    return;
                }

                const selection = editor.getSelection?.();
                const hasSelection = Boolean(selection && (
                    Number(selection.startLineNumber)
                        !== Number(selection.endLineNumber)
                    || Number(selection.startColumn)
                        !== Number(selection.endColumn)
                ));

                if (hasSelection && selection) {
                    const model = bindings.getModel();
                    const selectedText = String(
                        model?.getValueInRange?.(selection) || ""
                    );

                    if (selectedText) {
                        event.preventDefault();
                        event.stopPropagation();
                        void writeClipboardText(selectedText);
                    }

                    return;
                }

                if (!hasSelection) {
                    event.preventDefault();
                    event.stopPropagation();
                    void Promise.resolve(bindings.interruptExecution?.());
                }
            }
        }
        catch {}
    });

    editor.addCommand(KeyCode.UpArrow, () => {
        bindings.navigateHistory("up");
    }, "!suggestWidgetVisible");

    editor.addCommand(KeyCode.DownArrow, () => {
        bindings.navigateHistory("down");
    }, "!suggestWidgetVisible");

    editor.addCommand(KeyMod.CtrlCmd | KeyCode.UpArrow, () => {
        bindings.navigateHistory("up");
    }, "!suggestWidgetVisible");

    editor.addCommand(KeyMod.CtrlCmd | KeyCode.DownArrow, scrollToPrompt);
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.LeftArrow, moveCursorToLineStart);
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.RightArrow, moveCursorToLineEnd);

    editor.addAction({
        id: "dm.acceptSuggestionTab",
        label: "Accept Suggestion (Tab)",
        keybindings: [KeyCode.Tab],
        precondition: "suggestWidgetVisible",
        run: acceptSuggestion
    });

    editor.addAction({
        id: "dm.acceptSuggestionRight",
        label: "Accept Suggestion (Right)",
        keybindings: [KeyCode.RightArrow],
        precondition: "suggestWidgetVisible",
        run: acceptSuggestion
    });

    editor.addCommand(KeyCode.Escape, () => {
        if (isSuggestionVisible()) {
            try {
                editor.trigger("keyboard", "hideSuggestWidget", {});
            }
            catch {}
            bindings.disarmEscapeClear();
            return;
        }

        if (!bindings.getInputValue().length) {
            bindings.disarmEscapeClear();
            return;
        }

        bindings.disarmEscapeClear();
        bindings.clearInput();
    });

    editor.addCommand(KeyCode.Enter, () => {
        if (isSuggestionVisible()) {
            acceptSuggestion();
            return;
        }

        bindings.disarmEscapeClear();
        void bindings.submitInput();
    });

    editor.addCommand(KeyMod.Shift | KeyCode.Enter, () => {
        bindings.disarmEscapeClear();
        try {
            editor.trigger("keyboard", "type", { text: "\n" });
        }
        catch {}
    });

    editor.addCommand(KeyMod.CtrlCmd | KeyCode.Space, triggerSuggestion);

    editor.addCommand(KeyCode.F1, bindings.showContextualHelp);
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyV, pasteClipboardText);
    editor.addCommand(KeyMod.Shift | KeyCode.Insert, pasteClipboardText);

    return [disposable];
};
