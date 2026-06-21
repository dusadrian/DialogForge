import type { TranscriptEvent, VisibleCommandRequest } from "../provider-contract/runtimeProvider";


export interface TranscriptRequest {
    kind: string;
    source: string;
    text: string;
}


export const createVisibleCommandRequest = function(input: Partial<VisibleCommandRequest>): VisibleCommandRequest {
    return {
        kind: "commands.visible",
        text: String(input && input.text ? input.text : ""),
        source: String(input && input.source ? input.source : "base-app"),
        createdAt: new Date().toISOString()
    };
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
