import {
    applyLiveScriptTextEdits
} from "./liveScriptEdits";
import {
    LIVE_SCRIPT_PROTOCOL,
    LIVE_SCRIPT_PROTOCOL_VERSION,
    type LiveScriptAckFrame,
    type LiveScriptFrame,
    type LiveScriptHandLowerFrame,
    type LiveScriptHandRaiseFrame,
    type LiveScriptJoinFrame,
    type LiveScriptOutboundFrame,
    type LiveScriptResyncRequestFrame,
    type LiveScriptSpotlightCursorFrame,
    type LiveScriptSpotlightEditFrame,
    type LiveScriptSpotlightEndedFrame,
    type LiveScriptSpotlightSnapshotFrame,
    type LiveScriptTextEdit
} from "./liveScriptProtocol";
import type {
    LiveScriptSessionTicket
} from "./liveScriptTicket";
import {
    validateLiveScriptNickname
} from "./liveScriptNickname";


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
    handState: "idle" | "raised" | "spotlight";
    offeredDisplayName: string;
    nickname: string;
}


export interface LiveScriptParticipantSession {
    state(): LiveScriptParticipantState;
    join(): LiveScriptOutboundFrame;
    reconnect(endpointId?: string): LiveScriptOutboundFrame;
    raiseHand(displayName: string): LiveScriptOutboundFrame;
    lowerHand(): LiveScriptOutboundFrame;
    publishSpotlightSnapshot(
        displayName: string,
        content: string
    ): LiveScriptOutboundFrame;
    publishSpotlightEdits(edits: LiveScriptTextEdit[]): LiveScriptOutboundFrame;
    publishSpotlightCursor(
        position: LiveScriptSpotlightCursorFrame["payload"]["position"],
        selection?: LiveScriptSpotlightCursorFrame["payload"]["selection"]
    ): LiveScriptOutboundFrame;
    endSpotlight(): LiveScriptOutboundFrame;
    fail(message: string): void;
    receive(frame: LiveScriptFrame, remoteEndpointId: string): LiveScriptOutboundFrame[];
}


export interface LiveScriptParticipantSessionOptions {
    endpointId: string;
    ticket: LiveScriptSessionTicket;
    participantId?: string;
    nickname?: string;
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
    let handState: LiveScriptParticipantState["handState"] = "idle";
    let offeredDisplayName = "";
    let spotlightRevision = 0;
    let nextMessageNumber = 1;
    let lastInstructorMessageNumber = 0;
    let endpointId = options.endpointId;
    const ticket = options.ticket;
    const participantId = options.participantId || options.endpointId;
    const nicknameResult = validateLiveScriptNickname(
        options.nickname || `Student-${participantId.slice(-6)}`
    );

    if (!nicknameResult.ok) {
        throw new Error(nicknameResult.message);
    }

    const nickname = nicknameResult.nickname;

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
                supportedVersions: [LIVE_SCRIPT_PROTOCOL_VERSION],
                participantId,
                nickname
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

    const raiseHand = function(nextDisplayName: string): LiveScriptOutboundFrame {
        const frame: LiveScriptHandRaiseFrame = {
            ...frameBase("hand-raise"),
            payload: {}
        };

        handState = "raised";
        offeredDisplayName = nextDisplayName;
        return outbound(frame);
    };

    const lowerHand = function(): LiveScriptOutboundFrame {
        const frame: LiveScriptHandLowerFrame = {
            ...frameBase("hand-lower"),
            payload: {}
        };

        handState = "idle";
        offeredDisplayName = "";
        return outbound(frame);
    };

    const publishSpotlightSnapshot = function(
        spotlightDisplayName: string,
        spotlightContent: string
    ): LiveScriptOutboundFrame {
        spotlightRevision = 0;
        const frame: LiveScriptSpotlightSnapshotFrame = {
            ...frameBase("spotlight-snapshot"),
            payload: {
                revision: spotlightRevision,
                displayName: spotlightDisplayName,
                content: spotlightContent
            }
        };

        return outbound(frame);
    };

    const publishSpotlightEdits = function(
        edits: LiveScriptTextEdit[]
    ): LiveScriptOutboundFrame {
        const baseRevision = spotlightRevision;
        spotlightRevision += 1;
        const frame: LiveScriptSpotlightEditFrame = {
            ...frameBase("spotlight-edit"),
            payload: {
                baseRevision,
                revision: spotlightRevision,
                edits
            }
        };

        return outbound(frame);
    };

    const publishSpotlightCursor = function(
        position: LiveScriptSpotlightCursorFrame["payload"]["position"],
        selection?: LiveScriptSpotlightCursorFrame["payload"]["selection"]
    ): LiveScriptOutboundFrame {
        const frame: LiveScriptSpotlightCursorFrame = {
            ...frameBase("spotlight-cursor"),
            timestamp: Date.now(),
            payload: {
                position,
                ...(selection ? { selection } : {})
            }
        };

        return outbound(frame);
    };

    const endSpotlight = function(): LiveScriptOutboundFrame {
        const frame: LiveScriptSpotlightEndedFrame = {
            ...frameBase("spotlight-ended"),
            payload: {}
        };

        handState = "idle";
        offeredDisplayName = "";
        return outbound(frame);
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

        if (frame.type === "spotlight-control") {
            handState = frame.payload.action === "granted"
                ? "spotlight"
                : "idle";

            if (handState === "idle") {
                offeredDisplayName = "";
            }

            return [];
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
            handState = "idle";
            offeredDisplayName = "";
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
                errorMessage,
                handState,
                offeredDisplayName,
                nickname
            };
        },
        join,
        reconnect,
        raiseHand,
        lowerHand,
        publishSpotlightSnapshot,
        publishSpotlightEdits,
        publishSpotlightCursor,
        endSpotlight,
        fail: function(message) {
            status = "failed";
            resyncPending = false;
            errorMessage = String(message || "Live-script connection was lost.");
            handState = "idle";
            offeredDisplayName = "";
        },
        receive
    };
};
