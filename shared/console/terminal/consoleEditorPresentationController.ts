import {
    CONSOLE_FONT_FAMILY,
    CONSOLE_FONT_SIZE,
    normalizeConsoleTypography
} from "../consoleTypography";
import type { ConsolePromptState } from "../services/consoleSessionState";
import type * as Monaco from "monaco-editor";


export const CONSOLE_EDITOR_MIN_HEIGHT = 20;
export const CONSOLE_EDITOR_MAX_HEIGHT = 172;


export interface ConsoleEditorPresentationBindings {
    getEditor(): Monaco.editor.IStandaloneCodeEditor | null;
    getInputValue(): string;
    getPromptState(): ConsolePromptState;
    getSessionPhase(): string;
    getRuntimeBusy(): boolean;
    getSubmissionState(): {
        busy: boolean;
        submitting: boolean;
    };
    hasPendingFocus(): boolean;
    clearPendingFocus(): void;
    timingLog?(message: string, data?: unknown): void;
}


export interface ConsoleEditorPresentationController {
    mount(container: HTMLElement): HTMLDivElement;
    dispose(): void;
    getHost(): HTMLDivElement | null;
    getTypography(): ReturnType<typeof normalizeConsoleTypography>;
    getLineNumberOptions(): {
        lineNumbers: (lineNumber: number) => string;
        lineNumbersMinChars: number;
    };
    syncHeight(contentHeight?: number): void;
    refreshPrompt(): void;
    refreshInteractivity(): void;
    applyTypography(raw?: {
        fontFamily?: unknown;
        fontSize?: unknown;
    } | null): void;
    showLoadError(message: string): void;
}


export const resolveConsoleEditorHeight = function(
    rawHeight: number,
    source: string,
    lineHeight: number
): number {
    const baseLineHeight = Math.max(
        1,
        Number(lineHeight) || CONSOLE_EDITOR_MIN_HEIGHT
    );
    const normalizedSource = String(source || "");

    if (!normalizedSource.trim().length) {
        return CONSOLE_EDITOR_MIN_HEIGHT;
    }

    const measured = Math.max(
        baseLineHeight,
        Number(rawHeight) || baseLineHeight
    );
    const lineCount = Math.max(1, normalizedSource.split("\n").length);
    const requiredByLines = lineCount * baseLineHeight;

    return Math.max(
        CONSOLE_EDITOR_MIN_HEIGHT,
        Math.min(
            CONSOLE_EDITOR_MAX_HEIGHT,
            Math.max(measured, requiredByLines)
        )
    );
};


