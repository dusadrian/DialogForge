const MAX_PENDING_OUTBOUND_BYTES = 4 * 1024 * 1024;


const createSubscription = function(dispose) {
    return { dispose };
};


const errorMessage = function(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return String(error || "Browser collaboration is unavailable.");
};


/** Adapts the generated WebAssembly transport to DialogForge's host boundary. */
export const createLiveScriptTransport = function(wasm) {
    let participantClient = null;
    let hostedListener = null;
    let activeSessionId = "";
    let localEndpointId = "";
    let shuttingDown = false;
    let participantWriteQueue = Promise.resolve();
    const hostedClients = new Map();
    const frameListeners = new Set();
    const stateListeners = new Set();

    const publishState = function(event) {
        for (const listener of stateListeners) {
            listener(event);
        }
    };

    const publishFrame = function(event) {
        for (const listener of frameListeners) {
            listener(event);
        }
    };

    const isConnectedClient = function(connectedClient) {
        if (participantClient === connectedClient) {
            return true;
        }

        return hostedClients.get(connectedClient.remoteEndpointId)?.client
            === connectedClient;
    };

    const readFrames = async function(connectedClient, sessionId) {
        try {
            while (!shuttingDown && isConnectedClient(connectedClient)) {
                const frameJson = await connectedClient.receiveFrame();
                const frame = JSON.parse(frameJson);

                publishFrame({
                    frame,
                    remoteEndpointId: connectedClient.remoteEndpointId
                });
            }
        }
        catch (error) {
            if (!shuttingDown && isConnectedClient(connectedClient)) {
                if (participantClient === connectedClient) {
                    participantClient = null;
                }
                else {
                    hostedClients.delete(connectedClient.remoteEndpointId);
                }

                publishState({
                    sessionId,
                    remoteEndpointId: connectedClient.remoteEndpointId,
                    state: "disconnected",
                    message: errorMessage(error)
                });
            }
        }
    };

    const acceptHostedClients = async function(listener, sessionId) {
        try {
            while (!shuttingDown && hostedListener === listener) {
                const client = await listener.acceptClient();
                const previous = hostedClients.get(client.remoteEndpointId);

                if (previous) {
                    await previous.client.shutdown();
                }

                hostedClients.set(client.remoteEndpointId, {
                    client,
                    pendingBytes: 0,
                    writeQueue: Promise.resolve()
                });
                publishState({
                    sessionId,
                    remoteEndpointId: client.remoteEndpointId,
                    state: "connected"
                });
                void readFrames(client, sessionId);
            }
        }
        catch (error) {
            if (!shuttingDown && hostedListener === listener) {
                publishState({
                    sessionId,
                    state: "disconnected",
                    message: errorMessage(error)
                });
            }
        }
    };

    const host = async function(sessionId) {
        if (participantClient || hostedListener) {
            throw new Error("A browser live-script connection is already active.");
        }

        const listener = await wasm.hostLiveScript(sessionId);
        hostedListener = listener;
        activeSessionId = sessionId;
        localEndpointId = listener.endpointId;
        const transportAddress = await listener.transportAddress();

        publishState({ sessionId, state: "hosting" });
        void acceptHostedClients(listener, sessionId);
        return transportAddress;
    };

    const join = async function(ticket) {
        if (participantClient || hostedListener) {
            throw new Error("A browser live-script connection is already active.");
        }

        publishState({ sessionId: ticket.sessionId, state: "connecting" });

        try {
            const connectedClient = await wasm.connectLiveScript(
                JSON.stringify(ticket)
            );

            participantClient = connectedClient;
            activeSessionId = ticket.sessionId;
            localEndpointId = connectedClient.endpointId;
            publishState({
                sessionId: ticket.sessionId,
                remoteEndpointId: connectedClient.remoteEndpointId,
                state: "connected"
            });
            void readFrames(connectedClient, ticket.sessionId);
        }
        catch (error) {
            publishState({
                sessionId: ticket.sessionId,
                state: "disconnected",
                message: errorMessage(error)
            });
            throw error;
        }
    };

    const send = async function(frame, recipientEndpointId) {
        if (frame.sessionId !== activeSessionId) {
            throw new Error("Live-script recipient is disconnected.");
        }

        const frameJson = JSON.stringify(frame);

        if (hostedListener) {
            const state = hostedClients.get(recipientEndpointId);

            if (!state) {
                throw new Error("Live-script frame has no connected recipient.");
            }

            const encodedBytes = new TextEncoder().encode(frameJson).byteLength + 4;

            if (state.pendingBytes + encodedBytes > MAX_PENDING_OUTBOUND_BYTES) {
                if (frame.type === "cursor") {
                    return;
                }

                throw new Error("Live-script recipient is not keeping up.");
            }

            state.pendingBytes += encodedBytes;
            state.writeQueue = state.writeQueue.then(async () => {
                try {
                    await state.client.sendFrame(frameJson);
                }
                finally {
                    state.pendingBytes = Math.max(
                        0,
                        state.pendingBytes - encodedBytes
                    );
                }
            });
            await state.writeQueue;
            return;
        }

        const connectedClient = participantClient;

        if (!connectedClient) {
            throw new Error("Live-script recipient is disconnected.");
        }

        if (recipientEndpointId
            && recipientEndpointId !== connectedClient.remoteEndpointId) {
            throw new Error("Live-script frame has no connected recipient.");
        }

        participantWriteQueue = participantWriteQueue.then(() => {
            return connectedClient.sendFrame(frameJson);
        });
        await participantWriteQueue;
    };

    const closeSession = async function(sessionId) {
        if (sessionId !== activeSessionId) {
            publishState({ sessionId, state: "closed" });
            return;
        }

        const listener = hostedListener;
        hostedListener = null;
        const client = participantClient;
        participantClient = null;
        activeSessionId = "";

        if (listener) {
            const clients = Array.from(hostedClients.values());
            hostedClients.clear();
            await Promise.allSettled(clients.map(async (state) => {
                await state.writeQueue.catch(() => {});
                await state.client.shutdown();
            }));
            await listener.shutdown();
        }

        if (client) {
            await participantWriteQueue.catch(() => {});
            await client.shutdown();
        }

        publishState({ sessionId, state: "closed" });
    };

    const shutdown = async function() {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;

        if (activeSessionId) {
            await closeSession(activeSessionId);
        }

        publishState({ state: "closed" });
        frameListeners.clear();
        stateListeners.clear();
    };

    return {
        get endpointId() {
            return localEndpointId;
        },
        host,
        join,
        send,
        closeSession,
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
