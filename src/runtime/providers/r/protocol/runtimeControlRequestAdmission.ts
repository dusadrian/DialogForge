export const createRuntimeControlRequestAdmission = function(maxOutstandingRequests = 64) {
    if (!Number.isSafeInteger(maxOutstandingRequests) || maxOutstandingRequests < 1) {
        throw new Error("Runtime request capacity must be a positive safe integer.");
    }

    const admittedIds = new Set<string>();
    const admittedReplyIds = new Set<string>();
    const releases = new Map<string, { promise: Promise<void>; resolve(): void }>();
    const retirementListeners = new Set<(error: string) => void>();
    let retired = false;
    let retirementError = "runtime-session-detached";

    const releaseRequest = function(id: string): void {
        releases.get(id)?.resolve();
        releases.delete(id);
        admittedIds.delete(id);
        admittedReplyIds.delete(id);
    };

    const retire = function(error = "runtime-session-detached"): void {
        if (retired) {
            return;
        }
        retired = true;
        retirementError = error;
        for (const listener of retirementListeners) {
            listener(error);
        }
        retirementListeners.clear();
        for (const release of releases.values()) {
            release.resolve();
        }
        releases.clear();
        admittedIds.clear();
        admittedReplyIds.clear();
    };

    return {
        admit: function(request: { id: unknown; method: unknown }): string | null {
            if (retired) {
                return "runtime-session-detached";
            }
            if (
                typeof request.id !== "string" || !request.id
                || typeof request.method !== "string" || !request.method
                || admittedIds.has(request.id)
            ) {
                return "runtime-session-invalid-or-duplicate-request";
            }

            const reply = request.method === "reply_prompt";
            if (
                (reply && admittedReplyIds.size >= 1)
                || (!reply && admittedIds.size - admittedReplyIds.size >= maxOutstandingRequests)
            ) {
                return "runtime-session-request-capacity";
            }

            admittedIds.add(request.id);
            let resolveRelease!: () => void;
            const promise = new Promise<void>((resolve) => {
                resolveRelease = resolve;
            });
            releases.set(request.id, { promise, resolve: resolveRelease });
            if (reply) {
                // Keep one answer available when ordinary requests saturate the queue.
                admittedReplyIds.add(request.id);
            }
            return null;
        },
        release: releaseRequest,
        releaseAfterResponseDelivery: function(
            id: string,
            waitForDelivery?: () => Promise<void>,
            deliveryFailed?: (error: string) => void
        ): void {
            const capturedRelease = releases.get(id);
            if (!capturedRelease) {
                return;
            }
            const releaseCapturedRequest = function(): void {
                if (!retired && releases.get(id) === capturedRelease) {
                    releaseRequest(id);
                }
            };
            if (!waitForDelivery) {
                releaseCapturedRequest();
                return;
            }
            // Return the response to its consumer, retaining admission and the
            // queue release barrier until that consumer finishes delivery.
            void Promise.resolve().then(waitForDelivery).then(releaseCapturedRequest).catch(() => {
                if (!retired && capturedRelease && releases.get(id) === capturedRelease) {
                    const error = "runtime-session-response-delivery-failed";
                    retire(error);
                    deliveryFailed?.(error);
                }
            });
        },
        waitForRelease: function(id: string): Promise<void> {
            return releases.get(id)?.promise || Promise.resolve();
        },
        subscribeRetirement: function(listener: (error: string) => void): () => void {
            if (retired) {
                listener(retirementError);
                return () => {};
            }
            retirementListeners.add(listener);
            return () => { retirementListeners.delete(listener); };
        },
        retire
    };
};
