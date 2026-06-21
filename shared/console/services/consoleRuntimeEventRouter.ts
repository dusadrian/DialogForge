import type {
    TranscriptEvent
} from "../../runtime/provider-contract/runtimeProvider";

interface ConsolePromptState {
    inputPrompt: string;
    continuationPrompt: string;
}

export interface ConsoleRuntimeEventSession {
    getActivityId: (
        event: TranscriptEvent,
        allowCreate: boolean
    ) => string;
    getPromptState: () => ConsolePromptState;
}

export interface ConsoleRuntimeEventTranscript {
    recordRuntimePromptState: (state: ConsolePromptState) => void;
    recordRuntimeMessageInput: (message: {
        id: string;
        parent_id: string;
        when: string;
        code: string;
    }) => void;
    recordRuntimeMessagePrompt: (message: {
        id: string;
        parent_id: string;
        when: string;
        prompt: string;
        password: boolean;
    }) => void;
    recordRuntimeMessageStream: (message: {
        id: string;
        parent_id: string;
        when: string;
        name: string;
        text: string;
    }) => void;
    recordRuntimeMessageState: (message: {
        parent_id: string;
        state: string;
    }) => void;
}

export interface ConsoleRuntimeEventRouterOptions {
    session: ConsoleRuntimeEventSession;
    transcript: ConsoleRuntimeEventTranscript;
    setPromptState: (
        inputPrompt: string,
        continuationPrompt: string
    ) => void;
    setRuntimeBusy: (busy: boolean) => void;
}

export const routeConsoleRuntimeEvent = function(
    event: TranscriptEvent,
    options: ConsoleRuntimeEventRouterOptions
): void {
    if (event.type === "prompt_state") {
        options.setPromptState(
            event.inputPrompt || "> ",
            event.continuationPrompt || "+ "
        );

        const promptState = options.session.getPromptState();

        options.transcript.recordRuntimePromptState({
            inputPrompt: promptState.inputPrompt,
            continuationPrompt: promptState.continuationPrompt
        });
        return;
    }

    const activityId = options.session.getActivityId(
        event,
        event.type === "submitted"
    );
    const when = event.createdAt || new Date().toISOString();

    if (event.type === "submitted") {
        options.transcript.recordRuntimeMessageInput({
            id: "input_" + activityId,
            parent_id: activityId,
            when,
            code: event.text || ""
        });
        return;
    }

    if (event.type === "prompt") {
        const prompt = String(event.prompt || "").trim();

        if (!prompt) {
            return;
        }

        options.transcript.recordRuntimeMessagePrompt({
            id: event.id || "prompt_" + activityId + "_" + Date.now(),
            parent_id: activityId,
            when,
            prompt,
            password: Boolean(event.password)
        });
        return;
    }

    if (event.type === "output") {
        const message = String(event.message || "").trim();

        if (!message || message === "R command completed without output.") {
            return;
        }

        options.transcript.recordRuntimeMessageStream({
            id: event.id || "stream_" + activityId + "_" + Date.now(),
            parent_id: activityId,
            when,
            name: event.streamName || "stdout",
            text: message
        });
        return;
    }

    if (event.type === "failed" || event.type === "rejected") {
        const message = String(event.message || event.type || "").trim();

        if (message) {
            options.transcript.recordRuntimeMessageStream({
                id: "error_" + activityId + "_" + Date.now(),
                parent_id: activityId,
                when,
                name: "stderr",
                text: message
            });
        }

        options.transcript.recordRuntimeMessageState({
            parent_id: activityId,
            state: event.state || "error"
        });
        options.setRuntimeBusy(false);
        return;
    }

    if (event.type === "completed") {
        const state = String(event.state || "idle").toLowerCase();

        options.transcript.recordRuntimeMessageState({
            parent_id: activityId,
            state
        });
        options.setRuntimeBusy(state === "busy" || state === "starting");
    }
};
