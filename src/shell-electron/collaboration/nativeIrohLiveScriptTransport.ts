import type {
    Connection,
    Iroh,
    NodeAddr,
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
import type {
    LiveScriptTransport,
    LiveScriptTransportFrameEvent,
    LiveScriptTransportStateEvent,
    LiveScriptTransportSubscription
} from "../../script-editor/collaboration/liveScriptTransport";
const LIVE_SCRIPT_ALPN = "dialogforge/live-script/1";


interface NativeIrohModule {
    Iroh: typeof import("@number0/iroh").Iroh;
    verifyNodeAddr(address: NodeAddr): void;
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
): NodeAddr {
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

    const nodeAddress: NodeAddr = {
        nodeId: String(address.nodeId || ""),
        ...(typeof address.relayUrl === "string"
            ? { relayUrl: address.relayUrl }
            : {}),
        ...(Array.isArray(address.addresses)
            ? {
                addresses: address.addresses.map((entry) => String(entry || ""))
                    .filter(Boolean)
            }
            : {})
    };

    module.verifyNodeAddr(nodeAddress);
    return nodeAddress;
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
    let iroh: Iroh | null = null;
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
            state.connection.close(0n, new TextEncoder().encode("closed"));
        }
        catch {}
    };

    const readFrames = async function(state: NativeConnectionState): Promise<void> {
        try {
            while (!state.closed && !shuttingDown) {
                const prefix = new Uint8Array(4);
                await state.receive.readExact(prefix);
                const declaredLength = new DataView(
                    prefix.buffer,
                    prefix.byteOffset,
                    prefix.byteLength
                ).getUint32(0, false);

                if (declaredLength > LIVE_SCRIPT_MAX_FRAME_BYTES) {
                    throw new Error("Live-script frame exceeds the byte limit.");
                }

                const payload = new Uint8Array(declaredLength);
                await state.receive.readExact(payload);
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
        const remoteEndpointId = String(await connection.remoteNodeId());
        const existing = connectionsByEndpoint.get(remoteEndpointId);

        if (existing) {
            closeConnection(existing);
        }

        let opened = streams;

        if (!opened) {
            const stream = await connection.acceptBi();
            opened = { send: stream.send, receive: stream.recv };
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

    const initialize = async function(): Promise<void> {
        if (iroh) {
            return;
        }

        if (initializationFailure) {
            throw new Error(initializationFailure);
        }

        if (!initialization) {
            initialization = (async () => {
                const module = await loadModule();
                const protocols: Record<string, unknown> = {};

                protocols[LIVE_SCRIPT_ALPN] = function() {
                    return {
                        accept: function(error: Error | null, connection: Connection): void {
                            if (error) {
                                publishState({
                                    state: "disconnected",
                                    message: error.message
                                });
                                return;
                            }

                            void registerConnection(connection).catch((connectionError) => {
                                publishState({
                                    state: "disconnected",
                                    message: errorMessage(connectionError)
                                });
                            });
                        },
                        shutdown: function() {}
                    };
                };

                irohModule = module;
                iroh = await module.Iroh.memory({
                    protocols: protocols as never
                });
                localEndpointId = await iroh.net.nodeId();
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

        if (!iroh) {
            throw new Error("Native collaboration is unavailable.");
        }

        hostedSessions.add(sessionId);
        const address = await iroh.net.nodeAddr();
        publishState({ sessionId, state: "hosting" });
        return JSON.stringify(address);
    };

    const join = async function(ticket: LiveScriptSessionTicket): Promise<void> {
        publishState({ sessionId: ticket.sessionId, state: "connecting" });
        await initialize();

        if (!iroh || !irohModule) {
            throw new Error("Native collaboration is unavailable.");
        }

        const address = readTransportAddress(irohModule, ticket);
        const endpoint = iroh.node.endpoint();
        const connection = await endpoint.connect(
            address,
            new TextEncoder().encode(LIVE_SCRIPT_ALPN)
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
                await state.send.writeAll(encoded);
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

        if (iroh) {
            await iroh.node.shutdown();
        }

        iroh = null;
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
