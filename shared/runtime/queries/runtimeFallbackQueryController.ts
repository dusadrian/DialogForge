import type {
    RuntimeQueryController
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeInvisibleMutationState
} from "../session/runtimeInvisibleMutationState";
import { createInvisibleMutationResult } from "./invisibleMutationProtocol";
import { createInvisibleQueryResult } from "./invisibleQueryProtocol";


export interface RuntimeFallbackQueryControllerOptions {
    mutationState: RuntimeInvisibleMutationState;
    getWorkspaceObjectCount(): number;
}


export const createRuntimeFallbackQueryController = function(
    options: RuntimeFallbackQueryControllerOptions
): RuntimeQueryController {
    return {
        executeInvisibleQuery: async function(request, snapshot) {
            return createInvisibleQueryResult({
                status: "ready",
                providerId: snapshot.providerId,
                query: request.query,
                value: {
                    query: request.query,
                    workspaceObjects: options.getWorkspaceObjectCount(),
                    mutations: options.mutationState.read()
                },
                message: "Placeholder invisible query resolved. No command was added to transcript history."
            });
        },
        executeInvisibleMutation: async function(request, snapshot) {
            options.mutationState.write(request.mutation, request.value);

            return createInvisibleMutationResult({
                status: "updated",
                providerId: snapshot.providerId,
                mutation: request.mutation,
                value: request.value,
                message: "Placeholder invisible mutation updated session state. No command was added to transcript history."
            });
        }
    };
};
