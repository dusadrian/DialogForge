import type {
    RRuntimeControlRequest,
    RRuntimeControlResponse,
    RRuntimeControlDispatchOptions
} from "./runtimeControlClient";


export const readRuntimeControlRequestTimeout = function(
    value: unknown,
    fallback: number | null
): number | null {
    const requested = Number(value);
    if (!Number.isFinite(requested) || requested <= 0) {
        return fallback;
    }

    // Leave room for the response deadline's 120ms grace within JS timer limits.
    return Math.min(2147483527, Math.max(250, requested));
};


export const executeRuntimeControlRequestWithDeadline = function(
    request: RRuntimeControlRequest,
    execute: (dispatch: RRuntimeControlDispatchOptions) => Promise<RRuntimeControlResponse>,
    dispatchOptions?: RRuntimeControlDispatchOptions,
    timedOut?: () => void,
    retirement?: {
        subscribe(listener: (error: string) => void): () => void;
        readEvents?(): unknown[];
    }
): Promise<RRuntimeControlResponse> {
    return new Promise<RRuntimeControlResponse>((resolve, reject) => {
        const requestId = request.id;
        const requestMethod = request.method;
        const timeout = readRuntimeControlRequestTimeout(
            request.params?.timeoutMs, requestMethod === "execute_input" ? null : 2500
        );
        let timer: ReturnType<typeof setTimeout> | null = null;
        let dispatched = false;
        let settled = false;
        let executionEntered = false;
        let receivedEvents: unknown[] | null = null;
        let unsubscribeRetirement: (() => void) | null = null;
        const clearDeadline = function(): void {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            unsubscribeRetirement?.();
            unsubscribeRetirement = null;
        };
        unsubscribeRetirement = retirement?.subscribe(function(error): void {
            if (settled) {
                return;
            }
            settled = true;
            clearDeadline();
            resolve({
                id: requestId, method: requestMethod, ok: false,
                transportFailure: true,
                error: executionEntered ? error : "runtime-session-detached",
                ...(receivedEvents !== null ? { events: receivedEvents.slice() }
                    : retirement.readEvents ? { events: retirement.readEvents() } : {})
            });
        }) || null;
        if (settled) {
            clearDeadline();
            return;
        }
        const dispatch: RRuntimeControlDispatchOptions = {
            ...dispatchOptions,
            onResponseReceived: function(response): void {
                if (
                    settled
                    || response.id !== requestId
                    || response.method !== requestMethod
                ) {
                    return;
                }

                // Validation is known before output delivery completes. Keep
                // its independent facts even if delivery times out or retires.
                receivedEvents = Array.isArray(response.events) ? response.events.slice() : [];
                dispatchOptions?.onResponseReceived?.(response);
            },
            onDispatched: function(): void {
                if (settled) {
                    return;
                }
                if (!dispatched && !settled) {
                    dispatched = true;
                    if (timeout !== null) {
                        timer = setTimeout(() => {
                            timer = null;
                            settled = true;
                            clearDeadline();
                            resolve({
                                id: requestId, method: requestMethod, ok: false,
                                error: "runtime-session-timeout",
                                ...(receivedEvents !== null ? { events: receivedEvents.slice() } : {})
                            });
                            try {
                                timedOut?.();
                            } catch {
                                // Diagnostics must not replace the timeout outcome.
                            }
                        }, timeout + 120);
                    }
                }
                dispatchOptions?.onDispatched?.();
            }
        };
        // A deadline only returns an outcome. The adapter retains channel ownership
        // through its late response, cleanup and admission release barrier.
        let execution: Promise<RRuntimeControlResponse>;
        try {
            // Admission and payload capture must happen before returning to callers.
            executionEntered = true;
            execution = execute(dispatch);
        } catch (error) {
            settled = true;
            clearDeadline();
            reject(error);
            return;
        }
        Promise.resolve(execution).then((response) => {
            settled = true;
            clearDeadline();
            if (
                receivedEvents !== null
                && response.id === requestId
                && response.method === requestMethod
                && response.ok === false
                && response.events === undefined
            ) {
                resolve({ ...response, events: receivedEvents.slice() });
                return;
            }
            resolve(response);
        }, (error) => {
            settled = true;
            clearDeadline();
            reject(error);
        });
    });
};
