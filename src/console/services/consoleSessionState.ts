export interface ConsolePromptState {
    inputPrompt: string;
    continuationPrompt: string;
}


export interface ConsoleTranscriptIdentity {
    id?: string;
    parentId?: string;
    type?: string;
    commandKind?: string;
    source?: string;
    text?: string;
}


export interface ConsoleSessionState {
    getSessionPhase(): string;
    notifySessionPhase(): void;
    onDidSessionPhase(listener: (phase: string) => void): () => void;
    getPromptState(): ConsolePromptState;
    setPromptState(inputPrompt: string, continuationPrompt: string): void;
    onDidPromptState(listener: (state: ConsolePromptState) => void): () => void;
    isRuntimeBusy(): boolean;
    setRuntimeBusy(busy: boolean): void;
    onDidRuntimeBusy(listener: (busy: boolean) => void): () => void;
    getActivityId(event: ConsoleTranscriptIdentity, forceNew?: boolean): string;
    getTranscriptEventKey(event: ConsoleTranscriptIdentity): string;
    hasTranscriptEvent(key: string): boolean;
    rememberTranscriptEvent(key: string): void;
    clearTranscriptIdentity(): void;
}


const notifyListeners = function<T>(
    listeners: Set<(value: T) => void>,
    value: T
): void {
    listeners.forEach((listener) => {
        try {
            listener(value);
        } catch {
            // Renderer state listeners are best-effort updates.
        }
    });
};


const maximumConsoleIdentityEntries = 2000;


export const createConsoleSessionState = function(
    readRuntimeStatus: () => string
): ConsoleSessionState {
    const sessionPhaseListeners = new Set<(phase: string) => void>();
    const promptStateListeners = new Set<(state: ConsolePromptState) => void>();
    const runtimeBusyListeners = new Set<(busy: boolean) => void>();
    const activityIdsBySignature = new Map<string, string>();
    const activitySignatureOrder: string[] = [];
    const transcriptEventKeys = new Set<string>();
    const transcriptEventKeyOrder: string[] = [];
    const promptState: ConsolePromptState = {
        inputPrompt: "> ",
        continuationPrompt: "+ "
    };
    let activitySequence = 0;
    let runtimeBusy = false;

    const getSessionPhase = function(): string {
        const status = String(readRuntimeStatus() || "not-started");

        if (status === "ready") return "ready";
        if (status === "starting") return "starting";

        return "stopped";
    };

    const onDidSessionPhase = function(
        listener: (phase: string) => void
    ): () => void {
        sessionPhaseListeners.add(listener);
        listener(getSessionPhase());

        return () => {
            sessionPhaseListeners.delete(listener);
        };
    };

    const onDidPromptState = function(
        listener: (state: ConsolePromptState) => void
    ): () => void {
        promptStateListeners.add(listener);
        listener(promptState);

        return () => {
            promptStateListeners.delete(listener);
        };
    };

    const onDidRuntimeBusy = function(
        listener: (busy: boolean) => void
    ): () => void {
        runtimeBusyListeners.add(listener);
        listener(runtimeBusy);

        return () => {
            runtimeBusyListeners.delete(listener);
        };
    };

    const activitySignature = function(event: ConsoleTranscriptIdentity): string {
        if (event.parentId) return event.parentId;

        return [
            event.commandKind || "",
            event.source || "",
            event.text || ""
        ].join("\n");
    };

    const rememberActivitySignature = function(signature: string, activityId: string): void {
        if (!activityIdsBySignature.has(signature)) {
            activitySignatureOrder.push(signature);
        }

        activityIdsBySignature.set(signature, activityId);

        while (activitySignatureOrder.length > maximumConsoleIdentityEntries) {
            const expiredSignature = activitySignatureOrder.shift();

            if (expiredSignature) {
                activityIdsBySignature.delete(expiredSignature);
            }
        }
    };

    const rememberTranscriptEventKey = function(key: string): void {
        if (!key) return;

        if (!transcriptEventKeys.has(key)) {
            transcriptEventKeyOrder.push(key);
        }

        transcriptEventKeys.add(key);

        while (transcriptEventKeyOrder.length > maximumConsoleIdentityEntries) {
            const expiredKey = transcriptEventKeyOrder.shift();

            if (expiredKey) {
                transcriptEventKeys.delete(expiredKey);
            }
        }
    };

    const getActivityId = function(
        event: ConsoleTranscriptIdentity,
        forceNew = false
    ): string {
        const signature = activitySignature(event);
        const parentId = String(event.parentId || "");

        if (parentId) {
            rememberActivitySignature(signature, parentId);
            return parentId;
        }

        const existing = activityIdsBySignature.get(signature);

        if (existing && !forceNew) return existing;

        activitySequence += 1;
        const activityId = `activity_${Date.now()}_${activitySequence}`;
        rememberActivitySignature(signature, activityId);

        return activityId;
    };

    return {
        getSessionPhase,
        notifySessionPhase: () => {
            notifyListeners(sessionPhaseListeners, getSessionPhase());
        },
        onDidSessionPhase,
        getPromptState: () => promptState,
        setPromptState: (inputPrompt, continuationPrompt) => {
            promptState.inputPrompt = String(inputPrompt || "> ");
            promptState.continuationPrompt = String(continuationPrompt || "+ ");
            notifyListeners(promptStateListeners, promptState);
        },
        onDidPromptState,
        isRuntimeBusy: () => runtimeBusy,
        setRuntimeBusy: (busy) => {
            const next = Boolean(busy);

            if (runtimeBusy === next) return;

            runtimeBusy = next;
            notifyListeners(runtimeBusyListeners, runtimeBusy);
        },
        onDidRuntimeBusy,
        getActivityId,
        getTranscriptEventKey: (event) => {
            return event.id ? [event.type, event.id].join("::") : "";
        },
        hasTranscriptEvent: (key) => transcriptEventKeys.has(key),
        rememberTranscriptEvent: (key) => {
            rememberTranscriptEventKey(key);
        },
        clearTranscriptIdentity: () => {
            activityIdsBySignature.clear();
            activitySignatureOrder.length = 0;
            transcriptEventKeys.clear();
            transcriptEventKeyOrder.length = 0;
        }
    };
};
