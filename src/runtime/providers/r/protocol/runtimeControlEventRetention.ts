// The same retention failure survives each host's physical transport boundary.
export class RuntimeControlEventRetentionError extends Error {
    constructor(message: "runtime-session-event-retention-limit" | "runtime-session-invalid-event-encoding") {
        super(message);
        this.name = "RuntimeControlEventRetentionError";
    }
}


export interface RuntimeControlEventBudget {
    check(events: unknown[]): void;
}


export const createRuntimeControlEventRetention = function(options: {
    maxRetainedEventBytes?: number;
    maxRetainedEvents?: number;
} = {}) {
    const maxBytes = options.maxRetainedEventBytes ?? 16 * 1024 * 1024;
    const maxEvents = options.maxRetainedEvents ?? 10000;
    for (const limit of [maxBytes, maxEvents]) {
        if (!Number.isSafeInteger(limit) || limit < 1) {
            throw new Error("Runtime retention limits must be positive safe integers.");
        }
    }
    const encoder = new TextEncoder();

    const check = function(events: unknown[], retainedCount = 0, retainedBytes = 0): number {
        if (retainedCount + events.length > maxEvents) {
            throw new RuntimeControlEventRetentionError("runtime-session-event-retention-limit");
        }
        let bytes = retainedBytes;
        for (const event of events) {
            let encoded: string | undefined;
            try {
                encoded = JSON.stringify(event);
            } catch {
                throw new RuntimeControlEventRetentionError("runtime-session-invalid-event-encoding");
            }
            if (encoded === undefined) {
                throw new RuntimeControlEventRetentionError("runtime-session-invalid-event-encoding");
            }
            bytes += encoder.encode(encoded).byteLength;
            if (bytes > maxBytes) {
                throw new RuntimeControlEventRetentionError("runtime-session-event-retention-limit");
            }
        }
        return bytes;
    };

    return {
        check,
        createRequestBudget: function(): RuntimeControlEventBudget {
            let count = 0;
            let bytes = 0;

            return {
                check: function(events): void {
                    const acceptedBytes = check(events, count, bytes);
                    count += events.length;
                    bytes = acceptedBytes;
                }
            };
        }
    };
};