export const createConsoleEditorPresentationController = function(
    bindings: ConsoleEditorPresentationBindings
): ConsoleEditorPresentationController {
    let root: HTMLDivElement | null = null;
    let editorHost: HTMLDivElement | null = null;
    let typography = normalizeConsoleTypography();

    const timingLog = function(message: string, data?: unknown): void {
        try {
            bindings.timingLog?.(message, data);
        }
        catch {}
    };

    const isInteractive = function(): boolean {
        return bindings.getSessionPhase() === "ready";
    };

    const getLineNumberOptions = function() {
        if (!isInteractive()) {
            return {
                lineNumbers: function(): string {
                    return "";
                },
                lineNumbersMinChars: 0
            };
        }

        const promptState = bindings.getPromptState();
        const promptWidth = Math.max(
            1,
            promptState.inputPrompt.length,
            promptState.continuationPrompt.length
        );

        return {
            lineNumbers: function(lineNumber: number): string {
                return lineNumber < 2
                    ? promptState.inputPrompt
                    : promptState.continuationPrompt;
            },
            lineNumbersMinChars: promptWidth
        };
    };

    const syncHeight = function(contentHeight?: number): void {
        if (!editorHost) {
            return;
        }

        const editor = bindings.getEditor();
        const rawHeight = Number.isFinite(Number(contentHeight))
            ? Number(contentHeight)
            : Number(
                editor?.getContentHeight?.()
                || CONSOLE_EDITOR_MIN_HEIGHT
            );
        const nextHeight = resolveConsoleEditorHeight(
            rawHeight,
            bindings.getInputValue(),
            typography.lineHeight
        );

        editorHost.style.height = `${nextHeight}px`;

        try {
            editor?.layout?.();
        }
        catch {}
    };

    const refreshPrompt = function(): void {
        try {
            bindings.getEditor()?.updateOptions?.(getLineNumberOptions());
        }
        catch {}

        syncHeight();
    };

    const refreshInteractivity = function(): void {
        const editor = bindings.getEditor();
        const sessionPhase = bindings.getSessionPhase();
        const runtimeBusy = bindings.getRuntimeBusy();
        const interactive = isInteractive();
        const promptVisible = interactive && !runtimeBusy;
        const submissionState = bindings.getSubmissionState();
        const editorBlocked = !interactive
            || submissionState.submitting
            || runtimeBusy;

        if (root) {
            root.dataset.sessionPhase = sessionPhase;
            root.dataset.runtimeBusy = runtimeBusy ? "true" : "false";
            root.style.display = promptVisible ? "block" : "none";
            root.style.opacity = interactive ? "1" : "0.72";
        }

        timingLog("editor:interactivity", {
            promptVisible,
            interactive,
            busy: submissionState.busy,
            submitting: submissionState.submitting,
            runtimeBusy,
            editorBlocked,
            sessionPhase
        });

        try {
            editor?.updateOptions?.({
                readOnly: editorBlocked,
                domReadOnly: editorBlocked
            });
        }
        catch {}

        refreshPrompt();

        if (
            promptVisible
            && bindings.hasPendingFocus()
            && editor
        ) {
            try {
                editor.focus?.();
            }
            catch {}

            bindings.clearPendingFocus();
        }
    };

    const mount = function(container: HTMLElement): HTMLDivElement {
        root = document.createElement("div");
        root.style.display = "block";
        root.style.gap = "0";
        root.style.padding = "0";
        root.style.borderTop = "0";
        root.style.background = "transparent";
        root.style.boxSizing = "border-box";
        root.style.position = "relative";
        root.style.width = "100%";

        editorHost = document.createElement("div");
        editorHost.style.width = "100%";
        editorHost.style.minHeight = `${CONSOLE_EDITOR_MIN_HEIGHT}px`;
        editorHost.style.maxHeight = `${CONSOLE_EDITOR_MAX_HEIGHT}px`;
        editorHost.style.height = `${CONSOLE_EDITOR_MIN_HEIGHT}px`;
        editorHost.style.border = "0";
        editorHost.style.background = "transparent";

        root.appendChild(editorHost);
        container.appendChild(root);

        return editorHost;
    };

    const applyTypography = function(raw?: {
        fontFamily?: unknown;
        fontSize?: unknown;
    } | null): void {
        typography = normalizeConsoleTypography({
            fontFamily: raw?.fontFamily
                || typography.fontFamily
                || CONSOLE_FONT_FAMILY,
            fontSize: raw?.fontSize
                ?? typography.fontSize
                ?? CONSOLE_FONT_SIZE
        });

        try {
            bindings.getEditor()?.updateOptions?.({
                fontFamily: typography.fontFamily,
                fontSize: typography.fontSize,
                lineHeight: typography.lineHeight
            });
        }
        catch {}

        syncHeight();
    };

    const showLoadError = function(message: string): void {
        if (!editorHost) {
            return;
        }

        editorHost.innerHTML = "";

        const fallback = document.createElement("div");
        fallback.textContent = `Monaco failed to load: ${message}`;
        fallback.style.color = "#800000";
        fallback.style.fontFamily = CONSOLE_FONT_FAMILY;
        fallback.style.fontSize = "12px";
        fallback.style.paddingTop = "4px";
        editorHost.appendChild(fallback);
    };

    return {
        mount,
        getLineNumberOptions,
        syncHeight,
        refreshPrompt,
        refreshInteractivity,
        applyTypography,
        showLoadError,
        getHost: function(): HTMLDivElement | null {
            return editorHost;
        },
        getTypography: function() {
            return typography;
        },
        dispose: function(): void {
            try {
                root?.remove?.();
            }
            catch {}

            root = null;
            editorHost = null;
        }
    };
};
