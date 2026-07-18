import type {
    LiveScriptFrame
} from "./liveScriptProtocol";
import type {
    LiveScriptSessionTicket
} from "./liveScriptTicket";
import type {
    LiveScriptTransport,
    LiveScriptTransportFrameEvent,
    LiveScriptTransportStateEvent,
    LiveScriptTransportSubscription
} from "./liveScriptTransport";


interface InMemoryEndpointState {
    transport: InMemoryLiveScriptTransport;
    hostedSessions: Set<string>;
    joinedSessions: Map<string, string>;
}


const createSubscription = function(
    dispose: () => void
): LiveScriptTransportSubscription {
    return { dispose };
};


class InMemoryLiveScriptNetwork {
    private endpoints = new Map<string, InMemoryEndpointState>();

    createEndpoint(endpointId: string): LiveScriptTransport {
        if (this.endpoints.has(endpointId)) {
            throw new Error(`In-memory endpoint already exists: ${endpointId}`);
        }

        const transport = new InMemoryLiveScriptTransport(this, endpointId);
        this.endpoints.set(endpointId, {
            transport,
            hostedSessions: new Set(),
            joinedSessions: new Map()
        });
        return transport;
    }

    host(endpointId: string, sessionId: string): string {
        const endpoint = this.requireEndpoint(endpointId);
        const existingHost = Array.from(this.endpoints.values()).find((candidate) => {
            return candidate.hostedSessions.has(sessionId);
        });

        if (existingHost) {
            throw new Error(`In-memory session is already hosted: ${sessionId}`);
        }

        endpoint.hostedSessions.add(sessionId);
        return `memory://${endpointId}/${sessionId}`;
    }

    join(endpointId: string, ticket: LiveScriptSessionTicket): void {
        const participant = this.requireEndpoint(endpointId);
        const instructor = this.requireEndpoint(ticket.instructorEndpointId);

        if (!instructor.hostedSessions.has(ticket.sessionId)) {
            throw new Error("In-memory live-script session is not available.");
        }

        participant.joinedSessions.set(ticket.sessionId, ticket.instructorEndpointId);
    }

    send(
        endpointId: string,
        frame: LiveScriptFrame,
        recipientEndpointId?: string
    ): void {
        const sender = this.requireEndpoint(endpointId);
        const recipientId = recipientEndpointId
            || sender.joinedSessions.get(frame.sessionId);

        if (!recipientId) {
            throw new Error("Live-script frame has no in-memory recipient.");
        }

        const recipient = this.requireEndpoint(recipientId);

        queueMicrotask(() => {
            recipient.transport.publishFrame({
                frame,
                remoteEndpointId: endpointId
            });
        });
    }

    closeSession(endpointId: string, sessionId: string): void {
        const endpoint = this.requireEndpoint(endpointId);
        endpoint.hostedSessions.delete(sessionId);
        endpoint.joinedSessions.delete(sessionId);

        for (const candidate of this.endpoints.values()) {
            if (candidate.joinedSessions.get(sessionId) === endpointId) {
                candidate.joinedSessions.delete(sessionId);
                candidate.transport.publishState({ sessionId, state: "disconnected" });
            }
        }
    }

    shutdown(endpointId: string): void {
        const endpoint = this.requireEndpoint(endpointId);

        for (const sessionId of endpoint.hostedSessions) {
            this.closeSession(endpointId, sessionId);
        }

        this.endpoints.delete(endpointId);
    }

    private requireEndpoint(endpointId: string): InMemoryEndpointState {
        const endpoint = this.endpoints.get(endpointId);

        if (!endpoint) {
            throw new Error(`In-memory endpoint is not available: ${endpointId}`);
        }

        return endpoint;
    }
}


class InMemoryLiveScriptTransport implements LiveScriptTransport {
    readonly endpointId: string;
    private frameListeners = new Set<(event: LiveScriptTransportFrameEvent) => void>();
    private stateListeners = new Set<(event: LiveScriptTransportStateEvent) => void>();
    private closed = false;

    constructor(
        private network: InMemoryLiveScriptNetwork,
        endpointId: string
    ) {
        this.endpointId = endpointId;
    }

    async host(sessionId: string): Promise<string> {
        this.requireOpen();
        const address = this.network.host(this.endpointId, sessionId);
        this.publishState({ sessionId, state: "hosting" });
        return address;
    }

    async join(ticket: LiveScriptSessionTicket): Promise<void> {
        this.requireOpen();
        this.publishState({ sessionId: ticket.sessionId, state: "connecting" });
        this.network.join(this.endpointId, ticket);
        this.publishState({ sessionId: ticket.sessionId, state: "connected" });
    }

    async send(
        frame: LiveScriptFrame,
        recipientEndpointId?: string
    ): Promise<void> {
        this.requireOpen();
        this.network.send(this.endpointId, frame, recipientEndpointId);
    }

    async closeSession(sessionId: string): Promise<void> {
        if (this.closed) {
            return;
        }

        this.network.closeSession(this.endpointId, sessionId);
        this.publishState({ sessionId, state: "closed" });
    }

    async shutdown(): Promise<void> {
        if (this.closed) {
            return;
        }

        this.network.shutdown(this.endpointId);
        this.closed = true;
        this.publishState({ state: "closed" });
        this.frameListeners.clear();
        this.stateListeners.clear();
    }

    onFrame(
        listener: (event: LiveScriptTransportFrameEvent) => void
    ): LiveScriptTransportSubscription {
        this.frameListeners.add(listener);
        return createSubscription(() => {
            this.frameListeners.delete(listener);
        });
    }

    onState(
        listener: (event: LiveScriptTransportStateEvent) => void
    ): LiveScriptTransportSubscription {
        this.stateListeners.add(listener);
        return createSubscription(() => {
            this.stateListeners.delete(listener);
        });
    }

    publishFrame(event: LiveScriptTransportFrameEvent): void {
        for (const listener of this.frameListeners) {
            listener(event);
        }
    }

    publishState(event: LiveScriptTransportStateEvent): void {
        for (const listener of this.stateListeners) {
            listener(event);
        }
    }

    private requireOpen(): void {
        if (this.closed) {
            throw new Error("In-memory live-script transport is closed.");
        }
    }
}


export const createInMemoryLiveScriptNetwork = function(): {
    createEndpoint(endpointId: string): LiveScriptTransport;
} {
    const network = new InMemoryLiveScriptNetwork();

    return {
        createEndpoint: function(endpointId: string): LiveScriptTransport {
            return network.createEndpoint(endpointId);
        }
    };
};
