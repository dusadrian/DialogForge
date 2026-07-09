import { createInvisibleMutationResult } from "../../../queries/invisibleMutationProtocol";
import { createInvisibleQueryResult } from "../../../queries/invisibleQueryProtocol";
import type {
    RuntimeQueryController
} from "../../../provider-contract/runtimeProvider";
import { createRuntimeControlClient } from "../protocol/runtimeControlClient";
import { rLiteral, rName, rString } from "../commands/rLiteral";


type RuntimeControlClient = ReturnType<typeof createRuntimeControlClient>;


export interface RQueryControllerOptions {
    getClient(): RuntimeControlClient | null;
    createRequestId(prefix: string): string;
}


export const createRQueryController = function(
    options: RQueryControllerOptions
): RuntimeQueryController {
    return {
        executeInvisibleQuery: async function(request, snapshot) {
            const client = options.getClient();

            if (!client) {
                return createInvisibleQueryResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    query: request.query,
                    message: "R runtime-control session is not attached."
                });
            }

            const result = await client.execute({
                id: options.createRequestId("invisible-query"),
                method: "evaluate_code",
                params: {
                    code: request.query,
                    mode: "silent",
                    timeoutMs: 10000
                }
            });

            return createInvisibleQueryResult({
                status: result.ok ? "ready" : "failed",
                providerId: snapshot.providerId,
                query: request.query,
                value: result.ok ? result.result : null,
                message: result.ok
                    ? "R runtime-control resolved the invisible query without visible transcript history."
                    : String(result.error || "R invisible query failed.")
            });
        },
        executeInvisibleMutation: async function(request, snapshot) {
            const client = options.getClient();

            if (!client) {
                return createInvisibleMutationResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    mutation: request.mutation,
                    value: request.value,
                    message: "R runtime-control session is not attached."
                });
            }

            const name = rName(request.mutation);

            if (!name) {
                return createInvisibleMutationResult({
                    status: "invalid",
                    providerId: snapshot.providerId,
                    mutation: request.mutation,
                    value: request.value,
                    message: "Invisible mutation name is not a valid R object name."
                });
            }

            const result = await client.execute({
                id: options.createRequestId("invisible-mutation"),
                method: "evaluate_code",
                params: {
                    code: `assign(${rString(name)}, ${rLiteral(request.value)}, envir = .GlobalEnv)`,
                    mode: "silent",
                    timeoutMs: 10000
                }
            });

            return createInvisibleMutationResult({
                status: result.ok ? "updated" : "failed",
                providerId: snapshot.providerId,
                mutation: request.mutation,
                value: request.value,
                message: result.ok
                    ? "R runtime-control applied the invisible mutation without visible transcript history."
                    : String(result.error || "R invisible mutation failed.")
            });
        }
    };
};
