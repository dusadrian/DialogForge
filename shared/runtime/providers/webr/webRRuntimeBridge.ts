import type {
    RuntimeTransportRequest,
    RuntimeTransportResponse
} from "../../transport/runtimeTransport";
import type {
    VisibleCommandRequest
} from "../../provider-contract/runtimeProvider";
import {
    webRTransportMethods
} from "./webRTransportMethods";
import { resolveWebRAssetBase } from "./webRAssetBase";
import {
    installWebRNodeWorkerPathNormalization
} from "./webRNodeWorkerPath";
import {
    mountWebRFilesystem,
    type WebRFilesystemMount,
    type WebRFilesystemMountResult
} from "./webRFilesystemMount";
import {
    runWebRBootstrap,
    type WebRBootstrapPlan,
    type WebRBootstrapResult
} from "./webRBootstrap";
import {
    executeWebRVisibleCommand
} from "./webRTranscript";
import {
    evaluateWebRInvisibleValue
} from "./webRValueConversion";
import type {
    WebR,
    WebROptions
} from "webr";


export interface WebRRuntimeBridge {
    start(): Promise<string>;
    close(): void;
    getBootstrapResult(): WebRBootstrapResult | null;
    mountFilesystem(mount: WebRFilesystemMount): Promise<WebRFilesystemMountResult>;
    sendRequest(request: RuntimeTransportRequest): Promise<RuntimeTransportResponse>;
}


export interface WebRRuntimeBridgeOptions {
    baseUrl?: string;
    bootstrap?: WebRBootstrapPlan;
    createRuntime?: () => Promise<WebR>;
}


type WebRConstructor = new (options?: WebROptions) => WebR;


const createResponse = function(
    request: RuntimeTransportRequest,
    status: RuntimeTransportResponse["status"],
    value: unknown,
    message: string
): RuntimeTransportResponse {
    return {
        id: request.id,
        status,
        value,
        message,
        receivedAt: new Date().toISOString()
    };
};


const readStringParam = function(
    request: RuntimeTransportRequest,
    key: string
): string {
    return String(request.params[key] || "");
};


const quoteRString = function(value: string): string {
    return JSON.stringify(value);
};


const canUseBundledWebRRuntime = function(): boolean {
    return typeof WebAssembly !== "undefined"
        && typeof Worker !== "undefined"
        && typeof fetch !== "undefined";
};


const importWebRConstructor = async function(): Promise<WebRConstructor> {
    installWebRNodeWorkerPathNormalization();

    const module = await import("webr");

    return module.WebR;
};


const createDefaultRuntime = async function(
    options: WebRRuntimeBridgeOptions
): Promise<WebR> {
    const WebRClass = await importWebRConstructor();

    return new WebRClass(createWebROptions(options));
};


const createWebROptions = function(options: WebRRuntimeBridgeOptions): WebROptions {
    const assetBase = resolveWebRAssetBase({
        explicitBaseUrl: options.baseUrl
    });
    const baseUrl = assetBase.baseUrl;

    return baseUrl ? { baseUrl } : {};
};


const readWorkspaceObjectNames = async function(runtime: WebR): Promise<string[]> {
    return await runtime.evalRRaw(
        "ls(envir = .GlobalEnv, all.names = TRUE)",
        "string[]"
    );
};


const createWorkspaceObjectSnapshots = function(names: string[]) {
    return names.map((name) => {
        return {
            name,
            kind: "object",
            detail: "WebR workspace object",
            capabilities: [
                "tabular.read",
                "tabular.columnNames",
                "tabular.rowNames"
            ]
        };
    });
};


const readTabularPreview = async function(
    runtime: WebR,
    objectName: string
) {
    const columns = await runtime.evalRRaw(
        `names(${objectName})`,
        "string[]"
    );
    const firstColumn = columns[0] || "";
    const values = firstColumn
        ? await runtime.evalRRaw(
            `as.character(utils::head(${objectName}[[${quoteRString(firstColumn)}]], 20))`,
            "string[]"
        )
        : [];

    return {
        columns: columns.map((name) => {
            return {
                name,
                type: "unknown"
            };
        }),
        rows: values.map((value) => {
            return {
                [firstColumn]: value
            };
        }),
        message: "WebR returned a tabular preview."
    };
};


