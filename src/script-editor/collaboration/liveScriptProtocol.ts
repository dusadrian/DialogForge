export const LIVE_SCRIPT_PROTOCOL = "dialogforge/live-script" as const;
export const LIVE_SCRIPT_PROTOCOL_VERSION = 2 as const;
export const LIVE_SCRIPT_MAX_FRAME_BYTES = 1024 * 1024;
export const LIVE_SCRIPT_MAX_SNAPSHOT_BYTES = 768 * 1024;
export const LIVE_SCRIPT_MAX_EDIT_TEXT_BYTES = 256 * 1024;
export const LIVE_SCRIPT_MAX_EDITS_PER_FRAME = 256;
export const LIVE_SCRIPT_MAX_PARTICIPANTS = 100;
export const LIVE_SCRIPT_MAX_JOIN_ATTEMPTS_PER_ENDPOINT = 8;
export const LIVE_SCRIPT_MAX_PENDING_OUTBOUND_BYTES = 4 * 1024 * 1024;
export const LIVE_SCRIPT_DEFAULT_SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
export const LIVE_SCRIPT_MAX_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;


export type LiveScriptMessageType =
    | "join"
    | "welcome"
    | "snapshot"
    | "edit"
    | "ack"
    | "resync-request"
    | "cursor"
    | "participant-state"
    | "hand-raise"
    | "hand-lower"
    | "spotlight-control"
    | "spotlight-snapshot"
    | "spotlight-edit"
    | "spotlight-cursor"
    | "spotlight-ended"
    | "session-ended"
    | "error"
    | "ping"
    | "pong";


export interface LiveScriptFrameBase<Type extends LiveScriptMessageType> {
    protocol: typeof LIVE_SCRIPT_PROTOCOL;
    version: typeof LIVE_SCRIPT_PROTOCOL_VERSION;
    sessionId: string;
    type: Type;
    senderEndpointId: string;
    messageNumber: number;
}


export interface LiveScriptJoinFrame extends LiveScriptFrameBase<"join"> {
    payload: {
        capability: string;
        supportedVersions: number[];
        participantId: string;
        nickname: string;
    };
}


export interface LiveScriptWelcomeFrame extends LiveScriptFrameBase<"welcome"> {
    payload: {
        revision: number;
        displayName: string;
        permissions: {
            canEdit: false;
            canExecuteLocally: true;
        };
    };
}


export interface LiveScriptSnapshotFrame extends LiveScriptFrameBase<"snapshot"> {
    payload: {
        revision: number;
        content: string;
    };
}


export interface LiveScriptEditRange {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
}


export interface LiveScriptTextEdit {
    range: LiveScriptEditRange;
    rangeOffset: number;
    rangeLength: number;
    text: string;
}


export interface LiveScriptEditFrame extends LiveScriptFrameBase<"edit"> {
    payload: {
        baseRevision: number;
        revision: number;
        edits: LiveScriptTextEdit[];
    };
}


export interface LiveScriptAckFrame extends LiveScriptFrameBase<"ack"> {
    payload: {
        revision: number;
    };
}


export interface LiveScriptResyncRequestFrame extends LiveScriptFrameBase<"resync-request"> {
    payload: {
        currentRevision: number;
        expectedBaseRevision: number;
        reason: "missing-revision" | "invalid-edit" | "initial-snapshot";
    };
}


export interface LiveScriptCursorFrame extends LiveScriptFrameBase<"cursor"> {
    timestamp: number;
    payload: {
        position: {
            lineNumber: number;
            column: number;
        };
        selection?: LiveScriptEditRange;
    };
}


export interface LiveScriptParticipantStateFrame extends LiveScriptFrameBase<"participant-state"> {
    timestamp: number;
    payload: {
        endpointId: string;
        state: "joined" | "left" | "healthy" | "reconnecting";
    };
}


export interface LiveScriptHandRaiseFrame extends LiveScriptFrameBase<"hand-raise"> {
    payload: Record<string, never>;
}


export interface LiveScriptHandLowerFrame extends LiveScriptFrameBase<"hand-lower"> {
    payload: Record<string, never>;
}


export interface LiveScriptSpotlightControlFrame extends LiveScriptFrameBase<"spotlight-control"> {
    payload: {
        action: "granted" | "dismissed" | "ended";
    };
}


export interface LiveScriptSpotlightSnapshotFrame extends LiveScriptFrameBase<"spotlight-snapshot"> {
    payload: {
        revision: number;
        displayName: string;
        content: string;
    };
}


export interface LiveScriptSpotlightEditFrame extends LiveScriptFrameBase<"spotlight-edit"> {
    payload: {
        baseRevision: number;
        revision: number;
        edits: LiveScriptTextEdit[];
    };
}


export interface LiveScriptSpotlightCursorFrame extends LiveScriptFrameBase<"spotlight-cursor"> {
    timestamp: number;
    payload: LiveScriptCursorFrame["payload"];
}


export interface LiveScriptSpotlightEndedFrame extends LiveScriptFrameBase<"spotlight-ended"> {
    payload: Record<string, never>;
}


export interface LiveScriptSessionEndedFrame extends LiveScriptFrameBase<"session-ended"> {
    payload: {
        reason: "stopped" | "expired" | "instructor-closed";
    };
}


export interface LiveScriptErrorFrame extends LiveScriptFrameBase<"error"> {
    payload: {
        code:
            | "authorization-failed"
            | "incompatible-version"
            | "invalid-frame"
            | "nickname-taken"
            | "session-ended"
            | "participant-limit";
        message: string;
    };
}


export interface LiveScriptPingFrame extends LiveScriptFrameBase<"ping"> {
    timestamp: number;
    payload: {
        nonce: string;
    };
}


export interface LiveScriptPongFrame extends LiveScriptFrameBase<"pong"> {
    timestamp: number;
    payload: {
        nonce: string;
    };
}


export type LiveScriptFrame =
    | LiveScriptJoinFrame
    | LiveScriptWelcomeFrame
    | LiveScriptSnapshotFrame
    | LiveScriptEditFrame
    | LiveScriptAckFrame
    | LiveScriptResyncRequestFrame
    | LiveScriptCursorFrame
    | LiveScriptParticipantStateFrame
    | LiveScriptHandRaiseFrame
    | LiveScriptHandLowerFrame
    | LiveScriptSpotlightControlFrame
    | LiveScriptSpotlightSnapshotFrame
    | LiveScriptSpotlightEditFrame
    | LiveScriptSpotlightCursorFrame
    | LiveScriptSpotlightEndedFrame
    | LiveScriptSessionEndedFrame
    | LiveScriptErrorFrame
    | LiveScriptPingFrame
    | LiveScriptPongFrame;


export interface LiveScriptOutboundFrame {
    frame: LiveScriptFrame;
    recipientEndpointId: string;
}
