import type { InvisibleQueryRequest, InvisibleQueryResult } from "../provider-contract/runtimeProvider";


export const createInvisibleQueryRequest = function(input: Partial<InvisibleQueryRequest>): InvisibleQueryRequest {
    return {
        query: String(input && input.query ? input.query : ""),
        source: String(input && input.source ? input.source : "base-app.query")
    };
};


export const createInvisibleQueryResult = function(input: Partial<InvisibleQueryResult>): InvisibleQueryResult {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        query: input.query || "",
        value: input.value === undefined ? null : input.value,
        message: input.message || "",
        queriedAt: new Date().toISOString()
    };
};
