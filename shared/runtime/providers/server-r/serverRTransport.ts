import type {
    RuntimeTransportConnectProbe,
    RuntimeTransportController,
    RuntimeTransportEvent,
    RuntimeTransportAuthPolicy,
    RuntimeTransportCredential,
    RuntimeTransportConnectFailureKind,
    RuntimeTransportRequest,
    RuntimeTransportResponse,
    RuntimeTransportSnapshot
} from "../../transport/runtimeTransport";
import { createRuntimeTransportSnapshot } from "../../transport/runtimeTransport";
import {
    resolveServerRConnectionConfig
} from "./serverRConnectionConfig";


export interface ServerRTransportOptions {
    providerId: string;
    endpoint?: string;
    authPolicy?: RuntimeTransportAuthPolicy;
    credential?: RuntimeTransportCredential;
    connectProbe?: RuntimeTransportConnectProbe;
}


const disconnectedMessage = "Server R transport is disconnected.";


const createErrorResponse = function(
    request: RuntimeTransportRequest,
    message: string
): RuntimeTransportResponse {
    return {
        id: request.id,
        status: "error",
        value: null,
        message,
        receivedAt: new Date().toISOString()
    };
};


const readConnectionFailureMessage = function(
    failureKind: RuntimeTransportConnectFailureKind | undefined,
    message: string
): string {
    if (failureKind === "authentication-rejected") {
        return message || "Server R authentication was rejected.";
    }

    if (failureKind === "unreachable") {
        return message || "Server R endpoint is unreachable.";
    }

    if (failureKind === "configuration") {
        return message || "Server R transport is not configured correctly.";
    }

    return message || "Server R transport connection failed.";
};


export const createServerRTransport = function(
    options: ServerRTransportOptions
): RuntimeTransportController {
    let config = resolveServerRConnectionConfig(options);
    let snapshot = createRuntimeTransportSnapshot({
        providerId: options.providerId,
        kind: "remote-session",
        state: "disconnected",
        endpoint: config.endpoint,
        authentication: config.authentication,
        message: config.endpoint
            ? disconnectedMessage
            : "Server R endpoint is not configured by the host or deployment."
    });

    const updateSnapshot = function(
        state: RuntimeTransportSnapshot["state"],
        message: string
    ): RuntimeTransportSnapshot {
        snapshot = createRuntimeTransportSnapshot({
            providerId: options.providerId,
            kind: "remote-session",
            state,
            endpoint: config.endpoint,
            authentication: config.authentication,
            message
        });

        return snapshot;
    };

    return {
        getSnapshot: function(): RuntimeTransportSnapshot {
            return snapshot;
        },
        connect: async function(): Promise<RuntimeTransportSnapshot> {
            config = resolveServerRConnectionConfig(options);
            updateSnapshot("connecting", "Connecting to Server R transport.");

            if (!config.endpoint) {
                return updateSnapshot(
                    "failed",
                    "Server R endpoint is not configured by the host or deployment."
                );
            }

            if (
                config.authentication.required
                && !config.authentication.credentialProvided
            ) {
                return updateSnapshot(
                    "failed",
                    "Server R credentials are not configured by the host or deployment."
                );
            }

            if (!options.connectProbe) {
                return updateSnapshot(
                    "failed",
                    "Server R connection probe is not configured."
                );
            }

            try {
                const result = await options.connectProbe({
                    providerId: options.providerId,
                    kind: "remote-session",
                    endpoint: config.endpoint,
                    authentication: config.authentication,
                    credential: config.credential,
                    requestedAt: new Date().toISOString()
                });

                if (result.ok) {
                    return updateSnapshot(
                        "connected",
                        result.message || "Server R transport connected."
                    );
                }

                return updateSnapshot(
                    "failed",
                    readConnectionFailureMessage(result.failureKind, result.message)
                );
            }
            catch (error) {
                return updateSnapshot(
                    "failed",
                    error instanceof Error ? error.message : String(error)
                );
            }
        },
        disconnect: async function(): Promise<RuntimeTransportSnapshot> {
            return updateSnapshot("disconnected", disconnectedMessage);
        },
        sendRequest: async function(
            request: RuntimeTransportRequest
        ): Promise<RuntimeTransportResponse> {
            if (snapshot.state !== "connected") {
                return createErrorResponse(
                    request,
                    "Server R transport is not connected."
                );
            }

            return createErrorResponse(
                request,
                "Server R request routing is not implemented yet."
            );
        },
        subscribeToEvents: function(
            _listener: (event: RuntimeTransportEvent) => void
        ) {
            return function(): void {
                return;
            };
        }
    };
};
