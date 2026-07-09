import type {
    RuntimeTransportController,
    RuntimeTransportEvent,
    RuntimeTransportKind,
    RuntimeTransportRequest,
    RuntimeTransportResponse,
    RuntimeTransportSnapshot
} from "./runtimeTransport";
import { createRuntimeTransportSnapshot } from "./runtimeTransport";


export interface ReservedRuntimeTransportOptions {
    providerId: string;
    kind: RuntimeTransportKind;
    endpoint?: string;
    message: string;
}


const createRejectedResponse = function(
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


export const createReservedRuntimeTransport = function(
    options: ReservedRuntimeTransportOptions
): RuntimeTransportController {
    let snapshot = createRuntimeTransportSnapshot({
        providerId: options.providerId,
        kind: options.kind,
        state: "disconnected",
        endpoint: options.endpoint || "",
        message: options.message
    });

    const updateSnapshot = function(
        state: RuntimeTransportSnapshot["state"],
        message: string
    ): RuntimeTransportSnapshot {
        snapshot = createRuntimeTransportSnapshot({
            providerId: options.providerId,
            kind: options.kind,
            state,
            endpoint: options.endpoint || "",
            message
        });

        return snapshot;
    };

    return {
        getSnapshot: function(): RuntimeTransportSnapshot {
            return snapshot;
        },
        connect: async function(): Promise<RuntimeTransportSnapshot> {
            return updateSnapshot(
                "failed",
                `${options.providerId} transport is reserved and not implemented yet.`
            );
        },
        disconnect: async function(): Promise<RuntimeTransportSnapshot> {
            return updateSnapshot(
                "disconnected",
                `${options.providerId} transport is disconnected.`
            );
        },
        sendRequest: async function(
            request: RuntimeTransportRequest
        ): Promise<RuntimeTransportResponse> {
            return createRejectedResponse(
                request,
                `${options.providerId} transport cannot send requests yet.`
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
