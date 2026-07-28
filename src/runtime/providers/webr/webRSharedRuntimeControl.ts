import type {
    RRuntimeControlClient,
    RRuntimeControlRequest,
    RRuntimeControlResponse
} from "../r/protocol/runtimeControlClient";
import {
    encodeRuntimeControlRequest
} from "../r/protocol/runtimeControlRequestEncoding";
import {
    captureWebRHiddenText,
    type WebRHiddenCaptureRuntime
} from "./webRCommandCapture";


const runtimeControlSourceNames = [
    "backend.R",
    "runtimePrelude.R",
    "runtimeWorkspaceCore.R",
    "runtimeDatasetStateCore.R",
    "runtimeDatasetCore.R",
    "runtimeCompletionCore.R",
    "runtimeHelpCore.R",
    "runtimeEventCore.R",
    "runtimePromptCore.R",
    "runtimeGraphicsCore.R",
    "runtimeWarningCore.R",
    "runtimeTransportCore.R",
    "runtimeDispatchCore.R"
];


export interface WebRSharedRuntimeControlRuntime extends WebRHiddenCaptureRuntime {
    evalRVoid(command: string): Promise<void>;
}


export type WebRSharedRuntimeControlClient = RRuntimeControlClient;


export interface WebRSharedRuntimeControlOptions {
    runtime: WebRSharedRuntimeControlRuntime;
    fetchSource(path: string): Promise<string>;
    fetchProductSource?(): Promise<string>;
    runRuntimeOperation<T>(action: () => Promise<T>): Promise<T>;
}


const createRuntimeEnvironmentCommand = function(): string {
    return [
        "local({",
        "    if (!is.element(\"DialogApp\", search())) {",
        "        attach(NULL, name = \"DialogApp\", warn.conflicts = FALSE)",
        "    }",
        "    .runtime_env <- as.environment(\"DialogApp\")",
        "    .runtime_env$app_env <- .runtime_env",
        "    .runtime_env$opts <- list(",
        "        meta_path = \"\",",
        "        events_path = \"\",",
        "        trace_path = \"\",",
        "        trace_enabled = FALSE,",
        "        session_kind = \"interactive\",",
        "        token = \"\",",
        "        port = 0L",
        "    )",
        "})"
    ].join("\n");
};


const evaluateRuntimeSourceCommand = function(source: string): string {
    return [
        "eval(",
        `    parse(text = ${JSON.stringify(source)}),`,
        "    envir = as.environment(\"DialogApp\")",
        ")"
    ].join("\n");
};


const executeRuntimeMethodCommand = function(
    request: RRuntimeControlRequest
): string {
    const raw = encodeRuntimeControlRequest(request);

    return [
        "local({",
        `    .raw <- ${JSON.stringify(raw)}`,
        `    .method <- ${JSON.stringify(request.method)}`,
        "    .runtime_env <- as.environment(\"DialogApp\")",
        "    .params <- .runtime_env$runtime_transport_dedicated_params(.raw)",
        "    .result <- .runtime_env$eval_method(.method, .params)",
        "    .result_json <- .runtime_env$runtime_transport_result_json(",
        "        .method,",
        "        .result",
        "    )",
        "    .result$id <- .params$id",
        "    .result$method <- .method",
        "    cat(.runtime_env$runtime_transport_response_payload(",
        "        .result,",
        "        .result_json,",
        "        TRUE",
        "    ))",
        "})"
    ].join("\n");
};


export const installWebRSharedRuntimeControl = async function(
    options: WebRSharedRuntimeControlOptions
): Promise<WebRSharedRuntimeControlClient> {
    await options.runRuntimeOperation(function() {
        return options.runtime.evalRVoid(createRuntimeEnvironmentCommand());
    });

    for (const sourceName of runtimeControlSourceNames) {
        const source = await options.fetchSource(sourceName);

        await options.runRuntimeOperation(function() {
            return options.runtime.evalRVoid(
                evaluateRuntimeSourceCommand(source)
            );
        });
    }

    if (options.fetchProductSource) {
        const productSource = await options.fetchProductSource();

        if (productSource.trim()) {
            await options.runRuntimeOperation(function() {
                return options.runtime.evalRVoid(
                    evaluateRuntimeSourceCommand(productSource)
                );
            });
        }
    }

    let attached = true;

    return {
        execute: async function(request) {
            if (!attached) {
                return {
                    id: request.id,
                    method: request.method,
                    ok: false,
                    error: "runtime-session-detached"
                };
            }

            try {
                if (request.method === "evaluate_code") {
                    const text = await options.runRuntimeOperation(function() {
                        return captureWebRHiddenText(
                            options.runtime,
                            String(request.params?.code || "")
                        );
                    });

                    return {
                        id: request.id,
                        method: request.method,
                        ok: true,
                        result: text,
                        events: []
                    };
                }

                const text = await options.runRuntimeOperation(function() {
                    return captureWebRHiddenText(
                        options.runtime,
                        executeRuntimeMethodCommand(request)
                    );
                });
                const result = JSON.parse(String(text || "").trim());

                return {
                    id: request.id,
                    method: request.method,
                    ok: result?.ok === true,
                    result: result?.result,
                    error: result?.error
                        ? String(result.error)
                        : undefined,
                    mode: result?.mode
                        ? String(result.mode)
                        : undefined,
                    events: Array.isArray(result?.events)
                        ? result.events
                        : []
                };
            }
            catch (error) {
                return {
                    id: request.id,
                    method: request.method,
                    ok: false,
                    error: error instanceof Error
                        ? error.message
                        : String(error)
                };
            }
        },
        detach: function() {
            attached = false;
        }
    };
};
