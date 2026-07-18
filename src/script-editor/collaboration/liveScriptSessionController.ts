import {
    createLiveScriptHostSession,
    type LiveScriptHostSession,
    type LiveScriptHostState
} from "./liveScriptHostSession";
import {
    createLiveScriptParticipantSession,
    type LiveScriptParticipantSession,
    type LiveScriptParticipantState
} from "./liveScriptParticipantSession";
import type {
    LiveScriptFrame,
    LiveScriptCursorFrame,
    LiveScriptOutboundFrame,
    LiveScriptSessionEndedFrame,
    LiveScriptTextEdit
} from "./liveScriptProtocol";
import {
    LIVE_SCRIPT_TICKET_FORMAT_VERSION,
    sanitizeLiveScriptDisplayName,
    type LiveScriptSessionTicket
} from "./liveScriptTicket";
import type {
    LiveScriptRendererBridge
} from "./liveScriptIpc";
import type {
    LiveScriptTransportStateEvent
} from "./liveScriptTransport";


export interface LiveScriptHostedSessionInput {
    sessionId: string;
    capability: string;
    displayName: string;
    content: string;
    expiresAt?: number;
}


export interface LiveScriptHostedSessionResult {
    ticket: LiveScriptSessionTicket;
    state: LiveScriptHostState;
}


export interface LiveScriptSessionControllerOptions {
    transport: LiveScriptRendererBridge;
    participantFrameApplied(
        sessionId: string,
        frame: LiveScriptFrame,
        state: LiveScriptParticipantState
    ): void;
    participantStateChanged(
        sessionId: string,
        state: LiveScriptParticipantState
    ): void;
    hostStateChanged(
        sessionId: string,
        state: LiveScriptHostState
    ): void;
    transportStateChanged(event: LiveScriptTransportStateEvent): void;
}


export interface LiveScriptSessionController {
    host(input: LiveScriptHostedSessionInput): Promise<LiveScriptHostedSessionResult>;
    join(ticket: LiveScriptSessionTicket): Promise<LiveScriptParticipantState>;
    publishHostEdits(sessionId: string, edits: LiveScriptTextEdit[]): Promise<void>;
    publishHostCursor(
        sessionId: string,
        position: LiveScriptCursorFrame["payload"]["position"],
        selection?: LiveScriptCursorFrame["payload"]["selection"]
    ): Promise<void>;
    replaceHostContent(sessionId: string, content: string): Promise<void>;
    endHost(
        sessionId: string,
        reason?: LiveScriptSessionEndedFrame["payload"]["reason"]
    ): Promise<void>;
    closeParticipant(sessionId: string): Promise<void>;
    getHostState(sessionId: string): LiveScriptHostState | null;
    getParticipantState(sessionId: string): LiveScriptParticipantState | null;
}


