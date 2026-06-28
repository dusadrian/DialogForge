import type {
    RuntimeLifecycleController,
    RuntimeSessionSnapshot
} from "../../provider-contract/runtimeProvider";
import type {
    RuntimeTransportController,
    RuntimeTransportSnapshot
} from "../../transport/runtimeTransport";


const createSessionFromTransport = function(
    snapshot: RuntimeSessionSnapshot,
    transport: RuntimeTransportSnapshot
): RuntimeSessionSnapshot {
    if (transport.state === "connected") {
        return {
            providerId: snapshot.providerId,
            status: "ready",
            connection: transport.state,
            message: transport.message || "WebR runtime is ready.",
            transport
        };
    }

    if (transport.state === "failed") {
        return {
            providerId: snapshot.providerId,
            status: "failed",
            connection: transport.state,
            message: transport.message || "WebR runtime failed to start.",
            transport
        };
    }

    return {
        providerId: snapshot.providerId,
        status: "starting",
        connection: transport.state,
        message: transport.message || "WebR runtime is starting.",
        transport
    };
};


export const createWebRLifecycleController = function(
    transport: RuntimeTransportController
): RuntimeLifecycleController {
    return {
        start: async function(
            snapshot: RuntimeSessionSnapshot
        ): Promise<RuntimeSessionSnapshot> {
            const transportSnapshot = await transport.connect();

            return createSessionFromTransport(snapshot, transportSnapshot);
        },
        stop: async function(
            snapshot: RuntimeSessionSnapshot
        ): Promise<RuntimeSessionSnapshot> {
            const transportSnapshot = await transport.disconnect();

            return {
                providerId: snapshot.providerId,
                status: "stopped",
                connection: transportSnapshot.state,
                message: transportSnapshot.message || "WebR runtime is stopped.",
                transport: transportSnapshot
            };
        }
    };
};
