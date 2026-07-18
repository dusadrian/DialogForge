import type {
    LiveScriptFrame
} from "./liveScriptProtocol";
import type {
    LiveScriptSessionTicket
} from "./liveScriptTicket";


export type LiveScriptConnectionState =
    | "idle"
    | "hosting"
    | "connecting"
    | "reconnecting"
    | "connected"
    | "disconnected"
    | "closed"
    | "unavailable";


export interface LiveScriptTransportFrameEvent {
    frame: LiveScriptFrame;
    remoteEndpointId: string;
}


export interface LiveScriptTransportStateEvent {
    sessionId?: string;
    remoteEndpointId?: string;
    state: LiveScriptConnectionState;
    message?: string;
}


export interface LiveScriptTransportSubscription {
    dispose(): void;
}


export interface LiveScriptTransport {
    readonly endpointId: string;
    host(sessionId: string): Promise<string>;
    join(ticket: LiveScriptSessionTicket): Promise<void>;
    send(frame: LiveScriptFrame, recipientEndpointId?: string): Promise<void>;
    closeSession(sessionId: string): Promise<void>;
    shutdown(): Promise<void>;
    onFrame(
        listener: (event: LiveScriptTransportFrameEvent) => void
    ): LiveScriptTransportSubscription;
    onState(
        listener: (event: LiveScriptTransportStateEvent) => void
    ): LiveScriptTransportSubscription;
}
