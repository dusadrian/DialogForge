import {
    applyLiveScriptTextEdits
} from "./liveScriptEdits";
import {
    LIVE_SCRIPT_PROTOCOL,
    LIVE_SCRIPT_PROTOCOL_VERSION,
    LIVE_SCRIPT_MAX_JOIN_ATTEMPTS_PER_ENDPOINT,
    LIVE_SCRIPT_MAX_PARTICIPANTS,
    type LiveScriptEditFrame,
    type LiveScriptCursorFrame,
    type LiveScriptErrorFrame,
    type LiveScriptFrame,
    type LiveScriptOutboundFrame,
    type LiveScriptSessionEndedFrame,
    type LiveScriptSnapshotFrame,
    type LiveScriptSpotlightControlFrame,
    type LiveScriptSpotlightEditFrame,
    type LiveScriptSpotlightSnapshotFrame,
    type LiveScriptTextEdit,
    type LiveScriptWelcomeFrame
} from "./liveScriptProtocol";
import {
    sanitizeLiveScriptDisplayName
} from "./liveScriptTicket";
import {
    validateLiveScriptNickname
} from "./liveScriptNickname";


export interface LiveScriptHostParticipantState {
    endpointId: string;
    participantId: string;
    nickname: string;
    acknowledgedRevision: number;
    lastMessageNumber: number;
    connectionState: "joined" | "reconnecting";
    handRaised: boolean;
}


export interface LiveScriptHostSpotlightState {
    endpointId: string;
    displayName: string;
    status: "pending" | "active";
    sourceRevision: number;
}


export interface LiveScriptHostState {
    status: "hosting" | "ended";
    sessionId: string;
    revision: number;
    content: string;
    displayName: string;
    instructorDisplayName: string;
    participants: LiveScriptHostParticipantState[];
    spotlight: LiveScriptHostSpotlightState | null;
}


export interface LiveScriptHostSession {
    state(): LiveScriptHostState;
    receive(frame: LiveScriptFrame, remoteEndpointId: string): LiveScriptOutboundFrame[];
    participantDisconnected(endpointId: string): void;
    removeParticipant(endpointId: string): LiveScriptOutboundFrame[];
    grantSpotlight(endpointId: string): LiveScriptOutboundFrame[];
    dismissHand(endpointId: string): LiveScriptOutboundFrame[];
    endSpotlight(): LiveScriptOutboundFrame[];
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
    expiresAt?: number;
    maxParticipants?: number;
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
    let instructorContent = content;
    let nextMessageNumber = 1;
    const sessionId = options.sessionId;
    const endpointId = options.endpointId;
    const capability = options.capability;
    const instructorDisplayName = sanitizeLiveScriptDisplayName(options.displayName);
    let displayName = instructorDisplayName;
    let spotlight: LiveScriptHostSpotlightState | null = null;
    const participants = new Map<string, LiveScriptHostParticipantState>();
    const failedJoinAttempts = new Map<string, number>();
    const maxParticipants = Math.max(
        1,
        Math.min(options.maxParticipants || LIVE_SCRIPT_MAX_PARTICIPANTS, LIVE_SCRIPT_MAX_PARTICIPANTS)
    );

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

