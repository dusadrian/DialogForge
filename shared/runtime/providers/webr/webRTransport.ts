import type {
    RuntimeTransportConnectFailureKind,
    RuntimeTransportConnectProbe,
    RuntimeTransportController,
    RuntimeTransportEvent,
    RuntimeTransportRequest,
    RuntimeTransportResponse,
    RuntimeTransportSnapshot
} from "../../transport/runtimeTransport";
import { createRuntimeTransportSnapshot } from "../../transport/runtimeTransport";
import {
    createBundledWebRRuntimeBridge,
    type WebRRuntimeBridge
} from "./webRRuntimeBridge";
import type {
    WebRBootstrapPlan
} from "./webRBootstrap";
import { resolveWebRWorkerConfig } from "./webRWorkerConfig";


export interface WebRTransportOptions {
    providerId: string;
    assetBaseUrl?: string;
    bootstrap?: WebRBootstrapPlan;
    connectProbe?: RuntimeTransportConnectProbe;
}


const disconnectedMessage = "WebR worker transport is disconnected.";


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
    if (failureKind === "unreachable") {
        return message || "WebR worker script is unreachable.";
    }

    if (failureKind === "configuration") {
        return message || "WebR worker bootstrap is not configured correctly.";
    }

    return message || "WebR worker bootstrap failed.";
};


export const createWebRTransport = function(
    options: WebRTransportOptions
): RuntimeTransportController {
    let config = resolveWebRWorkerConfig({
        assetBaseUrl: options.assetBaseUrl
    });
    let runtimeBridge: WebRRuntimeBridge | null = null;
    let snapshot = createRuntimeTransportSnapshot({
        providerId: options.providerId,
        kind: "worker",
        state: "disconnected",
        endpoint: config.assetBaseUrl,
        authentication: config.authentication,
        message: config.assetBaseUrl
            ? disconnectedMessage
            : "WebR asset base URL is not configured by the host or deployment."
    });

    const updateSnapshot = function(
        state: RuntimeTransportSnapshot["state"],
        message: string
    ): RuntimeTransportSnapshot {
        snapshot = createRuntimeTransportSnapshot({
            providerId: options.providerId,
            kind: "worker",
            state,
            endpoint: config.assetBaseUrl,
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
            config = resolveWebRWorkerConfig({
                assetBaseUrl: options.assetBaseUrl
            });
            updateSnapshot("connecting", "Starting WebR worker transport.");

            if (!config.assetBaseUrl) {
                return updateSnapshot(
                    "failed",
                    "WebR asset base URL is not configured by the host or deployment."
                );
            }

            if (!options.connectProbe) {
                runtimeBridge = createBundledWebRRuntimeBridge({
                    baseUrl: config.assetBaseUrl,
                    bootstrap: options.bootstrap
                });

                if (!runtimeBridge) {
                    return updateSnapshot(
                        "failed",
                        "WebR worker bootstrap probe is not configured."
                    );
                }

                try {
                    const message = await runtimeBridge.start();

                    return updateSnapshot(
                        "connected",
                        message || "WebR worker transport connected."
                    );
                }
                catch (error) {
                    runtimeBridge = null;

                    return updateSnapshot(
                        "failed",
                        error instanceof Error ? error.message : String(error)
                    );
                }
            }

            runtimeBridge = null;

            try {
                const result = await options.connectProbe({
                    providerId: options.providerId,
                    kind: "worker",
                    endpoint: config.assetBaseUrl,
                    authentication: config.authentication,
                    requestedAt: new Date().toISOString()
                });

                if (result.ok) {
                    return updateSnapshot(
                        "connected",
                        result.message || "WebR worker transport connected."
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
            runtimeBridge?.close();
            runtimeBridge = null;

            return updateSnapshot("disconnected", disconnectedMessage);
        },
        sendRequest: async function(
            request: RuntimeTransportRequest
        ): Promise<RuntimeTransportResponse> {
            if (snapshot.state !== "connected") {
                return createErrorResponse(
                    request,
                    "WebR worker transport is not connected."
                );
            }

            if (runtimeBridge) {
                return runtimeBridge.sendRequest(request);
            }

            return createErrorResponse(
                request,
                "WebR request routing is not implemented yet."
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
