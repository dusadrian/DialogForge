import type { WebR } from "webr";
import {
    mountBrowserProductPackageLibrary,
    prepareBrowserProductPackageLibrary,
    type BrowserPackageLibraryManifest,
    type PreparedBrowserPackageLibrary
} from "../runtime/providers/webr/webRBrowserPackageLibraryAdapter";
import {
    webRPackageLibraryProgressStages,
    type WebRPackageLibraryProgress
} from "../runtime/providers/webr/webRPackageLibraryPolicy";
import type {
    BrowserRuntimeProgressActivity,
    BrowserRuntimeProgressController
} from "./browserRuntimeProgressAdapter";

export interface BrowserDeferredPackageLibrary {
    schedulePrefetch(): void;
    ensureMounted(): Promise<void>;
    dispose(): void;
}

export const createBrowserDeferredPackageLibrary = function(options: {
    runtime: WebR;
    manifest: BrowserPackageLibraryManifest;
    progress: BrowserRuntimeProgressController;
    canPrefetch(): boolean;
}): BrowserDeferredPackageLibrary {
    let preparation: Promise<PreparedBrowserPackageLibrary> | null = null;
    let mounting: Promise<void> | null = null;
    let mounted = false;
    let disposed = false;
    let timer = 0;
    let idleCallback = 0;
    let listening = false;
    let activity: BrowserRuntimeProgressActivity | null = null;
    let latestMessage = "Preparing R packages...";
    let latestProgress: number | undefined;

    const progress: WebRPackageLibraryProgress = {
        setStatus(message, value) {
            latestMessage = message;
            latestProgress = value;
            activity?.update(message, value);
        },
        progressFromStage(message, fraction = 0) {
            const amount = Math.max(0, Math.min(1, fraction));
            switch (message) {
                case webRPackageLibraryProgressStages.downloading:
                    return 5 + 75 * amount;
                case webRPackageLibraryProgressStages.decompressing:
                    return 80 + 10 * amount;
                case webRPackageLibraryProgressStages.caching:
                    return 90 + 5 * amount;
                case webRPackageLibraryProgressStages.loadingCache:
                    return 5 + 90 * amount;
                default:
                    return 5;
            }
        }
    };

    const prepare = function(): Promise<PreparedBrowserPackageLibrary> {
        if (!preparation) {
            latestMessage = "Preparing R packages...";
            latestProgress = undefined;
            preparation = prepareBrowserProductPackageLibrary(options.manifest, progress)
                .catch((error) => {
                    preparation = null;
                    throw error;
                });
        }
        return preparation;
    };

    const cancelScheduledPrefetch = function(): void {
        window.clearTimeout(timer);
        timer = 0;
        if (idleCallback) {
            window.cancelIdleCallback(idleCallback);
            idleCallback = 0;
        }
    };

    const stopScheduling = function(): void {
        cancelScheduledPrefetch();
        if (listening) {
            for (const event of ["keydown", "pointerdown", "wheel", "online"]) {
                window.removeEventListener(event, schedulePrefetch, true);
            }
            document.removeEventListener("visibilitychange", schedulePrefetch);
            listening = false;
        }
    };

    const prefetchWhenIdle = function(): void {
        idleCallback = 0;
        if (disposed || preparation || mounted) {
            return;
        }
        if (
            !navigator.onLine
            || !options.canPrefetch()
        ) {
            schedulePrefetch();
            return;
        }
        stopScheduling();
        // Only prepare/cache bytes here. R mounting remains inside the shared
        // runtime operation queue when an action actually needs the library.
        void prepare().catch(() => {
            // An opportunistic failure must not block the app or loop downloads.
            // The next explicit action retries and reports any failure normally.
        });
    };

    const schedulePrefetch = function(): void {
        if (disposed || preparation || mounted) {
            return;
        }
        cancelScheduledPrefetch();
        if (!listening) {
            for (const event of ["keydown", "pointerdown", "wheel", "online"]) {
                window.addEventListener(event, schedulePrefetch, { capture: true, passive: true });
            }
            document.addEventListener("visibilitychange", schedulePrefetch);
            listening = true;
        }
        timer = window.setTimeout(() => {
            timer = 0;
            if (!document.hidden && typeof window.requestIdleCallback === "function") {
                idleCallback = window.requestIdleCallback(prefetchWhenIdle);
            }
            else {
                // Hidden documents may never receive an idle callback. Their
                // background transfer is still useful and does not touch R.
                prefetchWhenIdle();
            }
        }, 3000);
    };

    return {
        schedulePrefetch,
        ensureMounted() {
            if (disposed) {
                return Promise.reject(new Error("The R session was stopped."));
            }
            if (mounted) {
                return Promise.resolve();
            }
            if (!mounting) {
                stopScheduling();
                mounting = (async () => {
                    activity = options.progress.beginProgressActivity(latestMessage);
                    activity.update(latestMessage, latestProgress);
                    try {
                        const prepared = await prepare();
                        if (disposed) {
                            throw new Error("The R session was stopped.");
                        }
                        activity?.update("Preparing R packages...", 95);
                        await mountBrowserProductPackageLibrary(
                            options.runtime, options.manifest,
                            {
                                setStatus() {},
                                progressFromStage() { return 95; }
                            },
                            prepared
                        );
                        mounted = true;
                    }
                    finally {
                        activity?.end();
                        activity = null;
                    }
                })().catch((error) => {
                    mounting = null;
                    throw error;
                });
            }
            return mounting;
        },
        dispose() {
            disposed = true;
            stopScheduling();
            activity?.end();
            activity = null;
        }
    };
};
