// Both hosts use the same deadline when waiting for a relay to become usable.
// A missing network must leave the existing Share panel with a retryable error.
export const waitForLiveScriptTransportReady = async function<T>(
    operation: Promise<T>,
    timeoutMs = 20_000
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            operation,
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => {
                    reject(new Error(
                        "Live-script sharing could not reach the relay. Check your connection and try again."
                    ));
                }, timeoutMs);
            })
        ]);
    }
    finally {
        clearTimeout(timer);
    }
};
