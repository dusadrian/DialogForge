import type {
    ProductCommandRequest,
    ProductCommandResult
} from "../provider-contract/runtimeProvider";


export const createProductCommandRequest = function(input: Partial<ProductCommandRequest>): ProductCommandRequest {
    return {
        productId: String(input.productId || ""),
        command: String(input.command || ""),
        label: String(input.label || ""),
        capability: String(input.capability || ""),
        rPackages: Array.isArray(input.rPackages) ? input.rPackages.map(String).filter(Boolean) : [],
        source: String(input.source || "base-app.product-command")
    };
};


export const createProductCommandResult = function(input: Partial<ProductCommandResult>): ProductCommandResult {
    return {
        status: String(input.status || "unknown"),
        providerId: String(input.providerId || ""),
        productId: String(input.productId || ""),
        command: String(input.command || ""),
        transcriptEvents: input.transcriptEvents || [],
        message: String(input.message || ""),
        executedAt: new Date().toISOString()
    };
};
