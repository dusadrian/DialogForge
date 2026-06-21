import type { RuntimeEventRecord, RuntimeEventSnapshot } from "../provider-contract/runtimeProvider";


export const createRuntimeEvent = function(input: Partial<RuntimeEventRecord>): RuntimeEventRecord {
    return {
        type: input.type || "unknown",
        providerId: input.providerId || "",
        objectName: input.objectName || "",
        detail: input.detail || "",
        payload: input.payload || {},
        createdAt: input.createdAt || new Date().toISOString()
    };
};


export const createRuntimeEventSnapshot = function(input: Partial<RuntimeEventSnapshot>): RuntimeEventSnapshot {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        events: input.events || [],
        message: input.message || "",
        refreshedAt: new Date().toISOString()
    };
};
