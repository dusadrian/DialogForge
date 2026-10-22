import type {
    Connection,
    Endpoint,
    EndpointAddr,
    Incoming,
    RecvStream,
    SendStream
} from "@number0/iroh";

import {
    encodeLiveScriptFrame,
    parseLiveScriptJsonFrame
} from "../../script-editor/collaboration/liveScriptFrameCodec";
import {
    LIVE_SCRIPT_MAX_FRAME_BYTES,
    LIVE_SCRIPT_MAX_PENDING_OUTBOUND_BYTES,
    type LiveScriptFrame
} from "../../script-editor/collaboration/liveScriptProtocol";
import type {
    LiveScriptSessionTicket
} from "../../script-editor/collaboration/liveScriptTicket";
import {
    waitForLiveScriptTransportReady
} from "../../script-editor/collaboration/liveScriptTransportReadiness";
import type {
    LiveScriptTransport,
    LiveScriptTransportFrameEvent,
    LiveScriptTransportStateEvent,
    LiveScriptTransportSubscription
} from "../../script-editor/collaboration/liveScriptTransport";
const LIVE_SCRIPT_ALPN = "dialogforge/live-script/1";
const liveScriptAlpnBytes = Array.from(new TextEncoder().encode(LIVE_SCRIPT_ALPN));


interface NativeIrohModule {
    Endpoint: typeof import("@number0/iroh").Endpoint;
    EndpointAddr: typeof import("@number0/iroh").EndpointAddr;
    EndpointId: typeof import("@number0/iroh").EndpointId;
}


interface NativeConnectionState {
    connection: Connection;
    remoteEndpointId: string;
    receive: RecvStream;
    send: SendStream;
    sessions: Set<string>;
    writeQueue: Promise<void>;
    pendingBytes: number;
    closed: boolean;
}


export interface NativeIrohCapability {
    available: boolean;
    endpointId: string;
    message: string;
}


export interface NativeIrohLiveScriptTransport extends LiveScriptTransport {
    capability(): Promise<NativeIrohCapability>;
    closeAllSessions(): Promise<void>;
    disconnectPeer(endpointId: string): Promise<void>;
}


export interface NativeIrohLiveScriptTransportOptions {
    loadModule?(): Promise<NativeIrohModule>;
}


const createSubscription = function(
    dispose: () => void
): LiveScriptTransportSubscription {
    return { dispose };
};


const readTransportAddress = function(
    module: NativeIrohModule,
    ticket: LiveScriptSessionTicket
): EndpointAddr {
    let value: unknown;

    try {
        value = JSON.parse(ticket.transportAddress);
    }
    catch {
        throw new Error("Live-script connection ticket is invalid.");
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Live-script connection ticket is invalid.");
    }

    const address = value as Record<string, unknown>;

    if (String(address.nodeId || "") !== ticket.instructorEndpointId) {
        throw new Error("Live-script presenter identity does not match the ticket.");
    }

    return new module.EndpointAddr(
        module.EndpointId.fromString(ticket.instructorEndpointId),
        typeof address.relayUrl === "string" ? address.relayUrl : undefined,
        Array.isArray(address.addresses)
            ? address.addresses.map((entry) => String(entry || "")).filter(Boolean)
            : []
    );
};


const errorMessage = function(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return String(error || "Native collaboration is unavailable.");
};


