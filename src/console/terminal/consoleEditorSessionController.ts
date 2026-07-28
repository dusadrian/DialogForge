import type { ConsolePromptState } from "../services/consoleSessionState";


export interface ConsoleEditorSessionBindings {
    getSessionPhase(): string;
    onDidSessionPhase(
        listener: (phase: string) => void
    ): (() => void) | void;
    getPromptState(): ConsolePromptState;
    onDidPromptState(
        listener: (state: ConsolePromptState) => void
    ): (() => void) | void;
    getRuntimeBusy?(): boolean;
    onDidRuntimeBusy?(
        listener: (busy: boolean) => void
    ): (() => void) | void;
    onPromptChanged(): void;
    onSessionStateChanged(): void;
    getActiveCommandElapsedMs(): number | null;
    timingLog?(message: string, data?: unknown): void;
}


export interface ConsoleEditorSessionController {
    bind(): void;
    dispose(): void;
    getPromptState(): ConsolePromptState;
    getSessionPhase(): string;
    getRuntimeBusy(): boolean;
    isInteractive(): boolean;
    shouldShowPrompt(): boolean;
}


const normalizePromptState = function(
    state?: ConsolePromptState | null
): ConsolePromptState {
    return {
        inputPrompt: String(state?.inputPrompt || "> ").trimEnd(),
        continuationPrompt: String(
            state?.continuationPrompt || "+ "
        ).trimEnd()
    };
};


export const createConsoleEditorSessionController = function(
    bindings: ConsoleEditorSessionBindings
): ConsoleEditorSessionController {
    let sessionPhase = String(bindings.getSessionPhase?.() || "starting");
    let runtimeBusy = Boolean(bindings.getRuntimeBusy?.());
    let unsubscribePrompt: (() => void) | null = null;
    let unsubscribeSession: (() => void) | null = null;
    let unsubscribeRuntimeBusy: (() => void) | null = null;
    let bound = false;

    const timingLog = function(message: string, data?: unknown): void {
        try {
            bindings.timingLog?.(message, data);
        }
        catch {}
    };

    const readSessionPhase = function(): string {
        try {
            sessionPhase = String(
                bindings.getSessionPhase?.()
                || sessionPhase
                || "starting"
            );
        }
        catch {}

        return sessionPhase;
    };

    const readRuntimeBusy = function(): boolean {
        if (!bindings.getRuntimeBusy) {
            return runtimeBusy;
        }

        try {
            runtimeBusy = Boolean(bindings.getRuntimeBusy());
        }
        catch {}

        return runtimeBusy;
    };

    const bind = function(): void {
        if (bound) {
            return;
        }

        bound = true;

        try {
            const unsubscribe = bindings.onDidPromptState?.(() => {
                try {
                    bindings.onPromptChanged();
                }
                catch {}
            });
            unsubscribePrompt = typeof unsubscribe === "function"
                ? unsubscribe
                : null;
        }
        catch {}

        try {
            const unsubscribe = bindings.onDidSessionPhase?.((phase) => {
                sessionPhase = String(phase || "starting");

                try {
                    bindings.onSessionStateChanged();
                }
                catch {}
            });
            unsubscribeSession = typeof unsubscribe === "function"
                ? unsubscribe
                : null;
        }
        catch {}

        try {
            const unsubscribe = bindings.onDidRuntimeBusy?.((nextBusy) => {
                runtimeBusy = Boolean(nextBusy);
                timingLog("editor:runtimeBusy", {
                    runtimeBusy,
                    sinceEnterMs: bindings.getActiveCommandElapsedMs()
                });

                try {
                    bindings.onSessionStateChanged();
                }
                catch {}
            });
            unsubscribeRuntimeBusy = typeof unsubscribe === "function"
                ? unsubscribe
                : null;
        }
        catch {}

        // Close the race where ready/busy changes between construction and
        // listener attachment.
        readSessionPhase();
        readRuntimeBusy();

        bindings.onSessionStateChanged();
    };

    const disposeSubscription = function(
        unsubscribe: (() => void) | null
    ): void {
        try {
            unsubscribe?.();
        }
        catch {}
    };

    return {
        bind,
        getPromptState: function(): ConsolePromptState {
            return normalizePromptState(bindings.getPromptState?.());
        },
        getSessionPhase: function(): string {
            return readSessionPhase();
        },
        getRuntimeBusy: function(): boolean {
            return readRuntimeBusy();
        },
        isInteractive: function(): boolean {
            return readSessionPhase() === "ready";
        },
        shouldShowPrompt: function(): boolean {
            return readSessionPhase() === "ready" && !readRuntimeBusy();
        },
        dispose: function(): void {
            disposeSubscription(unsubscribePrompt);
            disposeSubscription(unsubscribeSession);
            disposeSubscription(unsubscribeRuntimeBusy);
            unsubscribePrompt = null;
            unsubscribeSession = null;
            unsubscribeRuntimeBusy = null;
            bound = false;
        }
    };
};
