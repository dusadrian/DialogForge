import {
    applyLiveScriptTextEdits
} from "./liveScriptEdits";
import {
    LIVE_SCRIPT_PROTOCOL,
    LIVE_SCRIPT_PROTOCOL_VERSION,
    type LiveScriptEditFrame,
    type LiveScriptCursorFrame,
    type LiveScriptErrorFrame,
    type LiveScriptFrame,
    type LiveScriptOutboundFrame,
    type LiveScriptSessionEndedFrame,
    type LiveScriptSnapshotFrame,
    type LiveScriptTextEdit,
    type LiveScriptWelcomeFrame
} from "./liveScriptProtocol";
import {
    sanitizeLiveScriptDisplayName
} from "./liveScriptTicket";


export interface LiveScriptHostParticipantState {
    endpointId: string;
    acknowledgedRevision: number;
    lastMessageNumber: number;
}


export interface LiveScriptHostState {
    status: "hosting" | "ended";
    sessionId: string;
    revision: number;
    content: string;
    displayName: string;
    participants: LiveScriptHostParticipantState[];
}


export interface LiveScriptHostSession {
    state(): LiveScriptHostState;
    receive(frame: LiveScriptFrame, remoteEndpointId: string): LiveScriptOutboundFrame[];
    publishEdits(edits: LiveScriptTextEdit[]): LiveScriptOutboundFrame[];
    publishCursor(
        position: LiveScriptCursorFrame["payload"]["position"],
        selection?: LiveScriptCursorFrame["payload"]["selection"]
    ): LiveScriptOutboundFrame[];
    replaceContent(content: string): LiveScriptOutboundFrame[];
    end(reason?: LiveScriptSessionEndedFrame["payload"]["reason"]): LiveScriptOutboundFrame[];
}


export interface LiveScriptHostSessionOptions {
    sessionId: string;
    capability: string;
    endpointId: string;
    displayName: string;
    content: string;
}


const copyParticipant = function(
    participant: LiveScriptHostParticipantState
): LiveScriptHostParticipantState {
    return { ...participant };
};


