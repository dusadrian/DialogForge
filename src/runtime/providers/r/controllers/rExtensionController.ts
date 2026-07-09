import { createRuntimeExtensionMethodResult } from "../../../extensions/runtimeExtensionProtocol";
import type {
    RuntimeExtensionController
} from "../../../provider-contract/runtimeProvider";
import { createRuntimeControlClient } from "../protocol/runtimeControlClient";


type RuntimeControlClient = ReturnType<typeof createRuntimeControlClient>;


export interface RExtensionControllerOptions {
    getClient(): RuntimeControlClient | null;
    createRequestId(prefix: string): string;
    interrupt(): boolean | null;
}


export const createRExtensionController = function(
    options: RExtensionControllerOptions
): RuntimeExtensionController {
    return {
        executeRuntimeMethod: async function(request, snapshot) {
            if (request.method === "runtime.interrupt") {
                const signalled = options.interrupt();

                if (signalled === null) {
                    return createRuntimeExtensionMethodResult({
                        status: "unavailable",
                        providerId: snapshot.providerId,
                        method: request.method,
                        message: "R runtime process is not running."
                    });
                }

                return createRuntimeExtensionMethodResult({
                    status: signalled ? "ready" : "failed",
                    providerId: snapshot.providerId,
                    method: request.method,
                    value: signalled,
                    message: signalled
                        ? "R runtime process was sent SIGINT."
                        : "R runtime process did not accept SIGINT."
                });
            }

            const client = options.getClient();

            if (!client) {
                return createRuntimeExtensionMethodResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    method: request.method,
                    message: "R runtime-control session is not attached."
                });
            }

            const result = await client.execute({
                id: options.createRequestId("runtime-extension"),
                method: request.method,
                params: Object.assign({}, request.params, {
                    timeoutMs: Number(request.params.timeoutMs || 10000)
                })
            });

            return createRuntimeExtensionMethodResult({
                status: result.ok ? "ready" : "failed",
                providerId: snapshot.providerId,
                method: request.method,
                value: result.ok ? result.result : null,
                message: result.ok
                    ? "R runtime-control resolved the runtime extension method."
                    : String(
                        result.error
                        || "R runtime extension method failed."
                    )
            });
        }
    };
};
