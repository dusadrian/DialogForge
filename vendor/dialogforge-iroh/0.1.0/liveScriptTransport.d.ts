export interface LiveScriptFrame {
    protocol: "dialogforge/live-script";
    version: 1;
    sessionId: string;
    type: string;
    senderEndpointId: string;
    messageNumber: number;
    [key: string]: unknown;
}

export interface LiveScriptSessionTicket {
    formatVersion: 1;
    instructorEndpointId: string;
    transportAddress: string;
    sessionId: string;
    capability: string;
    protocolVersions: {
        minimum: number;
        maximum: number;
    };
    expiresAt?: number;
    displayName?: string;
}

export type LiveScriptConnectionState =
    | "connecting"
    | "connected"
    | "disconnected"
    | "closed";

export interface LiveScriptTransportStateEvent {
    sessionId?: string;
    remoteEndpointId?: string;
    state: LiveScriptConnectionState;
    message?: string;
}

export interface LiveScriptTransportFrameEvent {
    frame: LiveScriptFrame;
    remoteEndpointId: string;
}

export interface LiveScriptTransportSubscription {
    dispose(): void;
}

export interface DialogForgeWasmClient {
    readonly endpointId: string;
    readonly remoteEndpointId: string;
    readonly state: string;
    sendFrame(frameJson: string): Promise<void>;
    receiveFrame(): Promise<string>;
    transportAddress(): Promise<string>;
    shutdown(): Promise<void>;
    free?(): void;
}

export interface DialogForgeWasmHost {
    readonly endpointId: string;
    transportAddress(): Promise<string>;
    acceptClient(): Promise<DialogForgeWasmClient>;
    shutdown(): Promise<void>;
    free?(): void;
}

export interface DialogForgeWasmModule {
    connectLiveScript(ticketJson: string): Promise<DialogForgeWasmClient>;
    hostLiveScript(sessionId: string): Promise<DialogForgeWasmHost>;
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

export function createLiveScriptTransport(
    wasm: DialogForgeWasmModule
): LiveScriptTransport;