export const createLiveScriptHostSession = function(
    options: LiveScriptHostSessionOptions
): LiveScriptHostSession {
    let status: LiveScriptHostState["status"] = "hosting";
    let revision = 0;
    let content = String(options.content || "");
    let nextMessageNumber = 1;
    const sessionId = options.sessionId;
    const endpointId = options.endpointId;
    const capability = options.capability;
    const displayName = sanitizeLiveScriptDisplayName(options.displayName);
    const participants = new Map<string, LiveScriptHostParticipantState>();

    const frameBase = function<Type extends LiveScriptFrame["type"]>(type: Type) {
        return {
            protocol: LIVE_SCRIPT_PROTOCOL,
            version: LIVE_SCRIPT_PROTOCOL_VERSION,
            sessionId,
            type,
            senderEndpointId: endpointId,
            messageNumber: nextMessageNumber++
        };
    };

    const snapshotFor = function(recipientEndpointId: string): LiveScriptOutboundFrame {
        const frame: LiveScriptSnapshotFrame = {
            ...frameBase("snapshot"),
            payload: { revision, content }
        };

        return { frame, recipientEndpointId };
    };

    const errorFor = function(
        recipientEndpointId: string,
        code: LiveScriptErrorFrame["payload"]["code"],
        message: string
    ): LiveScriptOutboundFrame {
        const frame: LiveScriptErrorFrame = {
            ...frameBase("error"),
            payload: { code, message }
        };

        return { frame, recipientEndpointId };
    };

    const receiveJoin = function(
        frame: Extract<LiveScriptFrame, { type: "join" }>,
        remoteEndpointId: string
    ): LiveScriptOutboundFrame[] {
        if (status === "ended") {
            return [errorFor(remoteEndpointId, "session-ended", "Live session has ended.")];
        }

        if (frame.payload.capability !== capability) {
            return [errorFor(
                remoteEndpointId,
                "authorization-failed",
                "Live session is not available."
            )];
        }

        if (!frame.payload.supportedVersions.includes(LIVE_SCRIPT_PROTOCOL_VERSION)) {
            return [errorFor(
                remoteEndpointId,
                "incompatible-version",
                "Live-script protocol version is not supported."
            )];
        }

        const existing = participants.get(remoteEndpointId);

        if (existing && frame.messageNumber <= existing.lastMessageNumber) {
            return [];
        }

        participants.set(remoteEndpointId, {
            endpointId: remoteEndpointId,
            acknowledgedRevision: 0,
            lastMessageNumber: frame.messageNumber
        });

        const welcome: LiveScriptWelcomeFrame = {
            ...frameBase("welcome"),
            payload: {
                revision,
                displayName,
                permissions: {
                    canEdit: false,
                    canExecuteLocally: true
                }
            }
        };

        return [
            { frame: welcome, recipientEndpointId: remoteEndpointId },
            snapshotFor(remoteEndpointId)
        ];
    };

    const receive = function(
        frame: LiveScriptFrame,
        remoteEndpointId: string
    ): LiveScriptOutboundFrame[] {
        if (frame.sessionId !== sessionId
            || frame.senderEndpointId !== remoteEndpointId) {
            return [errorFor(
                remoteEndpointId,
                "authorization-failed",
                "Live session is not available."
            )];
        }

        if (frame.type === "join") {
            return receiveJoin(frame, remoteEndpointId);
        }

        const participant = participants.get(remoteEndpointId);

        if (!participant) {
            return [errorFor(
                remoteEndpointId,
                "authorization-failed",
                "Live session is not available."
            )];
        }

        if (frame.messageNumber <= participant.lastMessageNumber) {
            return [];
        }

        participant.lastMessageNumber = frame.messageNumber;

        if (frame.type === "ack") {
            if (frame.payload.revision <= revision) {
                participant.acknowledgedRevision = Math.max(
                    participant.acknowledgedRevision,
                    frame.payload.revision
                );
            }
            return [];
        }

        if (frame.type === "participant-state") {
            if (frame.payload.endpointId !== remoteEndpointId) {
                return [errorFor(
                    remoteEndpointId,
                    "authorization-failed",
                    "Live session is not available."
                )];
            }

            if (frame.payload.state === "left") {
                participants.delete(remoteEndpointId);
            }

            return [];
        }

        if (frame.type === "resync-request") {
            return [snapshotFor(remoteEndpointId)];
        }

        if (frame.type === "ping") {
            return [{
                recipientEndpointId: remoteEndpointId,
                frame: {
                    ...frameBase("pong"),
                    timestamp: Date.now(),
                    payload: { nonce: frame.payload.nonce }
                }
            }];
        }

        if (frame.type === "pong") {
            return [];
        }

        return [errorFor(
            remoteEndpointId,
            "authorization-failed",
            "Participant is not allowed to publish live document state."
        )];
    };

    const publishEdits = function(
        edits: LiveScriptTextEdit[]
    ): LiveScriptOutboundFrame[] {
        if (status === "ended") {
            throw new Error("Cannot edit an ended live-script session.");
        }

        const result = applyLiveScriptTextEdits(content, edits);

        if (!result.ok) {
            throw new Error(result.message);
        }

        const baseRevision = revision;
        revision += 1;
        content = result.content;

        const frame: LiveScriptEditFrame = {
            ...frameBase("edit"),
            payload: {
                baseRevision,
                revision,
                edits
            }
        };

        return Array.from(participants.keys()).map((recipientEndpointId) => {
            return { frame, recipientEndpointId };
        });
    };

    const replaceContent = function(nextContent: string): LiveScriptOutboundFrame[] {
        if (status === "ended") {
            throw new Error("Cannot replace content in an ended live-script session.");
        }

        revision += 1;
        content = String(nextContent || "");
        return Array.from(participants.keys()).map(snapshotFor);
    };

    const publishCursor = function(
        position: LiveScriptCursorFrame["payload"]["position"],
        selection?: LiveScriptCursorFrame["payload"]["selection"]
    ): LiveScriptOutboundFrame[] {
        if (status === "ended") {
            return [];
        }

        const frame: LiveScriptCursorFrame = {
            ...frameBase("cursor"),
            timestamp: Date.now(),
            payload: {
                position,
                ...(selection ? { selection } : {})
            }
        };

        return Array.from(participants.keys()).map((recipientEndpointId) => ({
            frame,
            recipientEndpointId
        }));
    };

    const end = function(
        reason: LiveScriptSessionEndedFrame["payload"]["reason"] = "stopped"
    ): LiveScriptOutboundFrame[] {
        if (status === "ended") {
            return [];
        }

        status = "ended";
        const frame: LiveScriptSessionEndedFrame = {
            ...frameBase("session-ended"),
            payload: { reason }
        };

        return Array.from(participants.keys()).map((recipientEndpointId) => {
            return { frame, recipientEndpointId };
        });
    };

    return {
        state: function(): LiveScriptHostState {
            return {
                status,
                sessionId,
                revision,
                content,
                displayName,
                participants: Array.from(participants.values()).map(copyParticipant)
            };
        },
        receive,
        publishEdits,
        publishCursor,
        replaceContent,
        end
    };
};
