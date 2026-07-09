import type * as Monaco from "monaco-editor";

import type { ConsoleHistoryDirection } from "./consoleEditorCommandController";


export interface ConsoleEditorHistoryBindings {
    getHistory(): string[];
    getInputValue(): string;
    getSelection(): Monaco.Selection | null;
    getPosition(): Monaco.Position | null;
    getOffsetAt(position: Monaco.IPosition): number;
    getValueLength(): number;
    setInputValue(value: string, selection?: Monaco.IRange | null): void;
    refreshPrompt(): void;
}


export interface ConsoleEditorHistoryController {
    previous(): boolean;
    next(): boolean;
    navigate(direction: ConsoleHistoryDirection): boolean;
    shouldNavigate(direction: ConsoleHistoryDirection): boolean;
    reset(): void;
    isNavigating(): boolean;
}


const hasSelectionRange = function(selection: Monaco.Selection): boolean {
    return Number(selection.startLineNumber) !== Number(selection.endLineNumber)
        || Number(selection.startColumn) !== Number(selection.endColumn);
};


export const createConsoleEditorHistoryController = function(
    bindings: ConsoleEditorHistoryBindings
): ConsoleEditorHistoryController {
    let historyIndex = -1;
    let historyDraft = "";
    let historyDraftSelection: Monaco.Selection | null = null;
    const selectionByHistoryIndex = new Map<
        number,
        Monaco.Selection | null
    >();

    const history = function(): string[] {
        const values = bindings.getHistory?.();

        return Array.isArray(values) ? values : [];
    };

    const reset = function(): void {
        historyIndex = -1;
        historyDraft = "";
        historyDraftSelection = null;
        selectionByHistoryIndex.clear();
    };

    const previous = function(): boolean {
        const values = history();

        if (!values.length) {
            return false;
        }

        if (historyIndex >= 0) {
            selectionByHistoryIndex.set(
                historyIndex,
                bindings.getSelection()
            );
        }
        else {
            historyDraft = bindings.getInputValue();
            historyDraftSelection = bindings.getSelection();
        }

        if (historyIndex === -1) {
            historyIndex = values.length - 1;
        }
        else if (historyIndex > 0) {
            historyIndex -= 1;
        }

        bindings.setInputValue(
            String(values[historyIndex] || ""),
            selectionByHistoryIndex.get(historyIndex) || null
        );
        bindings.refreshPrompt();

        return true;
    };

    const next = function(): boolean {
        const values = history();

        if (!values.length || historyIndex === -1) {
            return false;
        }

        selectionByHistoryIndex.set(
            historyIndex,
            bindings.getSelection()
        );

        if (historyIndex < values.length - 1) {
            historyIndex += 1;
            bindings.setInputValue(
                String(values[historyIndex] || ""),
                selectionByHistoryIndex.get(historyIndex) || null
            );
        }
        else {
            historyIndex = -1;
            bindings.setInputValue(
                historyDraft,
                historyDraftSelection
            );
        }

        bindings.refreshPrompt();

        return true;
    };

    const shouldNavigate = function(
        direction: ConsoleHistoryDirection
    ): boolean {
        const selection = bindings.getSelection();
        const position = bindings.getPosition();

        if (!selection || !position) {
            return true;
        }

        if (hasSelectionRange(selection)) {
            return false;
        }

        try {
            const offset = Number(bindings.getOffsetAt(position) || 0);
            const length = Number(bindings.getValueLength() || 0);
            const atStart = offset <= 0;
            const atEnd = offset >= length;

            if (historyIndex >= 0 && (atStart || atEnd)) {
                return true;
            }
        }
        catch {}

        const totalLines = Math.max(
            1,
            bindings.getInputValue().split("\n").length
        );
        const currentLine = Number(position.lineNumber || 1);

        return direction === "up"
            ? currentLine <= 1
            : currentLine >= totalLines;
    };

    return {
        previous,
        next,
        shouldNavigate,
        reset,
        isNavigating: function(): boolean {
            return historyIndex !== -1;
        },
        navigate: function(direction): boolean {
            if (!shouldNavigate(direction)) {
                return false;
            }

            return direction === "up" ? previous() : next();
        }
    };
};