export const createLiveScriptSessionController = function(
    options: LiveScriptSessionControllerOptions
): LiveScriptSessionController {
    const hosts = new Map<string, LiveScriptHostSession>();
    const participants = new Map<string, LiveScriptParticipantSession>();
    let outboundQueue = Promise.resolve();

    const sendOutboundNow = async function(
        frames: LiveScriptOutboundFrame[]
    ): Promise<void> {
        for (const outbound of frames) {
            const result = await options.transport.send(
                outbound.frame,
                outbound.recipientEndpointId
            );

            if (!result.ok) {
                throw new Error(result.message);
            }
        }
    };

    const sendOutbound = function(
        frames: LiveScriptOutboundFrame[]
    ): Promise<void> {
        const pending = outboundQueue.catch(() => {}).then(() => {
            return sendOutboundNow(frames);
        });
        outboundQueue = pending;
        return pending;
    };

    const routeFrame = async function(
        frame: LiveScriptFrame,
        remoteEndpointId: string
    ): Promise<void> {
        const host = hosts.get(frame.sessionId);

        if (host) {
            await sendOutbound(host.receive(frame, remoteEndpointId));
            options.hostStateChanged(frame.sessionId, host.state());
            return;
        }

        const participant = participants.get(frame.sessionId);

        if (!participant) {
            return;
        }

        const responses = participant.receive(frame, remoteEndpointId);
        const state = participant.state();
        options.participantFrameApplied(frame.sessionId, frame, state);
        await sendOutbound(responses);
        options.participantStateChanged(frame.sessionId, participant.state());
    };

    options.transport.onFrame((event) => {
        void routeFrame(event.frame, event.remoteEndpointId).catch(() => {});
    });
    options.transport.onState(options.transportStateChanged);

    const host = async function(
        input: LiveScriptHostedSessionInput
    ): Promise<LiveScriptHostedSessionResult> {
        if (hosts.has(input.sessionId) || participants.has(input.sessionId)) {
            throw new Error("Live-script session is already active.");
        }

        const capability = await options.transport.capability();

        if (!capability.available || !capability.endpointId) {
            throw new Error(capability.message || "Live-script sharing is unavailable.");
        }

        const operation = await options.transport.host(input.sessionId);

        if (!operation.ok || !operation.transportAddress) {
            throw new Error(operation.message);
        }

        const displayName = sanitizeLiveScriptDisplayName(input.displayName);
        const session = createLiveScriptHostSession({
            sessionId: input.sessionId,
            capability: input.capability,
            endpointId: capability.endpointId,
            displayName,
            content: input.content
        });

        hosts.set(input.sessionId, session);
        const ticket: LiveScriptSessionTicket = {
            formatVersion: LIVE_SCRIPT_TICKET_FORMAT_VERSION,
            instructorEndpointId: capability.endpointId,
            transportAddress: operation.transportAddress,
            sessionId: input.sessionId,
            capability: input.capability,
            protocolVersions: { minimum: 1, maximum: 1 },
            displayName,
            ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt })
        };

        options.hostStateChanged(input.sessionId, session.state());
        return { ticket, state: session.state() };
    };

    const join = async function(
        ticket: LiveScriptSessionTicket
    ): Promise<LiveScriptParticipantState> {
        if (hosts.has(ticket.sessionId) || participants.has(ticket.sessionId)) {
            throw new Error("Live-script session is already active.");
        }

        const capability = await options.transport.capability();

        if (!capability.available || !capability.endpointId) {
            throw new Error(capability.message || "Live-script sharing is unavailable.");
        }

        const session = createLiveScriptParticipantSession({
            endpointId: capability.endpointId,
            ticket
        });

        participants.set(ticket.sessionId, session);
        const operation = await options.transport.join(ticket);

        if (!operation.ok) {
            participants.delete(ticket.sessionId);
            throw new Error(operation.message);
        }

        await sendOutbound([session.join()]);
        options.participantStateChanged(ticket.sessionId, session.state());
        return session.state();
    };

    const requireHost = function(sessionId: string): LiveScriptHostSession {
        const session = hosts.get(sessionId);

        if (!session) {
            throw new Error("Live-script host session is not active.");
        }

        return session;
    };

    const publishHostEdits = async function(
        sessionId: string,
        edits: LiveScriptTextEdit[]
    ): Promise<void> {
        const session = requireHost(sessionId);
        await sendOutbound(session.publishEdits(edits));
        options.hostStateChanged(sessionId, session.state());
    };

    const replaceHostContent = async function(
        sessionId: string,
        content: string
    ): Promise<void> {
        const session = requireHost(sessionId);
        await sendOutbound(session.replaceContent(content));
        options.hostStateChanged(sessionId, session.state());
    };

    const publishHostCursor = async function(
        sessionId: string,
        position: LiveScriptCursorFrame["payload"]["position"],
        selection?: LiveScriptCursorFrame["payload"]["selection"]
    ): Promise<void> {
        await sendOutbound(requireHost(sessionId).publishCursor(position, selection));
    };

    const endHost = async function(
        sessionId: string,
        reason: LiveScriptSessionEndedFrame["payload"]["reason"] = "stopped"
    ): Promise<void> {
        const session = requireHost(sessionId);
        const frames = session.end(reason);

        try {
            await sendOutbound(frames);

            const acknowledgementDeadline = Date.now() + 750;

            while (session.state().participants.length > 0
                && Date.now() < acknowledgementDeadline) {
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        }
        catch {
            // Ending remains authoritative even if a participant already left.
        }

        options.hostStateChanged(sessionId, session.state());
        hosts.delete(sessionId);
        await options.transport.close(sessionId);
    };

    const closeParticipant = async function(sessionId: string): Promise<void> {
        participants.delete(sessionId);
        await options.transport.close(sessionId);
    };

    return {
        host,
        join,
        publishHostEdits,
        publishHostCursor,
        replaceHostContent,
        endHost,
        closeParticipant,
        getHostState: function(sessionId) {
            return hosts.get(sessionId)?.state() || null;
        },
        getParticipantState: function(sessionId) {
            return participants.get(sessionId)?.state() || null;
        }
    };
};
