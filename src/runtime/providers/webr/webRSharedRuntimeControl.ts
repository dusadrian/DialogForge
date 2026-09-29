import type {
    RRuntimeControlClient,
    RRuntimeControlRequest,
    RRuntimeControlResponse
} from "../r/protocol/runtimeControlClient";
import {
    encodeRuntimeControlRequest
} from "../r/protocol/runtimeControlRequestEncoding";
import { createRuntimeControlDiagnostics } from "../r/protocol/runtimeControlDiagnostics";
import {
    isRPlotCommand
} from "../r/commands/rCommandIntents";
import {
    evaluateWebRGraphicsCommand,
    type WebRGraphicsTransportRuntime
} from "./webRGraphicsTransport";


const runtimeControlSourceNames = [
    "backend.R",
    "runtimePrelude.R",
    "runtimeDiagnostics.R",
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


export interface WebRSharedRuntimeControlRuntime extends WebRGraphicsTransportRuntime {
    evalRVoid(command: string): Promise<void>;
    evalRString(command: string): Promise<string>;
    read?(): Promise<{ type?: unknown; data?: unknown } | null>;
    FS?: {
        readFile(path: string): Promise<Uint8Array>;
        unlink?(path: string): Promise<void>;
    };
}


export type WebRSharedRuntimeControlClient = RRuntimeControlClient;


export interface WebRSharedRuntimeControlOptions {
    runtime: WebRSharedRuntimeControlRuntime;
    fetchSource(path: string): Promise<string>;
    fetchProductSource?(): Promise<string>;
    runRuntimeOperation<T>(action: () => Promise<T>): Promise<T>;
    prepareRequest?(request: RRuntimeControlRequest): Promise<void>;
    graphicsReceived?(images: unknown[]): Promise<void> | void;
    promptReceived?(input: {
        parentId: string;
        prompt: string;
        password: boolean;
        source: string;
    }): Promise<void> | void;
}


const createRuntimeEnvironmentCommand = function(): string {
    return [
        "local({",
        "    if (!is.element(\"DialogApp\", search())) {",
        "        attach(NULL, name = \"DialogApp\", warn.conflicts = FALSE)",
        "    }",
        "    .runtime_env <- as.environment(\"DialogApp\")",
        "    .runtime_env$app_env <- .runtime_env",
        "    .runtime_env$trace <- function(message) invisible(NULL)",
        "    .runtime_env$dialog_last_traceback <- NULL",
        "    .runtime_env$event_seq <- 0L",
        "    .runtime_env$current_activity_id <- \"\"",
        "    .runtime_env$pending_prompt_reply <- NULL",
        "    .runtime_env$completion_queue <- list()",
        "    .runtime_env$live_events_enabled <- FALSE",
        "    .runtime_env$runtime_collected_events <- NULL",
        "    .runtime_env$dialog_record_traceback <- function() {",
        "        .runtime_env$dialog_last_traceback <- sys.calls()",
        "        invisible(NULL)",
        "    }",
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
        "    .previous_diagnostics <- .runtime_env$runtime_diagnostic_begin(.params)",
        "    on.exit(.runtime_env$runtime_diagnostics <- .previous_diagnostics, add = TRUE)",
        "    .runtime_env$runtime_begin_event_collection()",
        "    .result <- .runtime_env$eval_method(.method, .params)",
        // Electron flushes this queue from its runtime loop. WebR executes one
        // request at a time, so its transport must flush before collecting the
        // APP events or the terminal idle state and next prompt are withheld.
        "    .runtime_env$flush_completion_queue()",
        "    .result$diagnostics_json <- .runtime_env$runtime_diagnostic_json()",
        "    .events <- .runtime_env$runtime_take_collected_events()",
        "    .result$events_json <- paste0(",
        "        \"[\", paste(.events, collapse = \",\"), \"]\"",
        "    )",
        "    .result_json <- .runtime_env$runtime_transport_result_json(",
        "        .method,",
        "        .result",
        "    )",
        "    .result$id <- .params$id",
        "    .result$method <- .method",
        "    .runtime_env$runtime_transport_response_payload(",
        "        .result,",
        "        .result_json,",
        "        TRUE",
        "    )",
        "})"
    ].join("\n");
};


const isInteractiveInputRequest = function(
    request: RRuntimeControlRequest
): boolean {
    if (request.method !== "execute_input") {
        return false;
    }

    const code = String(request.params?.code || "");

    return /\breadline\s*\(/.test(code)
        || /\bmenu\s*\(/.test(code)
        || /\baskpass\s*\(/.test(code);
};


const executeInteractiveRuntimeMethod = async function(
    options: WebRSharedRuntimeControlOptions,
    request: RRuntimeControlRequest,
    command: string
): Promise<string> {
    const runtime = options.runtime;

    if (!runtime.read || !runtime.FS?.readFile) {
        return runtime.evalRString(command);
    }

    const responsePath = `/tmp/dialogforge-runtime-${Date.now()}-${Math.floor(
        Math.random() * 1000000
    )}.json`;
    const fileCommand = [
        "local({",
        `    .payload <- ${command}`,
        `    writeChar(.payload, ${JSON.stringify(responsePath)}, eos = NULL, useBytes = TRUE)`,
        "    invisible(NULL)",
        "})"
    ].join("\n");
    let finished = false;
    const evaluation = runtime.evalRVoid(fileCommand).finally(() => {
        finished = true;
    });

    while (!finished) {
        const message = await Promise.race([
            runtime.read(),
            evaluation.then(() => null)
        ]);

        if (!message || String(message.type || "") !== "prompt") {
            continue;
        }

        await options.promptReceived?.({
            parentId: String(request.params?.parentId || ""),
            prompt: String(message.data || ""),
            password: /\baskpass\s*\(/.test(
                String(request.params?.code || "")
            ),
            source: "browser.webr.visible-command"
        });
    }

    await evaluation;

    try {
        const file = await runtime.FS.readFile(responsePath);

        return new TextDecoder().decode(file);
    }
    finally {
        await runtime.FS.unlink?.(responsePath);
    }
};


export const installWebRSharedRuntimeControl = async function(
    options: WebRSharedRuntimeControlOptions
): Promise<WebRSharedRuntimeControlClient> {
    const diagnostics = createRuntimeControlDiagnostics("webr");
    const startupRequest = { id: "lifecycle", method: "runtime.start" };
    diagnostics.record(startupRequest, "startup.started");
    // Fetch independently, then evaluate in the established dependency order.
    // Serial network requests added one round trip for every runtime source.
    const [sources, productSource] = await Promise.all([
        Promise.all(runtimeControlSourceNames.map((name) => options.fetchSource(name))),
        options.fetchProductSource ? options.fetchProductSource() : Promise.resolve("")
    ]);
    diagnostics.record(startupRequest, "startup.sources_ready");

    await options.runRuntimeOperation(function() {
        return options.runtime.evalRVoid(createRuntimeEnvironmentCommand());
    });

    for (const source of sources) {
        await options.runRuntimeOperation(function() {
            return options.runtime.evalRVoid(
                evaluateRuntimeSourceCommand(source)
            );
        });
    }
    diagnostics.record(startupRequest, "startup.helpers_ready");

    if (productSource.trim()) {
        await options.runRuntimeOperation(function() {
            return options.runtime.evalRVoid(
                evaluateRuntimeSourceCommand(productSource)
            );
        });
    }

    let attached = true;
    let workspaceEpoch = 0;
    diagnostics.record(startupRequest, "startup.ready");

    return {
        getWorkspaceEpoch: () => workspaceEpoch,
        execute: async function(request) {
            if (request.method !== "workspace.update" && request.method !== "workspace.snapshot") {
                workspaceEpoch += 1;
            }
            request = diagnostics.prepare(request);
            if (!attached) {
                return {
                    id: request.id,
                    method: request.method,
                    ok: false,
                    error: "runtime-session-detached"
                };
            }

            try {
                const command = executeRuntimeMethodCommand(request);
                const interactive = isInteractiveInputRequest(request);
                const capturesGraphics = request.method === "execute_input"
                    && isRPlotCommand(String(request.params?.code || ""));
                const text = await options.runRuntimeOperation(async function() {
                    diagnostics.record(request, "request.dequeued");
                    await options.prepareRequest?.(request);
                    diagnostics.record(request, "request.sent");
                    if (interactive) {
                        return executeInteractiveRuntimeMethod(
                            {
                                ...options,
                                promptReceived: async function(input) {
                                    diagnostics.record(request, "prompt.requested");
                                    await options.promptReceived?.(input);
                                }
                            },
                            request,
                            command
                        );
                    }

                    if (capturesGraphics && options.runtime.Shelter) {
                        const captured = await evaluateWebRGraphicsCommand(
                            options.runtime,
                            command
                        );

                        await options.graphicsReceived?.(captured.images);

                        return captured.responseText;
                    }

                    return options.runtime.evalRString(command);
                });
                const result = JSON.parse(String(text || "").trim());
                diagnostics.record(
                    request, "response.received",
                    diagnostics.enabled ? new TextEncoder().encode(text).byteLength : 0
                );
                diagnostics.receiveDiagnostics(request, result?.diagnostics);
                for (const event of Array.isArray(result?.events) ? result.events : []) {
                    diagnostics.receiveEvent(request, event);
                }

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
                diagnostics.record(request, "request.failed");
                return {
                    id: request.id,
                    method: request.method,
                    ok: false,
                    error: error instanceof Error
                        ? error.message
                        : String(error)
                };
            }
            finally {
                diagnostics.record(request, "response.resolved");
            }
        },
        detach: function() {
            workspaceEpoch += 1;
            attached = false;
        }
    };
};
