export type RuntimeTransportConnectionState =
    | "disconnected"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "failed";


export type RuntimeTransportKind =
    | "remote-session"
    | "worker";


export type RuntimeTransportConfigSource =
    | "host"
    | "deployment"
    | "environment";


export type RuntimeTransportAuthenticationKind =
    | "none"
    | "bearer";


export type RuntimeTransportConnectFailureKind =
    | "configuration"
    | "authentication-rejected"
    | "unreachable"
    | "unknown";


export interface RuntimeTransportAuthPolicy {
    required: boolean;
    kind: RuntimeTransportAuthenticationKind;
    source: RuntimeTransportConfigSource;
}


export interface RuntimeTransportCredential {
    kind: RuntimeTransportAuthenticationKind;
    token?: string;
    source: RuntimeTransportConfigSource;
}


export interface RuntimeTransportAuthenticationSnapshot {
    required: boolean;
    kind: RuntimeTransportAuthenticationKind;
    source: RuntimeTransportConfigSource;
    credentialProvided: boolean;
}


export interface RuntimeTransportSnapshot {
    providerId: string;
    kind: RuntimeTransportKind;
    state: RuntimeTransportConnectionState;
    endpoint: string;
    authentication?: RuntimeTransportAuthenticationSnapshot;
    message: string;
    updatedAt: string;
}


export interface RuntimeTransportRequest {
    id: string;
    method: string;
    params: Record<string, unknown>;
    createdAt: string;
}


export interface RuntimeTransportResponse {
    id: string;
    status: "ok" | "error";
    value: unknown;
    message: string;
    receivedAt: string;
}


export interface RuntimeTransportEvent {
    type: string;
    providerId: string;
    payload: Record<string, unknown>;
    createdAt: string;
}


export interface RuntimeTransportConnectRequest {
    providerId: string;
    kind: RuntimeTransportKind;
    endpoint: string;
    authentication: RuntimeTransportAuthenticationSnapshot;
    credential?: RuntimeTransportCredential;
    requestedAt: string;
}


export interface RuntimeTransportConnectResult {
    ok: boolean;
    message: string;
    sessionId?: string;
    failureKind?: RuntimeTransportConnectFailureKind;
}


export type RuntimeTransportConnectProbe = (
    request: RuntimeTransportConnectRequest
) => Promise<RuntimeTransportConnectResult>;


export type RuntimeTransportUnsubscribe = () => void;


export interface RuntimeTransportController {
    getSnapshot(): RuntimeTransportSnapshot;
    connect(): Promise<RuntimeTransportSnapshot>;
    disconnect(): Promise<RuntimeTransportSnapshot>;
    sendRequest(request: RuntimeTransportRequest): Promise<RuntimeTransportResponse>;
    subscribeToEvents(
        listener: (event: RuntimeTransportEvent) => void
    ): RuntimeTransportUnsubscribe;
}


export interface RuntimeTransportSnapshotInput {
    providerId: string;
    kind: RuntimeTransportKind;
    state: RuntimeTransportConnectionState;
    endpoint?: string;
    authentication?: RuntimeTransportAuthenticationSnapshot;
    message?: string;
    updatedAt?: string;
}


export const createRuntimeTransportSnapshot = function(
    input: RuntimeTransportSnapshotInput
): RuntimeTransportSnapshot {
    return {
        providerId: input.providerId,
        kind: input.kind,
        state: input.state,
        endpoint: String(input.endpoint || ""),
        authentication: input.authentication,
        message: String(input.message || ""),
        updatedAt: input.updatedAt || new Date().toISOString()
    };
};
