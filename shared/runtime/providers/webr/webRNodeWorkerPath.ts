type WorkerConstructor = new (filename: unknown, options?: unknown) => object;


export interface WebRNodeWorkerPathOptions {
    workerThreads?: {
        Worker?: WorkerConstructor;
    };
    pathToFileURL?: (value: string) => unknown;
    globalTarget?: Record<string, unknown>;
}


let installed = false;


const readWorkerThreads = function(
    options: WebRNodeWorkerPathOptions
): WebRNodeWorkerPathOptions["workerThreads"] | null {
    if (options.workerThreads) {
        return options.workerThreads;
    }

    try {
        return require("worker_threads");
    }
    catch {
        return null;
    }
};


const readPathToFileURL = function(
    options: WebRNodeWorkerPathOptions
): ((value: string) => unknown) | null {
    if (options.pathToFileURL) {
        return options.pathToFileURL;
    }

    try {
        return require("url").pathToFileURL;
    }
    catch {
        return null;
    }
};


export const normalizeWebRNodeWorkerTarget = function(
    filename: unknown,
    pathToFileURL: (value: string) => unknown
): unknown {
    if (typeof filename === "string" && /^file:\/\//i.test(filename)) {
        return new URL(filename);
    }

    if (typeof filename === "string" && /^[A-Za-z]:[\\/]/.test(filename)) {
        return pathToFileURL(filename);
    }

    if (
        filename
        && typeof filename === "object"
        && typeof (filename as { protocol?: unknown }).protocol === "string"
        && /^[A-Za-z]:$/i.test(String((filename as { protocol: string }).protocol))
    ) {
        const raw = String((filename as { href?: unknown }).href || "");
        const normalized = raw.replace(/\\/g, "/");

        return /^\/[A-Za-z]:\//.test(normalized)
            ? normalized.slice(1)
            : normalized;
    }

    return filename;
};


export const installWebRNodeWorkerPathNormalization = function(
    options: WebRNodeWorkerPathOptions = {}
): boolean {
    if (installed && !options.workerThreads) {
        return false;
    }

    const workerThreads = readWorkerThreads(options);
    const NativeWorker = workerThreads?.Worker;
    const pathToFileURL = readPathToFileURL(options);

    if (!workerThreads || !NativeWorker || !pathToFileURL) {
        return false;
    }

    const normalizePathToFileURL = pathToFileURL;

    class WebRUrlAwareWorker extends NativeWorker {
        constructor(filename: unknown, workerOptions?: unknown) {
            super(
                normalizeWebRNodeWorkerTarget(filename, normalizePathToFileURL),
                workerOptions
            );
        }
    }

    workerThreads.Worker = WebRUrlAwareWorker;
    (options.globalTarget || globalThis as unknown as Record<string, unknown>).Worker =
        WebRUrlAwareWorker;

    if (!options.workerThreads) {
        installed = true;
    }

    return true;
};
