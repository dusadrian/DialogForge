import type {
    TranscriptEvent
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    ConsoleSessionState
} from "../services/consoleSessionState";
import type {
    ConsoleRuntimeEventTranscript
} from "../services/consoleRuntimeEventRouter";
import {
    routeConsoleRuntimeEvent
} from "../services/consoleRuntimeEventRouter";


export interface ConsoleTranscriptControllerBindings {
    session: ConsoleSessionState;
    getTranscript(): ConsoleRuntimeEventTranscript | null;
    setPromptState(inputPrompt: string, continuationPrompt: string): void;
    setRuntimeBusy(busy: boolean): void;
    renderEvents(events: TranscriptEvent[]): void;
}


export interface ConsoleTranscriptController {
    record(events: TranscriptEvent[]): void;
    clear(): void;
    render(): void;
}


export const createConsoleTranscriptController = function(
    bindings: ConsoleTranscriptControllerBindings
): ConsoleTranscriptController {
    const events: TranscriptEvent[] = [];

    const routeEvent = function(event: TranscriptEvent): void {
        const transcript = bindings.getTranscript();

        if (!transcript) {
            return;
        }

        routeConsoleRuntimeEvent(event, {
            session: bindings.session,
            transcript,
            setPromptState: bindings.setPromptState,
            setRuntimeBusy: bindings.setRuntimeBusy
        });
    };

    const record = function(incoming: TranscriptEvent[]): void {
        incoming.forEach((event) => {
            const eventKey = bindings.session.getTranscriptEventKey(event);

            if (eventKey && bindings.session.hasTranscriptEvent(eventKey)) {
                return;
            }

            bindings.session.rememberTranscriptEvent(eventKey);
            events.push(event);
            routeEvent(event);
        });

        if (events.length > 160) {
            events.splice(0, events.length - 160);
        }

        bindings.renderEvents(events);
    };

    return {
        record,
        clear: function(): void {
            events.length = 0;
        },
        render: function(): void {
            bindings.renderEvents(events);
        }
    };
};
