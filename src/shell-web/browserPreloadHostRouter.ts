interface BrowserPreloadMessage {
    source?: unknown;
    kind?: unknown;
    requestId?: unknown;
    channel?: unknown;
    args?: unknown;
}

interface BrowserPreloadHostResponse {
    source: "dialogforge.web-host";
    kind: "response";
    requestId: string;
    ok: boolean;
    result?: unknown;
    error?: string;
}

interface BrowserPreloadHostEvent {
    source: "dialogforge.web-host";
    kind: "event";
    channel: string;
    args: unknown[];
}

interface BrowserPreloadHostRouterOptions {
    origin?: string;
    invoke(channel: string, args: unknown[]): Promise<unknown>;
    send(channel: string, args: unknown[], sourceWindow: Window | null): void;
    onError?: (error: unknown) => void;
}

interface BrowserPreloadHostRouter {
    postEvent(sourceWindow: Window | null | undefined, channel: string, ...args: unknown[]): void;
    routeMessage(event: MessageEvent): Promise<boolean>;
}

const isBrowserPreloadMessage = function(value: unknown): value is BrowserPreloadMessage {
    return Boolean(value)
        && typeof value === "object"
        && (value as BrowserPreloadMessage).source === "dialogforge.web-preload";
};

const readMessageArgs = function(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
};

const readMessageChannel = function(value: unknown): string {
    return String(value || "");
};

const postToSourceWindow = function(
    sourceWindow: Window | null | undefined,
    message: BrowserPreloadHostResponse | BrowserPreloadHostEvent,
    origin: string
): void {
    sourceWindow?.postMessage(message, origin);
};

const postResponse = function(
    sourceWindow: Window | null | undefined,
    origin: string,
    requestId: string,
    result: unknown
): void {
    postToSourceWindow(sourceWindow, {
        source: "dialogforge.web-host",
        kind: "response",
        requestId,
        ok: true,
        result
    }, origin);
};

const postError = function(
    sourceWindow: Window | null | undefined,
    origin: string,
    requestId: string,
    error: unknown
): void {
    postToSourceWindow(sourceWindow, {
        source: "dialogforge.web-host",
        kind: "response",
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
    }, origin);
};

export const createBrowserPreloadHostRouter = function(
    options: BrowserPreloadHostRouterOptions
): BrowserPreloadHostRouter {
    const origin = options.origin || window.location.origin;

    return {
        postEvent(sourceWindow, channel, ...args) {
            postToSourceWindow(sourceWindow, {
                source: "dialogforge.web-host",
                kind: "event",
                channel,
                args
            }, origin);
        },

        async routeMessage(event) {
            if (
                event.origin !== origin
                || !isBrowserPreloadMessage(event.data)
            ) {
                return false;
            }

            const message = event.data;

            if (message.kind === "invoke") {
                const requestId = String(message.requestId || "");

                try {
                    const result = await options.invoke(
                        readMessageChannel(message.channel),
                        readMessageArgs(message.args)
                    );

                    postResponse(event.source as Window | null, origin, requestId, result);
                }
                catch (error) {
                    postError(event.source as Window | null, origin, requestId, error);
                }

                return true;
            }

            if (message.kind === "send" || message.kind === "send-to") {
                try {
                    options.send(
                        readMessageChannel(message.channel),
                        readMessageArgs(message.args),
                        event.source as Window | null
                    );
                }
                catch (error) {
                    options.onError?.(error);
                }

                return true;
            }

            return false;
        }
    };
};
