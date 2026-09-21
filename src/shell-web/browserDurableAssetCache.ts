// Registers the shell's asset service worker and asks the browser to keep its
// storage. The HTTP cache alone is best-effort: it is evicted under storage
// pressure, so the multi-megabyte WebR runtime and package library can vanish
// without the user clearing anything. Cache Storage backed by granted
// persistent storage is exempt from that automatic eviction.

const requestPersistentStorage = async function(): Promise<void> {
    if (!navigator.storage?.persist || !navigator.storage.persisted) {
        return;
    }

    try {
        if (await navigator.storage.persisted()) {
            return;
        }

        await navigator.storage.persist();
    }
    catch (error) {
        // Persistence is a request, not a guarantee. A refusal only means the
        // cache stays evictable, which is the behaviour without it anyway.
    }
};

// Start registration during shell evaluation. Runtime startup awaits control
// briefly so the first visit can populate the durable cache too.
export const startBrowserDurableAssetCache = async function(): Promise<void> {
    if (!("serviceWorker" in navigator)) {
        return;
    }

    const registration = (async function() {
        try {
            await navigator.serviceWorker.register("/sw.js");
            void requestPersistentStorage();
            if (!navigator.serviceWorker.controller) {
                await new Promise<void>((resolve) => {
                    const finish = function(): void {
                        clearTimeout(timeout);
                        navigator.serviceWorker.removeEventListener("controllerchange", finish);
                        resolve();
                    };
                    const timeout = setTimeout(finish, 1500);
                    navigator.serviceWorker.addEventListener("controllerchange", finish);
                    if (navigator.serviceWorker.controller) {
                        finish();
                    }
                });
            }
        }
        catch (error) {
            // The shell works without a durable cache; it just re-downloads
            // the runtime whenever the HTTP cache loses it.
            console.warn("SHELL-WARN durable asset cache unavailable", error);
        }
    })();
    // Registration can stall in restricted browsing modes. Caching must never
    // prevent the application from starting.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
        registration,
        new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, 1500);
        })
    ]);
    clearTimeout(timeout);
};
