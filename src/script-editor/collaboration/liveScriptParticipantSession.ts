import {
    applyLiveScriptTextEdits
} from "./liveScriptEdits";
import {
    LIVE_SCRIPT_PROTOCOL,
    LIVE_SCRIPT_PROTOCOL_VERSION,
    type LiveScriptAckFrame,
    type LiveScriptFrame,
    type LiveScriptJoinFrame,
    type LiveScriptOutboundFrame,
    type LiveScriptResyncRequestFrame
} from "./liveScriptProtocol";
import type {
    LiveScriptSessionTicket
} from "./liveScriptTicket";


export interface LiveScriptParticipantState {
    status:
        | "idle"
        | "joining"
        | "reconnecting"
        | "awaiting-snapshot"
        | "active"
        | "ended"
        | "failed";
    revision: number;
    content: string;
    displayName: string;
    resyncPending: boolean;
    errorMessage: string;
}


export interface LiveScriptParticipantSession {
    state(): LiveScriptParticipantState;
    join(): LiveScriptOutboundFrame;
    reconnect(endpointId?: string): LiveScriptOutboundFrame;
    fail(message: string): void;
    receive(frame: LiveScriptFrame, remoteEndpointId: string): LiveScriptOutboundFrame[];
}


export interface LiveScriptParticipantSessionOptions {
    endpointId: string;
    ticket: LiveScriptSessionTicket;
}


export const createLiveScriptParticipantSession = function(
    options: LiveScriptParticipantSessionOptions
): LiveScriptParticipantSession {
    let status: LiveScriptParticipantState["status"] = "idle";
    let revision = 0;
    let content = "";
    let displayName = options.ticket.displayName || "Untitled.R";
    let resyncPending = false;
    let errorMessage = "";
    let nextMessageNumber = 1;
    let lastInstructorMessageNumber = 0;
    let endpointId = options.endpointId;
    const ticket = options.ticket;

    const frameBase = function<Type extends LiveScriptFrame["type"]>(type: Type) {
        return {
            protocol: LIVE_SCRIPT_PROTOCOL,
            version: LIVE_SCRIPT_PROTOCOL_VERSION,
            sessionId: ticket.sessionId,
            type,
            senderEndpointId: endpointId,
            messageNumber: nextMessageNumber++
        };
    };

    const outbound = function(frame: LiveScriptFrame): LiveScriptOutboundFrame {
        return {
            frame,
            recipientEndpointId: ticket.instructorEndpointId
        };
    };

    const acknowledge = function(): LiveScriptOutboundFrame {
        const frame: LiveScriptAckFrame = {
            ...frameBase("ack"),
            payload: { revision }
        };

        return outbound(frame);
    };

    const requestResync = function(
        expectedBaseRevision: number,
        reason: LiveScriptResyncRequestFrame["payload"]["reason"]
    ): LiveScriptOutboundFrame[] {
        if (resyncPending) {
            return [];
        }

        resyncPending = true;
        const frame: LiveScriptResyncRequestFrame = {
            ...frameBase("resync-request"),
            payload: {
                currentRevision: revision,
                expectedBaseRevision,
                reason
            }
        };

        return [outbound(frame)];
    };

    const joinFrame = function(): LiveScriptOutboundFrame {
        const frame: LiveScriptJoinFrame = {
            ...frameBase("join"),
            payload: {
                capability: ticket.capability,
                supportedVersions: [LIVE_SCRIPT_PROTOCOL_VERSION]
            }
        };

        return outbound(frame);
    };

    const join = function(): LiveScriptOutboundFrame {
        status = "joining";
        return joinFrame();
    };

    const reconnect = function(nextEndpointId?: string): LiveScriptOutboundFrame {
        if (nextEndpointId) {
            endpointId = nextEndpointId;
        }
        status = "reconnecting";
        resyncPending = true;
        return joinFrame();
    };

    const receive = function(
        frame: LiveScriptFrame,
        remoteEndpointId: string
    ): LiveScriptOutboundFrame[] {
        if (remoteEndpointId !== ticket.instructorEndpointId
            || frame.senderEndpointId !== remoteEndpointId
            || frame.sessionId !== ticket.sessionId) {
            return [];
        }

        if (frame.messageNumber <= lastInstructorMessageNumber) {
            return [];
        }

        lastInstructorMessageNumber = frame.messageNumber;

        if (status === "ended" || status === "failed") {
            return [];
        }

        if (frame.type === "welcome") {
            displayName = frame.payload.displayName;
            status = "awaiting-snapshot";
            return [];
        }

        if (frame.type === "snapshot") {
            content = frame.payload.content;
            revision = frame.payload.revision;
            resyncPending = false;
            errorMessage = "";
            status = "active";
            return [acknowledge()];
        }

        if (frame.type === "edit") {
            if (status !== "active") {
                return requestResync(frame.payload.baseRevision, "initial-snapshot");
            }

            if (frame.payload.baseRevision !== revision) {
                return requestResync(frame.payload.baseRevision, "missing-revision");
            }

            const result = applyLiveScriptTextEdits(content, frame.payload.edits);

            if (!result.ok) {
                return requestResync(frame.payload.baseRevision, "invalid-edit");
            }

            content = result.content;
            revision = frame.payload.revision;
            return [acknowledge()];
        }

        if (frame.type === "session-ended") {
            status = "ended";
            resyncPending = false;
            return [outbound({
                ...frameBase("participant-state"),
                timestamp: Date.now(),
                payload: {
                    endpointId,
                    state: "left"
                }
            })];
        }

        if (frame.type === "error") {
            status = frame.payload.code === "session-ended" ? "ended" : "failed";
            errorMessage = frame.payload.message;
            resyncPending = false;
            return [];
        }

        if (frame.type === "ping") {
            return [outbound({
                ...frameBase("pong"),
                timestamp: Date.now(),
                payload: { nonce: frame.payload.nonce }
            })];
        }

        return [];
    };

    return {
        state: function(): LiveScriptParticipantState {
            return {
                status,
                revision,
                content,
                displayName,
                resyncPending,
                errorMessage
            };
        },
        join,
        reconnect,
        fail: function(message) {
            status = "failed";
            resyncPending = false;
            errorMessage = String(message || "Live-script connection was lost.");
        },
        receive
    };
};
