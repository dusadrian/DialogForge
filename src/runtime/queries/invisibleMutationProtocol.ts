import type { InvisibleMutationRequest, InvisibleMutationResult } from "../provider-contract/runtimeProvider";


export const createInvisibleMutationRequest = function(input: Partial<InvisibleMutationRequest>): InvisibleMutationRequest {
    return {
        mutation: String(input && input.mutation ? input.mutation : ""),
        value: input && input.value !== undefined ? input.value : null,
        source: String(input && input.source ? input.source : "base-app.mutation")
    };
};


export const createInvisibleMutationResult = function(input: Partial<InvisibleMutationResult>): InvisibleMutationResult {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        mutation: input.mutation || "",
        value: input.value === undefined ? null : input.value,
        message: input.message || "",
        mutatedAt: new Date().toISOString()
    };
};
