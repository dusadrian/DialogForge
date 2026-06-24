export type ConsoleSubmissionResult = "ok" | "incomplete" | void;
export type ConsoleFragmentState =
    | "complete"
    | "incomplete"
    | "invalid"
    | "unknown";


export interface ConsoleEditorSubmissionBindings {
    hasModel(): boolean;
    isInteractive(): boolean;
    getSessionPhase(): string;
    getInputValue(): string;
    setInputValue(value: string): void;
    clearInput(): void;
    requestFocus(): void;
    requestPromptFocus(): void;
    refreshInteractivity(): void;
    refreshPrompt(): void;
    scrollToPrompt?(): void;
    recordBlankInput?(code: string): void;
    checkFragment(code: string): Promise<ConsoleFragmentState>;
    executeCode(code: string): Promise<ConsoleSubmissionResult>;
    debugLog?(message: string, data?: unknown): void;
    timingLog?(message: string, data?: unknown): void;
}


export interface ConsoleEditorSubmissionController {
    submit(): Promise<void>;
    isBusy(): boolean;
    isSubmitting(): boolean;
    activeCommandStartAt(): number;
}


const normalizedCode = function(value: string): string {
    return String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
};


export const createConsoleEditorSubmissionController = function(
    bindings: ConsoleEditorSubmissionBindings
): ConsoleEditorSubmissionController {
    let busy = false;
    let submitting = false;
    let commandStartAt = 0;

    const debugLog = function(message: string, data?: unknown): void {
        try {
            bindings.debugLog?.(message, data);
        }
        catch {}
    };

    const timingLog = function(message: string, data?: unknown): void {
        try {
            bindings.timingLog?.(message, data);
        }
        catch {}
    };

    const submit = async function(): Promise<void> {
        const sessionPhase = bindings.getSessionPhase();

        if (
            !bindings.hasModel()
            || busy
            || submitting
            || !bindings.isInteractive()
        ) {
            debugLog("editorInput:onEnter:ignored", {
                hasModel: bindings.hasModel(),
                busy,
                submitting,
                sessionPhase
            });
            return;
        }

        const code = normalizedCode(bindings.getInputValue());

        if (!code.trim()) {
            debugLog("editorInput:onEnter:empty");
            bindings.recordBlankInput?.(code);
            bindings.clearInput();
            bindings.refreshPrompt();
            bindings.requestFocus();

            try {
                bindings.scrollToPrompt?.();
            }
            catch {}

            bindings.requestPromptFocus();
            return;
        }

        debugLog("editorInput:onEnter:start", {
            sessionPhase,
            code: code.length > 220 ? `${code.slice(0, 220)}...` : code
        });

        commandStartAt = Date.now();
        timingLog("editor:onEnter:start", {
            code: code.slice(0, 160),
            sessionPhase
        });
        submitting = true;

        try {
            const fragmentStatus = await bindings.checkFragment(code);

            debugLog("editorInput:onEnter:fragmentStatus", {
                status: String(fragmentStatus || "")
            });

            if (fragmentStatus === "incomplete") {
                debugLog("editorInput:onEnter:incomplete");
                bindings.setInputValue(`${code}\n`);
                bindings.refreshPrompt();
                return;
            }

            busy = true;
            bindings.requestFocus();
            bindings.refreshInteractivity();
            bindings.clearInput();
            debugLog("editorInput:onEnter:dispatch", {
                chunk: code.length > 220
                    ? `${code.slice(0, 220)}...`
                    : code
            });
            timingLog("editor:onEnter:dispatch", {
                chunk: code.slice(0, 160),
                sinceEnterMs: Math.max(0, Date.now() - commandStartAt)
            });

            const status = await bindings.executeCode(code);

            debugLog("editorInput:onEnter:status", {
                status: String(status || "")
            });

            if (status === "incomplete") {
                bindings.setInputValue(`${code}\n`);
                bindings.refreshPrompt();
            }
        }
        finally {
            submitting = false;
            busy = false;
            bindings.requestFocus();

            try {
                bindings.scrollToPrompt?.();
            }
            catch {}

            timingLog("editor:onEnter:finally", {
                sinceEnterMs: commandStartAt
                    ? Math.max(0, Date.now() - commandStartAt)
                    : null
            });
            bindings.refreshInteractivity();
            bindings.requestPromptFocus();
        }
    };

    return {
        submit,
        isBusy: function(): boolean {
            return busy;
        },
        isSubmitting: function(): boolean {
            return submitting;
        },
        activeCommandStartAt: function(): number {
            return commandStartAt;
        }
    };
};
