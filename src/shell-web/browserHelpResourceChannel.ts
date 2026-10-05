import type { createRHelpPageReader } from "../runtime/help/rHelpPageReader";


export interface BrowserHelpResourceChannelOptions {
    serviceWorker: ServiceWorkerContainer;
    origin: string;
    reader: Pick<ReturnType<typeof createRHelpPageReader>, "fetchResource">;
}


// A browser-only connection adapter. Its reader is already bound to one
// runtime receipt; registration must never switch it to the current runtime.
export const createBrowserHelpResourceChannel = function(
    options: BrowserHelpResourceChannelOptions
) {
    const ownerBytes = crypto.getRandomValues(new Uint8Array(16));
    const owner = Array.from(ownerBytes, (value) => value.toString(16).padStart(2, "0")).join("");
    const baseUrl = `${new URL(options.origin).origin}/__dialogforge_runtime_help/${owner}`;
    let registeredWorker: ServiceWorker | null = null;
    let closed = false;

    const handleMessage = function(event: MessageEvent): void {
        const data = event.data;
        const reply = event.ports[0];
        if (
            closed || !registeredWorker || event.source !== registeredWorker ||
            registeredWorker !== options.serviceWorker.controller ||
            data?.id !== "dialogforge-help-resource" || data.owner !== owner || !reply
        ) {
            return;
        }
        const worker = registeredWorker;
        void (async function() {
            try {
                const result = await options.reader.fetchResource(data.url);
                reply.postMessage(closed || registeredWorker !== worker
                    || options.serviceWorker.controller !== worker
                    ? { error: "help-resource-retired", status: 410 }
                    : result);
            } catch (error) {
                reply.postMessage({
                    error: error instanceof Error ? error.message : "help-resource-read-failed",
                    status: 503
                });
            } finally {
                reply.close();
            }
        })().catch(() => {
            // A removed requesting frame may close its port before delivery.
            reply.close();
        });
    };
    options.serviceWorker.addEventListener("message", handleMessage);

    const unregister = function(worker: ServiceWorker): void {
        const channel = new MessageChannel();
        channel.port1.onmessage = function() {
            clearTimeout(timeout);
            channel.port1.close();
        };
        const timeout = setTimeout(() => channel.port1.close(), 1500);
        try {
            worker.postMessage({ id: "dialogforge-help-unregister", owner }, [channel.port2]);
        } catch {
            clearTimeout(timeout);
            channel.port1.close();
            channel.port2.close();
        }
    };

    return {
        async register(): Promise<string> {
            const worker = options.serviceWorker.controller;
            if (closed || !worker) {
                throw new Error("help-resource-channel-unavailable");
            }
            if (registeredWorker && registeredWorker !== worker) {
                unregister(registeredWorker);
            }
            registeredWorker = worker;
            const accepted = await new Promise<boolean>((resolve) => {
                const channel = new MessageChannel();
                const finish = function(value: boolean): void {
                    clearTimeout(timeout);
                    channel.port1.close();
                    resolve(value);
                };
                const timeout = setTimeout(() => finish(false), 1500);
                channel.port1.onmessage = (event) => finish(event.data?.ok === true);
                channel.port1.onmessageerror = () => finish(false);
                try {
                    worker.postMessage({ id: "dialogforge-help-register", owner }, [channel.port2]);
                } catch {
                    channel.port2.close();
                    finish(false);
                }
            });
            if (!accepted || closed || options.serviceWorker.controller !== worker) {
                unregister(worker);
                if (registeredWorker === worker) {
                    registeredWorker = null;
                }
                throw new Error("help-resource-channel-unavailable");
            }
            return baseUrl;
        },
        close(): void {
            if (closed) {
                return;
            }
            closed = true;
            options.serviceWorker.removeEventListener("message", handleMessage);
            if (registeredWorker) {
                unregister(registeredWorker);
                registeredWorker = null;
            }
        }
    };
};