export const createNativeIrohLiveScriptTransport = function(
    options: NativeIrohLiveScriptTransportOptions
): NativeIrohLiveScriptTransport {
    let endpoint: Endpoint | null = null;
    let irohModule: NativeIrohModule | null = null;
    let initialization: Promise<void> | null = null;
    let initializationFailure = "";
    let localEndpointId = "";
    let shuttingDown = false;
    const hostedSessions = new Set<string>();
    const instructorBySession = new Map<string, string>();
    const connectionsByEndpoint = new Map<string, NativeConnectionState>();
    const frameListeners = new Set<(event: LiveScriptTransportFrameEvent) => void>();
    const stateListeners = new Set<(event: LiveScriptTransportStateEvent) => void>();
    const publishState = function(event: LiveScriptTransportStateEvent): void {
        for (const listener of stateListeners) {
            listener(event);
        }
    };

    const publishFrame = function(event: LiveScriptTransportFrameEvent): void {
        for (const listener of frameListeners) {
            listener(event);
        }
    };

    const closeConnection = function(state: NativeConnectionState): void {
        if (state.closed) {
            return;
        }

        state.closed = true;
        if (connectionsByEndpoint.get(state.remoteEndpointId) === state) {
            connectionsByEndpoint.delete(state.remoteEndpointId);
        }

        try {
            state.connection.close(0n, Array.from(new TextEncoder().encode("closed")));
        }
        catch {}
    };

    const readFrames = async function(state: NativeConnectionState): Promise<void> {
        try {
            while (!state.closed && !shuttingDown) {
                const prefix = Uint8Array.from(await state.receive.readExact(4));
                const declaredLength = new DataView(
                    prefix.buffer,
                    prefix.byteOffset,
                    prefix.byteLength
                ).getUint32(0, false);

                if (declaredLength > LIVE_SCRIPT_MAX_FRAME_BYTES) {
                    throw new Error("Live-script frame exceeds the byte limit.");
                }

                const payload = Uint8Array.from(await state.receive.readExact(declaredLength));
                const parsed = parseLiveScriptJsonFrame(payload);

                if (!parsed.ok) {
                    throw new Error(parsed.error.message);
                }

                if (parsed.frame.senderEndpointId !== state.remoteEndpointId) {
                    throw new Error("Live-script sender identity does not match the connection.");
                }

                state.sessions.add(parsed.frame.sessionId);
                publishFrame({
                    frame: parsed.frame,
                    remoteEndpointId: state.remoteEndpointId
                });
            }
        }
        catch (error) {
            const affectedSessions = Array.from(state.sessions);
            closeConnection(state);

            const replacement = connectionsByEndpoint.get(state.remoteEndpointId);

            if (!shuttingDown && (!replacement || replacement.closed)) {
                for (const sessionId of affectedSessions) {
                    publishState({
                        sessionId,
                        remoteEndpointId: state.remoteEndpointId,
                        state: "disconnected",
                        message: errorMessage(error)
                    });
                }
            }
        }
    };

    const registerConnection = async function(
        connection: Connection,
        streams?: { send: SendStream; receive: RecvStream }
    ): Promise<NativeConnectionState> {
        if (shuttingDown) {
            connection.close(0n, []);
            throw new Error("Live-script transport is shutting down.");
        }

        const remoteEndpointId = connection.remoteId().toString();
        const existing = connectionsByEndpoint.get(remoteEndpointId);

        if (existing) {
            closeConnection(existing);
        }

        let opened = streams;

        if (!opened) {
            const stream = await connection.acceptBi();
            opened = { send: stream.send, receive: stream.recv };
        }

        if (shuttingDown) {
            connection.close(0n, []);
            throw new Error("Live-script transport is shutting down.");
        }

        const state: NativeConnectionState = {
            connection,
            remoteEndpointId,
            receive: opened.receive,
            send: opened.send,
            sessions: new Set(),
            writeQueue: Promise.resolve(),
            pendingBytes: 0,
            closed: false
        };

        connectionsByEndpoint.set(remoteEndpointId, state);
        void readFrames(state);
        return state;
    };

    const loadModule = async function(): Promise<NativeIrohModule> {
        if (options.loadModule) {
            return options.loadModule();
        }

        return require("@number0/iroh") as NativeIrohModule;
    };

    const acceptConnection = async function(incoming: Incoming): Promise<void> {
        try {
            const accepting = await incoming.accept();
            const connection = await accepting.connect();
            await registerConnection(connection);
        }
        catch (error) {
            if (!shuttingDown) {
                publishState({ state: "disconnected", message: errorMessage(error) });
            }
        }
    };

    const acceptConnections = async function(listener: Endpoint): Promise<void> {
        try {
            while (!shuttingDown && endpoint === listener) {
                const incoming = await listener.acceptNext();

                if (!incoming) {
                    return;
                }

                if (shuttingDown) {
                    await incoming.ignore();
                    return;
                }

                // Each handshake progresses independently so one peer cannot
                // prevent the endpoint from accepting another participant.
                void acceptConnection(incoming);
            }
        }
        catch (error) {
            if (!shuttingDown) {
                publishState({ state: "disconnected", message: errorMessage(error) });
            }
        }
    };

    const initialize = async function(): Promise<void> {
        if (shuttingDown) {
            throw new Error("Live-script transport is shutting down.");
        }

        if (endpoint) {
            return;
        }

        if (initializationFailure) {
            throw new Error(initializationFailure);
        }

        if (!initialization) {
            initialization = (async () => {
                const module = await loadModule();
                const listener = await module.Endpoint.bind({ alpns: [liveScriptAlpnBytes] });

                if (shuttingDown) {
                    await listener.close();
                    throw new Error("Live-script transport is shutting down.");
                }

                irohModule = module;
                endpoint = listener;
                localEndpointId = listener.id().toString();
                void acceptConnections(listener);
            })().catch((error) => {
                initializationFailure = errorMessage(error);
                publishState({
                    state: "unavailable",
                    message: initializationFailure
                });
                throw error;
            });
        }

        await initialization;
    };

    const capability = async function(): Promise<NativeIrohCapability> {
        try {
            await initialize();
            return {
                available: true,
                endpointId: localEndpointId,
                message: "Native live-script collaboration is available."
            };
        }
        catch {
            return {
                available: false,
                endpointId: "",
                message: initializationFailure || "Native collaboration is unavailable."
            };
        }
    };

    const host = async function(sessionId: string): Promise<string> {
        await initialize();

        if (!endpoint) {
            throw new Error("Native collaboration is unavailable.");
        }

        await waitForLiveScriptTransportReady(endpoint.online());

        if (shuttingDown || !endpoint) {
            throw new Error("Live-script transport is shutting down.");
        }

        const address = endpoint.addr();
        hostedSessions.add(sessionId);
        publishState({ sessionId, state: "hosting" });
        return JSON.stringify({
            nodeId: localEndpointId,
            relayUrl: address.relayUrl() || undefined,
            addresses: address.directAddresses()
        });
    };

    const join = async function(ticket: LiveScriptSessionTicket): Promise<void> {
        publishState({ sessionId: ticket.sessionId, state: "connecting" });
        await initialize();

        if (!endpoint || !irohModule) {
            throw new Error("Native collaboration is unavailable.");
        }

        const address = readTransportAddress(irohModule, ticket);
        const connection = await endpoint.connect(
            address,
            liveScriptAlpnBytes
        );
        const stream = await connection.openBi();
        const state = await registerConnection(connection, {
            send: stream.send,
            receive: stream.recv
        });

        state.sessions.add(ticket.sessionId);
        instructorBySession.set(ticket.sessionId, ticket.instructorEndpointId);
        publishState({ sessionId: ticket.sessionId, state: "connected" });
    };

    const send = async function(
        frame: LiveScriptFrame,
        recipientEndpointId?: string
    ): Promise<void> {
        await initialize();
        const targetEndpointId = recipientEndpointId
            || instructorBySession.get(frame.sessionId);

        if (!targetEndpointId) {
            throw new Error("Live-script frame has no connected recipient.");
        }

        const state = connectionsByEndpoint.get(targetEndpointId);

        if (!state || state.closed) {
            throw new Error("Live-script recipient is disconnected.");
        }

        const encoded = encodeLiveScriptFrame(frame);

        if (state.pendingBytes + encoded.byteLength
            > LIVE_SCRIPT_MAX_PENDING_OUTBOUND_BYTES) {
            if (frame.type === "cursor") {
                return;
            }

            throw new Error("Live-script recipient is not keeping up.");
        }

        state.sessions.add(frame.sessionId);
        state.pendingBytes += encoded.byteLength;
        state.writeQueue = state.writeQueue.then(async () => {
            try {
                await state.send.writeAll(Array.from(encoded));
            }
            finally {
                state.pendingBytes = Math.max(0, state.pendingBytes - encoded.byteLength);
            }
        });
        await state.writeQueue;
    };

    const closeSession = async function(sessionId: string): Promise<void> {
        hostedSessions.delete(sessionId);
        instructorBySession.delete(sessionId);

        for (const state of connectionsByEndpoint.values()) {
            state.sessions.delete(sessionId);

            if (state.sessions.size === 0) {
                try {
                    await state.writeQueue;
                    await state.send.finish();
                }
                catch {}

                closeConnection(state);
            }
        }

        publishState({ sessionId, state: "closed" });
    };

    const closeAllSessions = async function(): Promise<void> {
        const sessionIds = new Set<string>(hostedSessions.keys());

        for (const state of connectionsByEndpoint.values()) {
            for (const sessionId of state.sessions) {
                sessionIds.add(sessionId);
            }
        }

        await Promise.all(Array.from(sessionIds).map((sessionId) => {
            return closeSession(sessionId);
        }));
    };

    const disconnectPeer = async function(endpointId: string): Promise<void> {
        const state = connectionsByEndpoint.get(endpointId);

        if (!state || state.closed) {
            return;
        }

        closeConnection(state);
    };

    const shutdown = async function(): Promise<void> {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;
        hostedSessions.clear();
        instructorBySession.clear();

        for (const state of Array.from(connectionsByEndpoint.values())) {
            closeConnection(state);
        }

        if (endpoint) {
            await endpoint.close();
        }

        endpoint = null;
        publishState({ state: "closed" });
        frameListeners.clear();
        stateListeners.clear();
    };

    return {
        get endpointId(): string {
            return localEndpointId;
        },
        capability,
        host,
        join,
        send,
        closeSession,
        closeAllSessions,
        disconnectPeer,
        shutdown,
        onFrame: function(listener) {
            frameListeners.add(listener);
            return createSubscription(() => {
                frameListeners.delete(listener);
            });
        },
        onState: function(listener) {
            stateListeners.add(listener);
            return createSubscription(() => {
                stateListeners.delete(listener);
            });
        }
    };
};