    const welcomeFor = function(recipientEndpointId: string): LiveScriptOutboundFrame {
        const frame: LiveScriptWelcomeFrame = {
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

        return { frame, recipientEndpointId };
    };

    const broadcastPresenter = function(): LiveScriptOutboundFrame[] {
        return Array.from(participants.keys()).flatMap((recipientEndpointId) => [
            welcomeFor(recipientEndpointId),
            snapshotFor(recipientEndpointId)
        ]);
    };

    const spotlightControlFor = function(
        recipientEndpointId: string,
        action: LiveScriptSpotlightControlFrame["payload"]["action"]
    ): LiveScriptOutboundFrame {
        const frame: LiveScriptSpotlightControlFrame = {
            ...frameBase("spotlight-control"),
            payload: { action }
        };

        return { frame, recipientEndpointId };
    };

    const restoreInstructor = function(): LiveScriptOutboundFrame[] {
        const previousSpotlight = spotlight;
        spotlight = null;
        displayName = instructorDisplayName;
        content = instructorContent;
        revision += 1;
        const control = previousSpotlight
            && participants.has(previousSpotlight.endpointId)
            ? spotlightControlFor(previousSpotlight.endpointId, "ended")
            : null;
        const frames = broadcastPresenter();

        if (control) {
            frames.unshift(control);
        }

        return frames;
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

        if (options.expiresAt !== undefined && Date.now() >= options.expiresAt) {
            status = "ended";
            return [errorFor(remoteEndpointId, "session-ended", "Live session has ended.")];
        }

        const existing = participants.get(remoteEndpointId);
        const nicknameResult = validateLiveScriptNickname(frame.payload.nickname);

        if (!nicknameResult.ok) {
            return [errorFor(remoteEndpointId, "invalid-frame", nicknameResult.message)];
        }

        const existingIdentity = Array.from(participants.values()).find(
            (participant) => participant.participantId === frame.payload.participantId
        );

        if (!existing && !existingIdentity && participants.size >= maxParticipants) {
            return [errorFor(
                remoteEndpointId,
                "participant-limit",
                "Live session is not available."
            )];
        }

        if ((failedJoinAttempts.get(remoteEndpointId) || 0)
            >= LIVE_SCRIPT_MAX_JOIN_ATTEMPTS_PER_ENDPOINT) {
            return [errorFor(
                remoteEndpointId,
                "authorization-failed",
                "Live session is not available."
            )];
        }

        if (frame.payload.capability !== capability) {
            const attempts = (failedJoinAttempts.get(remoteEndpointId) || 0) + 1;
            failedJoinAttempts.set(remoteEndpointId, attempts);
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

        if (existing && existing.participantId !== frame.payload.participantId) {
            return [errorFor(
                remoteEndpointId,
                "authorization-failed",
                "Live session is not available."
            )];
        }

        if (existingIdentity) {
            const existingNickname = validateLiveScriptNickname(
                existingIdentity.nickname
            );

            if (!existingNickname.ok || existingNickname.key !== nicknameResult.key) {
                return [errorFor(
                    remoteEndpointId,
                    "authorization-failed",
                    "Live session is not available."
                )];
            }
        }

        const nicknameTaken = Array.from(participants.values()).some((participant) => {
            const current = validateLiveScriptNickname(participant.nickname);

            return participant.participantId !== frame.payload.participantId
                && current.ok
                && current.key === nicknameResult.key;
        });

        if (nicknameTaken) {
            return [errorFor(
                remoteEndpointId,
                "nickname-taken",
                `${nicknameResult.nickname} is already taken in this classroom. Choose another name.`
            )];
        }

        if (existing && frame.messageNumber <= existing.lastMessageNumber) {
            return [];
        }

        failedJoinAttempts.delete(remoteEndpointId);

        if (existingIdentity) {
            const previousEndpointId = existingIdentity.endpointId;
            participants.delete(previousEndpointId);
            existingIdentity.endpointId = remoteEndpointId;
            existingIdentity.lastMessageNumber = frame.messageNumber;
            existingIdentity.connectionState = "joined";
            participants.set(remoteEndpointId, existingIdentity);

            if (spotlight?.endpointId === previousEndpointId) {
                spotlight.endpointId = remoteEndpointId;
            }
        }
        else {
            participants.set(remoteEndpointId, {
                endpointId: remoteEndpointId,
                participantId: frame.payload.participantId,
                nickname: nicknameResult.nickname,
                acknowledgedRevision: 0,
                lastMessageNumber: frame.messageNumber,
                connectionState: "joined",
                handRaised: false
            });
        }

        return [
            welcomeFor(remoteEndpointId),
            snapshotFor(remoteEndpointId)
        ];
    };

    const receiveSpotlightSnapshot = function(
        frame: LiveScriptSpotlightSnapshotFrame,
        remoteEndpointId: string
    ): LiveScriptOutboundFrame[] {
        if (!spotlight || spotlight.endpointId !== remoteEndpointId) {
            return [errorFor(
                remoteEndpointId,
                "authorization-failed",
                "Participant is not allowed to publish live document state."
            )];
        }

        spotlight.status = "active";
        spotlight.sourceRevision = frame.payload.revision;
        const participant = participants.get(remoteEndpointId);
        spotlight.displayName = participant?.nickname
            || sanitizeLiveScriptDisplayName(frame.payload.displayName);
        displayName = spotlight.displayName;
        content = frame.payload.content;
        revision += 1;
        return broadcastPresenter();
    };

    const receiveSpotlightEdit = function(
        frame: LiveScriptSpotlightEditFrame,
        remoteEndpointId: string
    ): LiveScriptOutboundFrame[] {
        if (!spotlight
            || spotlight.status !== "active"
            || spotlight.endpointId !== remoteEndpointId
            || frame.payload.baseRevision !== spotlight.sourceRevision) {
            return [errorFor(
                remoteEndpointId,
                "invalid-frame",
                "Spotlight edit is not based on the active student revision."
            )];
        }

        const result = applyLiveScriptTextEdits(content, frame.payload.edits);

        if (!result.ok) {
            return [errorFor(remoteEndpointId, "invalid-frame", result.message)];
        }

        const baseRevision = revision;
        revision += 1;
        spotlight.sourceRevision = frame.payload.revision;
        content = result.content;
        const outboundFrame: LiveScriptEditFrame = {
            ...frameBase("edit"),
            payload: {
                baseRevision,
                revision,
                edits: frame.payload.edits
            }
        };

        return Array.from(participants.keys()).map((recipientEndpointId) => ({
            frame: outboundFrame,
            recipientEndpointId
        }));
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
            else if (frame.payload.state === "reconnecting") {
                participant.connectionState = "reconnecting";
            }
            else {
                participant.connectionState = "joined";
            }

            return [];
        }

        if (frame.type === "hand-raise") {
            participant.handRaised = true;
            return [];
        }

        if (frame.type === "hand-lower") {
            participant.handRaised = false;

            if (spotlight?.endpointId === remoteEndpointId) {
                return restoreInstructor();
            }

            return [];
        }

        if (frame.type === "spotlight-snapshot") {
            return receiveSpotlightSnapshot(frame, remoteEndpointId);
        }

        if (frame.type === "spotlight-edit") {
            return receiveSpotlightEdit(frame, remoteEndpointId);
        }

        if (frame.type === "spotlight-cursor") {
            if (!spotlight
                || spotlight.status !== "active"
                || spotlight.endpointId !== remoteEndpointId) {
                return [errorFor(
                    remoteEndpointId,
                    "authorization-failed",
                    "Participant is not allowed to publish live document state."
                )];
            }

            const cursorFrame: LiveScriptCursorFrame = {
                ...frameBase("cursor"),
                timestamp: frame.timestamp,
                payload: frame.payload
            };

            return Array.from(participants.keys()).map((recipientEndpointId) => ({
                frame: cursorFrame,
                recipientEndpointId
            }));
        }

        if (frame.type === "spotlight-ended") {
            if (spotlight?.endpointId === remoteEndpointId) {
                return restoreInstructor();
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

        const result = applyLiveScriptTextEdits(instructorContent, edits);

        if (!result.ok) {
            throw new Error(result.message);
        }

        instructorContent = result.content;

        if (spotlight) {
            return [];
        }

        const baseRevision = revision;
        revision += 1;
        content = instructorContent;

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

        instructorContent = String(nextContent || "");

        if (spotlight) {
            return [];
        }

        revision += 1;
        content = instructorContent;
        return Array.from(participants.keys()).map(snapshotFor);
    };

    const publishCursor = function(
        position: LiveScriptCursorFrame["payload"]["position"],
        selection?: LiveScriptCursorFrame["payload"]["selection"]
    ): LiveScriptOutboundFrame[] {
        if (status === "ended" || spotlight) {
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

    const grantSpotlight = function(
        participantEndpointId: string
    ): LiveScriptOutboundFrame[] {
        const participant = participants.get(participantEndpointId);

        if (!participant?.handRaised) {
            throw new Error("The selected participant no longer has a raised hand.");
        }

        if (spotlight) {
            throw new Error("Another participant already has the spotlight.");
        }

        spotlight = {
            endpointId: participantEndpointId,
            displayName: participant.nickname,
            status: "pending",
            sourceRevision: 0
        };
        participant.handRaised = false;
        return [spotlightControlFor(participantEndpointId, "granted")];
    };

    const dismissHand = function(
        participantEndpointId: string
    ): LiveScriptOutboundFrame[] {
        const participant = participants.get(participantEndpointId);

        if (!participant) {
            return [];
        }

        participant.handRaised = false;

        if (spotlight?.endpointId === participantEndpointId) {
            return restoreInstructor();
        }

        return [spotlightControlFor(participantEndpointId, "dismissed")];
    };

    const endSpotlight = function(): LiveScriptOutboundFrame[] {
        return spotlight ? restoreInstructor() : [];
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
                instructorDisplayName,
                participants: Array.from(participants.values()).map(copyParticipant),
                spotlight: spotlight ? { ...spotlight } : null
            };
        },
        receive,
        participantDisconnected: function(participantEndpointId) {
            const participant = participants.get(participantEndpointId);

            if (participant) {
                participant.connectionState = "reconnecting";
            }
        },
        removeParticipant: function(participantEndpointId) {
            participants.delete(participantEndpointId);

            if (spotlight?.endpointId === participantEndpointId) {
                return restoreInstructor();
            }

            return [];
        },
        grantSpotlight,
        dismissHand,
        endSpotlight,
        publishEdits,
        publishCursor,
        replaceContent,
        end
    };
};
