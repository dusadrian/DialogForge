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
    LIVE_SCRIPT_DEFAULT_SESSION_DURATION_MS,
    LIVE_SCRIPT_MAX_SESSION_DURATION_MS
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
    reconnectDelaysMs?: number[];
    reconnectJitterMs?: number;
    random?: () => number;
    participantDisconnectGraceMs?: number;
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
    const participantTickets = new Map<string, LiveScriptSessionTicket>();
    const reconnectGeneration = new Map<string, number>();
    const reconnecting = new Set<string>();
    const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const participantDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const reconnectDelaysMs = options.reconnectDelaysMs || [0, 250, 500, 1000, 2000, 4000];
    const reconnectJitterMs = options.reconnectJitterMs
        ?? (options.reconnectDelaysMs ? 0 : 250);
    const random = options.random || Math.random;
    const participantDisconnectGraceMs = options.participantDisconnectGraceMs ?? 30_000;
    let outboundQueue = Promise.resolve();

    const sendOutboundNow = async function(
        frames: LiveScriptOutboundFrame[]
    ): Promise<void> {
        let delivered = 0;
        let lastError: unknown = null;

        for (const outbound of frames) {
            try {
                const result = await options.transport.send(
                    outbound.frame,
                    outbound.recipientEndpointId
                );

                if (result.ok) {
                    delivered += 1;
                }
                else {
                    lastError = new Error(result.message);
                }
            }
            catch (error) {
                lastError = error;
            }
        }

        if (frames.length > 0 && delivered === 0 && lastError) {
            throw lastError;
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

    const removeUnreachableHostParticipant = function(
        outbound: LiveScriptOutboundFrame
    ): void {
        const host = hosts.get(outbound.frame.sessionId);
        const recipientEndpointId = outbound.recipientEndpointId;

        if (!host || !recipientEndpointId) {
            return;
        }

        host.removeParticipant(recipientEndpointId);
        options.hostStateChanged(outbound.frame.sessionId, host.state());
    };

    const queueHostBroadcast = function(
        frames: LiveScriptOutboundFrame[]
    ): void {
        for (const outbound of frames) {
            void options.transport.send(
                outbound.frame,
                outbound.recipientEndpointId
            ).then((result) => {
                if (!result.ok) {
                    removeUnreachableHostParticipant(outbound);
                }
            }).catch(() => {
                removeUnreachableHostParticipant(outbound);
            });
        }
    };

    const routeFrame = async function(
        frame: LiveScriptFrame,
        remoteEndpointId: string
    ): Promise<void> {
        const host = hosts.get(frame.sessionId);

        if (host) {
            const disconnectKey = `${frame.sessionId}:${remoteEndpointId}`;
            const disconnectTimer = participantDisconnectTimers.get(disconnectKey);

            if (disconnectTimer) {
                clearTimeout(disconnectTimer);
                participantDisconnectTimers.delete(disconnectKey);
            }

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
        options.participantStateChanged(frame.sessionId, state);
        await sendOutbound(responses);

        if (state.status === "ended" || state.status === "failed") {
            reconnectGeneration.set(
                frame.sessionId,
                (reconnectGeneration.get(frame.sessionId) || 0) + 1
            );
            participants.delete(frame.sessionId);
            participantTickets.delete(frame.sessionId);
            await options.transport.close(frame.sessionId);
        }
    };

    const wait = function(delayMs: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, delayMs));
    };

    const reconnectParticipant = async function(sessionId: string): Promise<void> {
        const participant = participants.get(sessionId);
        const ticket = participantTickets.get(sessionId);

        if (!participant || !ticket || reconnecting.has(sessionId)) {
            return;
        }

        reconnecting.add(sessionId);
        const generation = (reconnectGeneration.get(sessionId) || 0) + 1;
        reconnectGeneration.set(sessionId, generation);

        try {
            for (const delayMs of reconnectDelaysMs) {
                if (reconnectGeneration.get(sessionId) !== generation) {
                    return;
                }

                if (ticket.expiresAt !== undefined && ticket.expiresAt <= Date.now()) {
                    break;
                }

                options.participantStateChanged(sessionId, participant.state());
                options.transportStateChanged({
                    sessionId,
                    state: "reconnecting",
                    message: "Reconnecting to the live script."
                });
                const jitterMs = Math.floor(
                    Math.max(0, reconnectJitterMs) * random()
                );
                await wait(Math.max(0, delayMs) + jitterMs);

                try {
                    const operation = await options.transport.join(ticket);

                    if (!operation.ok) {
                        continue;
                    }

                    const joinFrame = participant.reconnect(operation.endpointId);
                    await sendOutbound([joinFrame]);
                    options.participantStateChanged(sessionId, participant.state());
                    return;
                }
                catch {
                    // The next bounded attempt uses the same complete ticket.
                }
            }

            participant.fail("Live-script connection could not be restored.");
            options.participantStateChanged(sessionId, participant.state());
            reconnectGeneration.set(sessionId, generation + 1);
            participants.delete(sessionId);
            participantTickets.delete(sessionId);
            await options.transport.close(sessionId);
        }
        finally {
            reconnecting.delete(sessionId);
        }
    };

    options.transport.onFrame((event) => {
        void routeFrame(event.frame, event.remoteEndpointId).catch(() => {});
    });
    options.transport.onState((event) => {
        options.transportStateChanged(event);

        if (event.sessionId
            && event.state === "disconnected"
            && participants.has(event.sessionId)) {
            const participant = participants.get(event.sessionId);

            if (participant
                && participant.state().status !== "ended"
                && participant.state().status !== "failed") {
                void reconnectParticipant(event.sessionId);
            }
        }

        if (event.sessionId
            && event.remoteEndpointId
            && event.state === "disconnected") {
            const host = hosts.get(event.sessionId);

            if (host) {
                host.participantDisconnected(event.remoteEndpointId);
                options.hostStateChanged(event.sessionId, host.state());
                const disconnectKey = `${event.sessionId}:${event.remoteEndpointId}`;
                const previous = participantDisconnectTimers.get(disconnectKey);

                if (previous) {
                    clearTimeout(previous);
                }

                participantDisconnectTimers.set(disconnectKey, setTimeout(() => {
                    host.removeParticipant(event.remoteEndpointId as string);
                    participantDisconnectTimers.delete(disconnectKey);
                    options.hostStateChanged(event.sessionId as string, host.state());
                }, participantDisconnectGraceMs));
            }
        }
    });

    const host = async function(
        input: LiveScriptHostedSessionInput
    ): Promise<LiveScriptHostedSessionResult> {
        if (hosts.has(input.sessionId) || participants.has(input.sessionId)) {
            throw new Error("Live-script session is already active.");
        }

        const capability = await options.transport.capability();

        if (!capability.available) {
            throw new Error(capability.message || "Live-script sharing is unavailable.");
        }

        const now = Date.now();
        const expiresAt = input.expiresAt === undefined
            ? now + LIVE_SCRIPT_DEFAULT_SESSION_DURATION_MS
            : input.expiresAt;

        if (!Number.isSafeInteger(expiresAt)
            || expiresAt <= now
            || expiresAt > now + LIVE_SCRIPT_MAX_SESSION_DURATION_MS) {
            throw new Error("Live-script session expiry is invalid.");
        }

        const operation = await options.transport.host(input.sessionId);

        if (!operation.ok || !operation.transportAddress) {
            throw new Error(operation.message);
        }

        const hostEndpointId = operation.endpointId || capability.endpointId;

        if (!hostEndpointId) {
            throw new Error("Live-script presenter identity is unavailable.");
        }

        const displayName = sanitizeLiveScriptDisplayName(input.displayName);
        const session = createLiveScriptHostSession({
            sessionId: input.sessionId,
            capability: input.capability,
            endpointId: hostEndpointId,
            displayName,
            content: input.content,
            expiresAt
        });

        hosts.set(input.sessionId, session);
        const ticket: LiveScriptSessionTicket = {
            formatVersion: LIVE_SCRIPT_TICKET_FORMAT_VERSION,
            instructorEndpointId: hostEndpointId,
            transportAddress: operation.transportAddress,
            sessionId: input.sessionId,
            capability: input.capability,
            protocolVersions: { minimum: 1, maximum: 1 },
            displayName,
            expiresAt
        };

        const expiryTimer = setTimeout(() => {
            if (hosts.has(input.sessionId)) {
                void endHost(input.sessionId, "expired").catch(() => {});
            }
        }, expiresAt - now);
        expiryTimers.set(input.sessionId, expiryTimer);

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

        if (!capability.available || capability.canJoin === false) {
            throw new Error(capability.message || "Live-script sharing is unavailable.");
        }
        const operation = await options.transport.join(ticket);

        if (!operation.ok || !operation.endpointId) {
            throw new Error(operation.message);
        }

        const session = createLiveScriptParticipantSession({
            endpointId: operation.endpointId,
            ticket
        });

        participants.set(ticket.sessionId, session);

        participantTickets.set(ticket.sessionId, ticket);
        reconnectGeneration.set(ticket.sessionId, 0);
        try {
            await sendOutbound([session.join()]);
        }
        catch (error) {
            participants.delete(ticket.sessionId);
            participantTickets.delete(ticket.sessionId);
            throw error;
        }
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
        queueHostBroadcast(session.publishEdits(edits));
        options.hostStateChanged(sessionId, session.state());
    };

    const replaceHostContent = async function(
        sessionId: string,
        content: string
    ): Promise<void> {
        const session = requireHost(sessionId);
        queueHostBroadcast(session.replaceContent(content));
        options.hostStateChanged(sessionId, session.state());
    };

    const publishHostCursor = async function(
        sessionId: string,
        position: LiveScriptCursorFrame["payload"]["position"],
        selection?: LiveScriptCursorFrame["payload"]["selection"]
    ): Promise<void> {
        queueHostBroadcast(
            requireHost(sessionId).publishCursor(position, selection)
        );
    };

    const endHost = async function(
        sessionId: string,
        reason: LiveScriptSessionEndedFrame["payload"]["reason"] = "stopped"
    ): Promise<void> {
        const session = requireHost(sessionId);
        const frames = session.end(reason);
        const expiryTimer = expiryTimers.get(sessionId);

        if (expiryTimer) {
            clearTimeout(expiryTimer);
            expiryTimers.delete(sessionId);
        }

        try {
            queueHostBroadcast(frames);
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

        for (const [key, timer] of participantDisconnectTimers) {
            if (key.startsWith(`${sessionId}:`)) {
                clearTimeout(timer);
                participantDisconnectTimers.delete(key);
            }
        }
        await options.transport.close(sessionId);
    };

    const closeParticipant = async function(sessionId: string): Promise<void> {
        reconnectGeneration.set(sessionId, (reconnectGeneration.get(sessionId) || 0) + 1);
        participants.delete(sessionId);
        participantTickets.delete(sessionId);
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
