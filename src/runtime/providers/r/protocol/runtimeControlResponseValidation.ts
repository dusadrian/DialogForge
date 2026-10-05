import type { RRuntimeControlRequest, RRuntimeControlResponse } from "./runtimeControlClient";


export const maximumRuntimeControlFrameBytes = 16 * 1024 * 1024;


// Physical adapters use this type when response bytes cannot be read. Ordinary
// R rejection and optional cleanup failures are not transport loss.
export class RuntimeControlTransportError extends Error {
    constructor(cause: unknown, fallback: string) {
        const message = cause instanceof Error && cause.message.startsWith("runtime-session-")
            ? cause.message : fallback;

        super(message, { cause });
    }
}


export const checkRuntimeControlFrameByteLength = function(
    byteLength: unknown,
    maxFrameBytes = maximumRuntimeControlFrameBytes
): void {
    if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 512) {
        throw new Error("Runtime frame limit must be an integer of at least 512 bytes.");
    }
    if (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength < 0) {
        throw new RuntimeControlTransportError(null, "runtime-session-invalid-frame-size");
    }
    if (byteLength > maxFrameBytes) {
        throw new RuntimeControlTransportError(null, "runtime-session-frame-too-large");
    }
};


export const decodeRuntimeControlFrameBytes = function(
    bytes: Uint8Array,
    maxFrameBytes = maximumRuntimeControlFrameBytes
): string {
    checkRuntimeControlFrameByteLength(bytes.byteLength, maxFrameBytes);

    try {
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    }
    catch (error) {
        throw new RuntimeControlTransportError(error, "runtime-session-frame-encoding-invalid");
    }
};


// Socket and worker adapters resolve the physical sender. Event shape and
// active-command ownership are checked here, before either publishes effects.
export const readRuntimeControlEventError = function(
    value: unknown,
    request?: Pick<RRuntimeControlRequest, "method" | "params">,
    live = false
): string | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return "runtime-session-invalid-event-envelope";
    }
    const event = value as Record<string, unknown>;
    if (
        typeof event.type !== "string" || !event.type
        || (event.id !== undefined && typeof event.id !== "string")
        || (event.parent_id !== undefined && typeof event.parent_id !== "string")
    ) {
        return "runtime-session-invalid-event-envelope";
    }
    if (
        event.type === "prompt"
        && (typeof event.id !== "string" || !event.id
            || typeof event.parent_id !== "string" || !event.parent_id
            || typeof event.prompt !== "string" || typeof event.password !== "boolean")
    ) {
        return "runtime-session-invalid-event-envelope";
    }
    if (request) {
        // Activity identities are opaque; the shared R producer preserves them.
        const parentId = String(request.params?.parentId || "");
        if (event.parent_id && event.parent_id !== parentId) {
            return "runtime-session-event-identity-mismatch";
        }
        if (live && request.method !== "execute_input" && request.method !== "reply_prompt") {
            return "runtime-session-event-request-mode-mismatch";
        }
    }
    return null;
};


export const readRuntimeControlResponseError = function(
    value: unknown,
    request: Pick<RRuntimeControlRequest, "id" | "method" | "transportNonce" | "params">,
    requireTransportNonce = false
): string | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return "runtime-session-response-mismatch";
    }

    const response = value as Record<string, unknown>;
    if (
        response.id !== request.id || response.method !== request.method
        || typeof response.ok !== "boolean"
    ) {
        return "runtime-session-response-mismatch";
    }
    if (
        requireTransportNonce
        && (typeof request.transportNonce !== "string" || !request.transportNonce
            || response.transportNonce !== request.transportNonce)
    ) {
        return "runtime-session-response-identity-mismatch";
    }
    if (response.events !== undefined && !Array.isArray(response.events)) {
        return "runtime-session-invalid-response-events";
    }
    for (const event of Array.isArray(response.events) ? response.events : []) {
        const eventError = readRuntimeControlEventError(event, request);
        if (eventError) {
            return eventError;
        }
    }
    if (
        (response.completionFailure !== undefined && typeof response.completionFailure !== "boolean")
        || (response.completionFailure === true && response.ok === true)
    ) {
        return "runtime-session-response-mismatch";
    }
    return null;
};


export const createValidatedRuntimeControlResponse = function(
    response: Record<string, unknown>,
    retainedEvents?: unknown[]
): RRuntimeControlResponse {
    return {
        id: String(response.id),
        method: String(response.method),
        ok: response.ok === true,
        result: response.result,
        error: response.error ? String(response.error) : undefined,
        mode: response.mode ? String(response.mode) : undefined,
        events: retainedEvents || (Array.isArray(response.events) ? response.events : []),
        ...(response.completionFailure === true ? { completionFailure: true } : {})
    };
};
