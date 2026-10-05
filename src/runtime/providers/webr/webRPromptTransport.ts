import {
    encodeRuntimeControlRequest
} from "../r/protocol/runtimeControlRequestEncoding";
import type {
    RRuntimeControlRequest,
    RRuntimeControlResponse,
    RRuntimeControlDispatchOptions
} from "../r/protocol/runtimeControlClient";
import {
    readRuntimeControlResponseError,
    readRuntimeControlEventError,
    createValidatedRuntimeControlResponse,
    RuntimeControlTransportError
} from "../r/protocol/runtimeControlResponseValidation";
import { readRuntimeControlRequestTimeout } from "../r/protocol/runtimeControlRequestDeadline";


export interface WebRPromptInputTransport {
    writeConsole?(input: string): void | Promise<void>;
}


export const readWebRPromptEvent = function(
    value: unknown,
    request?: RRuntimeControlRequest
): Record<string, unknown> | null {
    const text = String(value || "");
    const prefix = "DIALOGFORGE_PROMPT1:";

    if (!text.startsWith(prefix)) {
        return null;
    }

    const event: unknown = JSON.parse(text.slice(prefix.length));
    const eventError = readRuntimeControlEventError(event, request, Boolean(request));
    if (eventError) {
        throw new RuntimeControlTransportError(null, eventError);
    }
    const record = event as Record<string, unknown>;
    if (record.type !== "prompt") {
        throw new Error("Invalid runtime worker prompt identity.");
    }

    return record;
};


export const createWebRPromptTransport = function(
    runtime: WebRPromptInputTransport,
    responseReceived?: (request: RRuntimeControlRequest, response: RRuntimeControlResponse) => void
) {
    let attached = true;
    let waitingForInput = false;
    const pending = new Map<string, {
        request: RRuntimeControlRequest;
        timer: ReturnType<typeof setTimeout>;
        resolve(response: RRuntimeControlResponse): void;
    }>();

    const finish = function(id: string, response: RRuntimeControlResponse): void {
        const entry = pending.get(id);
        if (!entry) {
            return;
        }
        pending.delete(id);
        clearTimeout(entry.timer);
        entry.resolve(response);
    };
    const fail = function(request: RRuntimeControlRequest, error: string): void {
        finish(request.id, {
            id: request.id, method: request.method,
            ok: false, transportFailure: true, error
        });
    };

    return {
        send: async function(
            request: RRuntimeControlRequest,
            dispatchOptions?: RRuntimeControlDispatchOptions
        ): Promise<RRuntimeControlResponse> {
            if (!attached || !runtime.writeConsole || pending.has(request.id)) {
                return {
                    id: request.id, method: request.method,
                    ok: false, transportFailure: true,
                    error: "runtime-worker-input-unavailable"
                };
            }
            if (!waitingForInput || request.method !== "reply_prompt") {
                return {
                    id: request.id, method: request.method,
                    ok: false, requestRejected: true, error: "runtime-worker-not-waiting-for-input"
                };
            }
            waitingForInput = false;
            const timeoutMs = readRuntimeControlRequestTimeout(request.params?.timeoutMs, 10000) ?? 10000;
            const response = new Promise<RRuntimeControlResponse>((resolve) => {
                const timer = setTimeout(() => {
                    fail(request, "runtime-worker-input-acknowledgment-timeout");
                }, timeoutMs);
                pending.set(request.id, { request, timer, resolve });
            });
            try {
                dispatchOptions?.onDispatched?.();
                const written = runtime.writeConsole(encodeRuntimeControlRequest(request));
                void Promise.resolve(written).catch((error: unknown) => {
                    fail(request, error instanceof Error ? error.message : String(error));
                });
            }
            catch (error) {
                fail(request, error instanceof Error ? error.message : String(error));
            }
            return response;
        },
        receive: function(value: unknown): void {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                return;
            }
            const response = value as RRuntimeControlResponse;
            const entry = pending.get(response.id);
            if (!entry) {
                return;
            }
            const responseError = readRuntimeControlResponseError(response, entry.request);
            if (responseError) {
                fail(entry.request, responseError);
                return;
            }
            responseReceived?.(entry.request, response);
            finish(response.id, createValidatedRuntimeControlResponse(value as Record<string, unknown>));
        },
        receivePrompt: function(value: unknown, request?: RRuntimeControlRequest): Record<string, unknown> | null {
            const event = readWebRPromptEvent(value, request);
            if (attached && event) {
                waitingForInput = true;
            }
            return attached ? event : null;
        },
        finishActivity: function(parentId: string): void {
            waitingForInput = false;
            for (const entry of pending.values()) {
                if (entry.request.params?.parentId === parentId) {
                    fail(entry.request, "runtime-worker-input-activity-finished");
                }
            }
        },
        retire: function(): void {
            attached = false;
            waitingForInput = false;
            for (const entry of pending.values()) {
                fail(entry.request, "runtime-session-detached");
            }
        }
    };
};
