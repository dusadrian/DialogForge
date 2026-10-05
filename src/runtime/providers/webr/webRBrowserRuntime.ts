export interface BrowserWebRModule {
    WebR: new (options?: Record<string, unknown>) => unknown;
    ChannelType?: {
        SharedArrayBuffer?: number;
        PostMessage?: number;
    };
}

const interruptibleRuntimes = new WeakSet<object>();

// WebR 0.6 Automatic selects shared memory when SharedArrayBuffer is available.
// Its PostMessage interrupt only logs unsupported and returns void, so calling
// interrupt() alone cannot establish acceptance. Remember the factory's channel.
export const signalBrowserWebRInterrupt = function(runtime: unknown): boolean | null {
    if (!runtime || typeof runtime !== "object" || !interruptibleRuntimes.has(runtime)) {
        return null;
    }
    const worker = runtime as { interrupt?: () => void };
    if (typeof worker.interrupt !== "function") {
        return null;
    }
    worker.interrupt();
    return true;
};

export interface BrowserWebRRuntimeOptions {
    importWebRModule(): Promise<BrowserWebRModule>;
    baseUrl?: string;
    homedir?: string;
    rArgs?: string[];
}


export const createBrowserWebRRuntime = async function(
    options: BrowserWebRRuntimeOptions
): Promise<unknown> {
    const module = await options.importWebRModule();
    const baseUrl = String(options.baseUrl || "");
    const runtimeOptions: Record<string, unknown> = baseUrl ? { baseUrl } : {};
    const homedir = String(options.homedir || "").trim();

    if (homedir) {
        runtimeOptions.homedir = homedir;
    }

    if (options.rArgs?.length) {
        runtimeOptions.RArgs = options.rArgs.slice();
    }

    const runtime = new module.WebR(runtimeOptions);
    if (
        runtime && typeof runtime === "object"
        && module.ChannelType?.SharedArrayBuffer !== undefined
        && typeof SharedArrayBuffer === "function"
    ) {
        interruptibleRuntimes.add(runtime);
    }
    return runtime;
};
