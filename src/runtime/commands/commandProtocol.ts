import type {
    RuntimeCommandExecutionResult,
    TranscriptEvent,
    VisibleCommandRequest
} from "../provider-contract/runtimeProvider";


export interface TranscriptRequest {
    kind: string;
    source: string;
    text: string;
}


export const isTranscriptFailureEvent = function(
    event: Pick<TranscriptEvent, "type" | "state">
): boolean {
    return event.type === "failed"
        || event.type === "rejected"
        || event.type === "error"
        || event.state === "error";
};


export const transcriptHasFailure = function(
    events: readonly TranscriptEvent[]
): boolean {
    return events.some(isTranscriptFailureEvent);
};


export const commandExecutionDidNotSucceed = function(
    result: Pick<RuntimeCommandExecutionResult,
        "executionDisposition" | "evaluationOutcome" | "transcriptEvents">,
    hasTranscriptFailure: (events: TranscriptEvent[]) => boolean = transcriptHasFailure
): boolean {
    if (
        result.executionDisposition === "session_lost"
        || result.executionDisposition === "not_started"
        || result.evaluationOutcome === "error"
        || result.evaluationOutcome === "interrupted"
        || result.transcriptEvents.some(event => event.state === "interrupted")
    ) {
        return true;
    }

    return hasTranscriptFailure(result.transcriptEvents);
};


export const createVisibleCommandRequest = function(input: Partial<VisibleCommandRequest>): VisibleCommandRequest {
    const outputWidth = Number(input && input.outputWidth);
    const request: VisibleCommandRequest = {
        kind: "commands.visible",
        text: String(input && input.text ? input.text : ""),
        source: String(input && input.source ? input.source : "base-app"),
        createdAt: new Date().toISOString()
    };

    if (Number.isFinite(outputWidth) && outputWidth > 0) {
        request.outputWidth = Math.round(outputWidth);
    }

    if (input?.activityId) {
        request.activityId = String(input.activityId);
    }

    return request;
};


export const createTranscriptEvent = function(
    type: string,
    request: TranscriptRequest,
    payload: Partial<TranscriptEvent> = {}
): TranscriptEvent {
    return Object.assign(
        {
            type,
            commandKind: request.kind,
            source: request.source,
            text: request.text,
            createdAt: new Date().toISOString()
        },
        payload
    );
};