export const createBundledWebRRuntimeBridge = function(
    options: WebRRuntimeBridgeOptions = {}
): WebRRuntimeBridge | null {
    if (!options.createRuntime && !canUseBundledWebRRuntime()) {
        return null;
    }

    let runtime: WebR | null = null;
    let initialized = false;
    let startPromise: Promise<string> | null = null;
    let operationQueue: Promise<void> = Promise.resolve();
    let bootstrapResult: WebRBootstrapResult | null = null;

    const enqueueOperation = async function<T>(
        task: () => Promise<T>
    ): Promise<T> {
        const previous = operationQueue;
        let release: () => void = function(): void {
            return;
        };

        operationQueue = new Promise<void>((resolve) => {
            release = resolve;
        });

        await previous.catch(() => undefined);

        try {
            return await task();
        }
        finally {
            release();
        }
    };

    const requireRuntime = function(): WebR {
        if (!runtime) {
            throw new Error("WebR runtime is not started.");
        }

        return runtime;
    };

    return {
        start: async function(): Promise<string> {
            if (initialized) {
                return "Bundled WebR runtime already started.";
            }

            if (!startPromise) {
                startPromise = enqueueOperation(async function(): Promise<string> {
                    if (initialized) {
                        return "Bundled WebR runtime already started.";
                    }

                    const nextRuntime = options.createRuntime
                        ? await options.createRuntime()
                        : await createDefaultRuntime(options);

                    runtime = nextRuntime;

                    try {
                        await runtime.init();
                        bootstrapResult = await runWebRBootstrap(
                            runtime,
                            options.bootstrap || {}
                        );
                        initialized = true;

                        return "Bundled WebR runtime started.";
                    }
                    catch (error) {
                        runtime = null;
                        initialized = false;
                        bootstrapResult = null;
                        startPromise = null;

                        throw error;
                    }
                }).finally(() => {
                    if (!initialized) {
                        startPromise = null;
                    }
                });
            }

            return startPromise;
        },
        close: function(): void {
            runtime?.close();
            runtime = null;
            initialized = false;
            bootstrapResult = null;
            startPromise = null;
            operationQueue = Promise.resolve();
        },
        getBootstrapResult: function(): WebRBootstrapResult | null {
            return bootstrapResult;
        },
        mountFilesystem: async function(
            mount: WebRFilesystemMount
        ): Promise<WebRFilesystemMountResult> {
            return enqueueOperation(async function(): Promise<WebRFilesystemMountResult> {
                return mountWebRFilesystem(requireRuntime(), mount);
            });
        },
        sendRequest: async function(
            request: RuntimeTransportRequest
        ): Promise<RuntimeTransportResponse> {
            return enqueueOperation(async function(): Promise<RuntimeTransportResponse> {
                const activeRuntime = requireRuntime();

                try {
                    if (request.method === webRTransportMethods.visibleCommand) {
                        const commandRequest: VisibleCommandRequest = (
                            request.params.request &&
                            typeof request.params.request === "object"
                        )
                            ? request.params.request as {
                                kind: "commands.visible";
                                text: string;
                                source: string;
                                createdAt: string;
                            }
                            : {
                                kind: "commands.visible",
                                text: readStringParam(request, "text"),
                                source: readStringParam(request, "source") || "webr",
                                createdAt: request.createdAt
                            };
                        const transcriptEvents = await executeWebRVisibleCommand(
                            activeRuntime,
                            commandRequest
                        );

                        return createResponse(
                            request,
                            "ok",
                            {
                                transcriptEvents
                            },
                            "WebR command completed."
                        );
                    }

                    if (request.method === webRTransportMethods.invisibleQuery) {
                        const queryRequest = (
                            request.params.request &&
                            typeof request.params.request === "object"
                        )
                            ? request.params.request as { query?: unknown }
                            : request.params;
                        const query = String(queryRequest.query || "");
                        const value = await evaluateWebRInvisibleValue(
                            activeRuntime,
                            query
                        );

                        return createResponse(
                            request,
                            "ok",
                            { value, message: "WebR query completed." },
                            "WebR query completed."
                        );
                    }

                    if (request.method === webRTransportMethods.workspaceObjects) {
                        const names = await readWorkspaceObjectNames(activeRuntime);

                        return createResponse(
                            request,
                            "ok",
                            { objects: createWorkspaceObjectSnapshots(names) },
                            "WebR workspace objects listed."
                        );
                    }

                    if (request.method === webRTransportMethods.tabularPreview) {
                        const objectName = readStringParam(request, "objectName");
                        const preview = await readTabularPreview(
                            activeRuntime,
                            objectName
                        );

                        return createResponse(
                            request,
                            "ok",
                            preview,
                            "WebR tabular preview completed."
                        );
                    }

                    if (request.method === webRTransportMethods.dependencies) {
                        const names = Array.isArray(request.params.names)
                            ? request.params.names.map(String)
                            : [];
                        const items = [];

                        for (const name of names) {
                            const available = await activeRuntime.evalRRaw(
                                `requireNamespace(${quoteRString(name)}, quietly = TRUE)`,
                                "boolean"
                            );

                            items.push({
                                name,
                                status: available ? "available" : "missing",
                                version: "",
                                message: available
                                    ? "Package is available in the WebR runtime."
                                    : "Package is not available in the WebR runtime."
                            });
                        }

                        return createResponse(
                            request,
                            "ok",
                            {
                                status: items.every((item) => {
                                    return item.status === "available";
                                })
                                    ? "ready"
                                    : "partial",
                                items,
                                message: "WebR package availability checked."
                            },
                            "WebR package availability checked."
                        );
                    }

                    return createResponse(
                        request,
                        "error",
                        null,
                        `Unsupported WebR method: ${request.method}.`
                    );
                }
                catch (error) {
                    return createResponse(
                        request,
                        "error",
                        null,
                        error instanceof Error ? error.message : String(error)
                    );
                }
            });
        }
    };
};
