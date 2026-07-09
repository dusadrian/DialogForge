import type { TranscriptEvent, VisibleCommandRequest } from "../provider-contract/runtimeProvider";


export interface TranscriptRequest {
    kind: string;
    source: string;
    text: string;
}


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
