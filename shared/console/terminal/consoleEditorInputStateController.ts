import { normalizeConsoleCommandText } from "../commandText";
import {
    buildContextualHelpRequest,
    type ConsoleHelpTopicRequest
} from "./contextualHelp";
import type * as Monaco from "monaco-editor";


export interface ConsoleEditorInputStateBindings {
    getEditor(): Monaco.editor.IStandaloneCodeEditor | null;
    getModel(): Monaco.editor.ITextModel | null;
    isInteractive(): boolean;
    shouldShowPrompt(): boolean;
    getSessionPhase(): string;
    getRuntimeBusy(): boolean;
    getSubmissionBusy(): boolean;
    getActiveCommandElapsedMs(): number | null;
    resetHistory(): void;
    isHistoryNavigating(): boolean;
    refreshPrompt(): void;
    showHelpTopic?(request: ConsoleHelpTopicRequest): void;
    timingLog?(message: string, data?: unknown): void;
}


export interface ConsoleEditorInputStateController {
    getValue(): string;
    setValue(value: string, selection?: Monaco.IRange | null): void;
    clear(): void;
    setText(value: string): void;
    insertTextAtSelection(value: string): void;
    showContextualHelp(): void;
    requestFocus(): void;
    requestPromptFocus(): void;
    hasPendingFocus(): boolean;
    clearPendingFocus(): void;
    focus(): void;
    onModelChanged(): void;
    onEditorReady(): void;
}


export const createConsoleEditorInputStateController = function(
    bindings: ConsoleEditorInputStateBindings
): ConsoleEditorInputStateController {
    let pendingText: string | null = null;
    let pendingFocus = false;
    let applyingHistoryInput = false;

    const timingLog = function(message: string, data?: unknown): void {
        try {
            bindings.timingLog?.(message, data);
        }
        catch {}
    };

    const getValue = function(): string {
        return String(bindings.getModel()?.getValue?.() || "");
    };

    const setValue = function(
        value: string,
        selection?: Monaco.IRange | null
    ): void {
        const editor = bindings.getEditor();
        const model = bindings.getModel();

        if (!model || !editor) {
            return;
        }

        const nextValue = normalizeConsoleCommandText(value);
        applyingHistoryInput = true;
        model.setValue(nextValue);

        if (selection) {
            try {
                editor.setSelection(selection);
            }
            catch {}
        }
        else {
            const lineCount = Number(model.getLineCount?.() || 1);
            const column = Number(
                model.getLineMaxColumn?.(lineCount) || 1
            );

            try {
                editor.setPosition({
                    lineNumber: lineCount,
                    column
                });
            }
            catch {}
        }

        applyingHistoryInput = false;
    };

    const clear = function(): void {
        if (!bindings.getModel() || !bindings.getEditor()) {
            pendingText = "";
            pendingFocus = false;
            bindings.resetHistory();
            return;
        }

        setValue("");
        bindings.resetHistory();
        bindings.refreshPrompt();
    };

    const setText = function(rawText: string): void {
        const text = normalizeConsoleCommandText(rawText);
        pendingText = text;

        if (!bindings.getModel() || !bindings.getEditor()) {
            bindings.resetHistory();
            return;
        }

        setValue(text);
        pendingText = null;
        bindings.resetHistory();
        bindings.refreshPrompt();
    };

    const insertTextAtSelection = function(rawText: string): void {
        const editor = bindings.getEditor();
        const model = bindings.getModel();

        if (!editor || !model) {
            return;
        }

        const text = String(rawText || "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");

        if (!text) {
            return;
        }

        const selection = editor.getSelection?.();

        if (!selection) {
            return;
        }

        try {
            editor.executeEdits("dm.paste", [{
                range: selection,
                text,
                forceMoveMarkers: true
            }]);

            const endPosition = selection.getStartPosition().delta(0, 0);

            if (endPosition) {
                const position = editor.getPosition();

                if (position) {
                    try {
                        editor.revealPositionInCenterIfOutsideViewport(
                            position
                        );
                    }
                    catch {}
                }
            }

            bindings.refreshPrompt();
        }
        catch {
            try {
                editor.trigger("keyboard", "type", { text });
            }
            catch {}

            bindings.refreshPrompt();
        }
    };

    const showContextualHelp = function(): void {
        const editor = bindings.getEditor();
        const model = bindings.getModel();

        if (!model || !editor) {
            return;
        }

        const selection = editor.getSelection?.();
        const selectedText = selection
            ? String(model.getValueInRange?.(selection) || "")
            : "";
        const position = editor.getPosition?.() || {
            lineNumber: 1,
            column: 1
        };
        const offset = Number(model.getOffsetAt?.(position) || 0);
        const request = buildContextualHelpRequest(
            selectedText,
            getValue(),
            offset
        );

        if (!request) {
            return;
        }

        try {
            bindings.showHelpTopic?.(request);
        }
        catch {}
    };

    const focus = function(): void {
        if (!bindings.shouldShowPrompt()) {
            pendingFocus = true;
            timingLog("editor:focus:deferred", {
                sessionPhase: bindings.getSessionPhase(),
                busy: bindings.getSubmissionBusy(),
                runtimeBusy: bindings.getRuntimeBusy(),
                sinceEnterMs: bindings.getActiveCommandElapsedMs()
            });
            return;
        }

        const editor = bindings.getEditor();

        if (!editor) {
            pendingFocus = true;
            timingLog("editor:focus:pending-editor", {
                sinceEnterMs: bindings.getActiveCommandElapsedMs()
            });
            return;
        }

        try {
            editor.focus?.();
        }
        catch {}

        timingLog("editor:focus:applied", {
            sinceEnterMs: bindings.getActiveCommandElapsedMs()
        });
        pendingFocus = false;
    };

    const requestPromptFocus = function(): void {
        pendingFocus = true;
        focus();
    };

    const onEditorReady = function(): void {
        if (pendingText !== null) {
            const nextText = pendingText;
            pendingText = null;
            setText(nextText);
        }

        if (pendingFocus && bindings.isInteractive()) {
            pendingFocus = false;

            try {
                bindings.getEditor()?.focus?.();
            }
            catch {}
        }
    };

    return {
        getValue,
        setValue,
        clear,
        setText,
        insertTextAtSelection,
        showContextualHelp,
        focus,
        onEditorReady,
        requestFocus: function(): void {
            pendingFocus = true;
        },
        requestPromptFocus,
        hasPendingFocus: function(): boolean {
            return pendingFocus;
        },
        clearPendingFocus: function(): void {
            pendingFocus = false;
        },
        onModelChanged: function(): void {
            pendingText = null;
            bindings.refreshPrompt();

            if (
                !applyingHistoryInput
                && bindings.isHistoryNavigating()
            ) {
                bindings.resetHistory();
            }
        }
    };
};
