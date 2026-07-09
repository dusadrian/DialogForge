import {
    createRuntimeTransportSnapshot,
    type RuntimeTransportController,
    type RuntimeTransportEvent,
    type RuntimeTransportRequest,
    type RuntimeTransportResponse,
    type RuntimeTransportSnapshot
} from "../../transport/runtimeTransport";
import {
    handleWebRRuntimeTransportRequest
} from "./webRRuntimeBridge";
import type {
    WebR
} from "webr";


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


export const createWebRDirectRuntimeTransport = function(
    runtime: WebR,
    providerId = "webr"
): RuntimeTransportController {
    let snapshot = createRuntimeTransportSnapshot({
        providerId,
        kind: "worker",
        state: "connected",
        endpoint: "browser-direct",
        message: "WebR direct browser runtime transport is connected."
    });

    const disconnected = function(): RuntimeTransportSnapshot {
        snapshot = createRuntimeTransportSnapshot({
            providerId,
            kind: "worker",
            state: "disconnected",
            endpoint: "browser-direct",
            message: "WebR direct browser runtime transport is disconnected."
        });

        return snapshot;
    };

    return {
        getSnapshot: function(): RuntimeTransportSnapshot {
            return snapshot;
        },
        connect: async function(): Promise<RuntimeTransportSnapshot> {
            snapshot = createRuntimeTransportSnapshot({
                providerId,
                kind: "worker",
                state: "connected",
                endpoint: "browser-direct",
                message: "WebR direct browser runtime transport is connected."
            });

            return snapshot;
        },
        disconnect: async function(): Promise<RuntimeTransportSnapshot> {
            return disconnected();
        },
        sendRequest: async function(
            request: RuntimeTransportRequest
        ): Promise<RuntimeTransportResponse> {
            if (snapshot.state !== "connected") {
                return createErrorResponse(
                    request,
                    "WebR direct browser runtime transport is not connected."
                );
            }

            return handleWebRRuntimeTransportRequest(runtime, request);
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
