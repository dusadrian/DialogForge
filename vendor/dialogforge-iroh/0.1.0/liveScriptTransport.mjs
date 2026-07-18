const createSubscription = function(dispose) {
    return { dispose };
};

const errorMessage = function(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return String(error || "Browser collaboration is unavailable.");
};

/**
 * Adapts the generated WebAssembly client to DialogForge's transport boundary.
 * Version 1 intentionally supports browser participants, not browser hosting.
 */
export const createLiveScriptTransport = function(wasm) {
    let client = null;
    let activeSessionId = "";
    let localEndpointId = "";
    let shuttingDown = false;
    let writeQueue = Promise.resolve();
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

    const readFrames = async function(connectedClient, sessionId) {
        try {
            while (!shuttingDown && client === connectedClient) {
                const frameJson = await connectedClient.receiveFrame();
                const frame = JSON.parse(frameJson);

                publishFrame({
                    frame,
                    remoteEndpointId: connectedClient.remoteEndpointId
                });
            }
        } catch (error) {
            if (!shuttingDown && client === connectedClient) {
                publishState({
                    sessionId,
                    remoteEndpointId: connectedClient.remoteEndpointId,
                    state: "disconnected",
                    message: errorMessage(error)
                });
            }
        }
    };

    const join = async function(ticket) {
        if (client) {
            throw new Error("A browser live-script connection is already active.");
        }

        publishState({ sessionId: ticket.sessionId, state: "connecting" });

        try {
            const connectedClient = await wasm.connectLiveScript(JSON.stringify(ticket));

            client = connectedClient;
            activeSessionId = ticket.sessionId;
            localEndpointId = connectedClient.endpointId;
            publishState({
                sessionId: ticket.sessionId,
                remoteEndpointId: connectedClient.remoteEndpointId,
                state: "connected"
            });
            void readFrames(connectedClient, ticket.sessionId);
        } catch (error) {
            publishState({
                sessionId: ticket.sessionId,
                state: "disconnected",
                message: errorMessage(error)
            });
            throw error;
        }
    };

    const send = async function(frame, recipientEndpointId) {
        const connectedClient = client;

        if (!connectedClient || frame.sessionId !== activeSessionId) {
            throw new Error("Live-script recipient is disconnected.");
        }

        if (recipientEndpointId
            && recipientEndpointId !== connectedClient.remoteEndpointId) {
            throw new Error("Live-script frame has no connected recipient.");
        }

        writeQueue = writeQueue.then(() => {
            return connectedClient.sendFrame(JSON.stringify(frame));
        });
        await writeQueue;
    };

    const closeSession = async function(sessionId) {
        if (!client || sessionId !== activeSessionId) {
            publishState({ sessionId, state: "closed" });
            return;
        }

        const closingClient = client;
        client = null;
        activeSessionId = "";
        await writeQueue.catch(() => {});
        await closingClient.shutdown();
        closingClient.free?.();
        publishState({ sessionId, state: "closed" });
    };

    const shutdown = async function() {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;

        if (client) {
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
        host: async function() {
            throw new Error("Browser live-script hosting is not available in version 1.");
        },
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

