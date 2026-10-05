import type {
    RRuntimeControlClient,
    RRuntimeControlRequest,
    RRuntimeControlResponse
} from "../r/protocol/runtimeControlClient";
import {
    encodeRuntimeControlOutputCapture,
    createRuntimeControlRequestSizeLimit
} from "../r/protocol/runtimeControlRequestEncoding";
import { createRuntimeControlDiagnostics } from "../r/protocol/runtimeControlDiagnostics";
import { createRuntimeControlRequestAdmission } from "../r/protocol/runtimeControlRequestAdmission";
import { readRuntimeControlEventError, readRuntimeControlResponseError, createValidatedRuntimeControlResponse, decodeRuntimeControlFrameBytes,
    RuntimeControlTransportError, checkRuntimeControlFrameByteLength } from "../r/protocol/runtimeControlResponseValidation";
import {
    createRuntimeControlEventRetention,
    RuntimeControlEventRetentionError
} from "../r/protocol/runtimeControlEventRetention";
import { executeRuntimeControlRequestWithDeadline } from "../r/protocol/runtimeControlRequestDeadline";
import { createRuntimeControlRequestPreparation } from "../r/protocol/runtimeControlRequestPreparation";
import {
    type WebRGraphicsTransportRuntime
} from "./webRGraphicsTransport";
import { createRuntimeOutputByteTransport } from "../../output/runtimeOutputByteTransport";
import { createROrderedOutputDelivery } from "../r/controllers/rOrderedOutputDelivery";
import {
    createWebRPromptTransport,
    type WebRPromptInputTransport
} from "./webRPromptTransport";


// WebR envelope routing only; bytes and completion use the same shared files as native R.
export const createWebROutputJournalReader = function(
    options: Omit<Parameters<typeof createROrderedOutputDelivery>[0], "transport"> & { path: string }
) {
    const path = options.path;
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (!/^[a-zA-Z0-9_-]+\.bin$/.test(name)) {
        throw new Error("WebR output journal requires a private capture filename.");
    }
    const storage = createRuntimeOutputByteTransport(path);
    const reader = createROrderedOutputDelivery({ ...options, transport: storage.transport });
    const receive = async function(data: unknown): Promise<boolean> {
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            return false;
        }
        const message = data as { path?: unknown; offset?: unknown; bytes?: unknown };
        if (message.path !== path) {
            return false;
        }
        let stored = true;
        try {
            storage.append(message.offset, message.bytes);
        } catch {
            // The shared transport retains its failure for the shared reader.
            stored = false;
        }
        const result = await reader.poll();
        return stored && result.capture.status !== "failed" && result.capture.status !== "retired"
            && !result.capture.hasUnreadBytes;
    };
    return {
        ...reader, receive,
        params: { outputCaptureName: name, outputCaptureSession: options.sessionId }
    };
};

export type WebROutputJournalReader = ReturnType<typeof createWebROutputJournalReader>;


export interface WebRSharedRuntimeControlRuntime extends WebRGraphicsTransportRuntime, WebRPromptInputTransport {
    evalRVoid(command: string, options?: { captureConditions?: boolean }): Promise<void>;
    evalRString(command: string): Promise<string>;
    read?(): Promise<{ type?: unknown; data?: unknown; count?: unknown; responseBytes?: unknown } | null>;
    FS?: {
        readFile(path: string): Promise<Uint8Array>;
        writeFile?(path: string, data: Uint8Array): Promise<unknown>;
        unlink?(path: string): Promise<void>;
    };
}


export type WebRSharedRuntimeControlClient = RRuntimeControlClient;


export interface WebRSharedRuntimeControlOptions {
    maxOutstandingRequests?: number;
    maxRequestBytes?: number;
    maxRetainedEventBytes?: number;
    maxRetainedEvents?: number;
    runtime: WebRSharedRuntimeControlRuntime;
    fetchSource(path: string): Promise<string>;
    fetchControlCompilationCache?(): Promise<Uint8Array | null>;
    fetchHelperArchive?(rVersion: string): Promise<Uint8Array>;
    fetchProductSource?(): Promise<string>;
    runRuntimeOperation<T>(action: () => Promise<T>, waitBeforeNext?: () => Promise<void>): Promise<T>;
    prepareRequest?(request: RRuntimeControlRequest): Promise<void>;
    orderedOutput?: { library: string; directory: string; sessionId: string };
    outputJournalForRequest?(request: RRuntimeControlRequest): WebROutputJournalReader | null;
    graphicsReceived?(images: unknown[], pageCount?: unknown): Promise<void> | void;
    runtimeEventReceived?(
        event: Record<string, unknown>,
        request: RRuntimeControlRequest,
        orderedOutput: boolean
    ): Promise<void> | void;
    promptReceived?(event: Record<string, unknown>): Promise<void> | void;
}


const createRuntimeEnvironmentCommand = function(initializationSource: string): string {
    return [
        "local({",
        initializationSource,
        "    runtime_initialize_environment()",
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
    encodedRequest: string
): string {

    return [
        "local({",
        `    .raw <- ${JSON.stringify(encodedRequest)}`,
        "    .runtime_env <- as.environment(\"DialogApp\")",
        "    .request <- .runtime_env$runtime_transport_decode_request(",
        "        .raw, TRUE, require_auth = FALSE",
        "    )",
        "    if (!isTRUE(.request$valid)) stop(.request$error)",
        "    .result <- .runtime_env$runtime_evaluate_control_request(",
        "        .request, collect_events = TRUE",
        "    )",
        "    .result_json <- .runtime_env$runtime_transport_result_json(",
        "        .result$method,",
        "        .result",
        "    )",
        "    .runtime_env$runtime_transport_response_payload(",
        "        .result,",
        "        .result_json,",
        "        TRUE",
        "    )",
        "})"
    ].join("\n");
};


// One outstanding worker read, retained if evaluation wins the race.
const pendingWorkerReads = new WeakMap<
    WebRSharedRuntimeControlRuntime,
    Promise<{ type?: unknown; data?: unknown; count?: unknown; responseBytes?: unknown } | null>
>();


const executeWorkerRuntimeMethod = async function(
    options: WebRSharedRuntimeControlOptions,
    request: RRuntimeControlRequest,
    command: string,
    promptTransport: ReturnType<typeof createWebRPromptTransport>,
    retirement: Pick<ReturnType<typeof createRuntimeControlRequestAdmission>, "subscribeRetirement">,
    outputJournal?: WebROutputJournalReader | null
): Promise<string> {
    const runtime = options.runtime;

    if (!runtime.read || !runtime.FS?.readFile) {
        return runtime.evalRString(command);
    }

    const responsePath = `/tmp/dialogforge-runtime-${Date.now()}-${Math.floor(
        Math.random() * 1000000
    )}.json`;
    const drainMessage = JSON.stringify({ type: "dialogforge-runtime-drain", data: responsePath });
    const notifyDrain = [
        "(() => {",
        `const message = ${drainMessage};`,
        "try {",
        `message.responseBytes = globalThis.Module.FS.stat(${JSON.stringify(responsePath)}).size;`,
        "} catch {}",
        "globalThis.Module.webr.channel.write(message);",
        "return null;",
        "})()"
    ].join("\n");
    const fileCommand = [
        "local({",
        `    on.exit(webr::eval_js(${JSON.stringify(notifyDrain)}), add = TRUE)`,
        `    .payload <- ${command}`,
        `    writeChar(.payload, ${JSON.stringify(responsePath)}, eos = NULL, useBytes = TRUE)`,
        "    invisible(NULL)",
        "})"
    ].join("\n");
    // WebR's outer evaluator normally captures/muffles conditions before R
    // can queue deferred warnings. Ordered capture already owns those through
    // the SAME R helper as native; disable that host wrapper, not R's policy.
    const evaluate = async function() {
        try {
            await runtime.evalRVoid(fileCommand, outputJournal
                ? { captureConditions: false } : undefined);
            return { completed: true as const };
        }
        catch (error) {
            return { completed: false as const, error };
        }
    };
    const evaluation = evaluate();
    let evaluated = false;
    let drained = false;
    let reading = true;
    let unsubscribeRetirement!: () => void;
    const retired = new Promise<{ kind: "retired"; error: string }>((resolve) => {
        unsubscribeRetirement = retirement.subscribeRetirement(error => resolve({ kind: "retired", error }));
    });
    let drainTimer: ReturnType<typeof setTimeout> | null = null;
    const drainTimeout = new Promise<{ kind: "timeout" }>((resolve) => {
        // Start the timeout only after evaluation ends, never during user input.
        void evaluation.then(() => {
            if (reading && !drained) {
                drainTimer = setTimeout(() => resolve({ kind: "timeout" }), 5000);
            }
        });
    });

    try {
        while (!drained) {
            let read = pendingWorkerReads.get(runtime);
            if (!read) {
                read = runtime.read();
                pendingWorkerReads.set(runtime, read);
            }
            const contenders = [
                read.then((message) => ({ kind: "message" as const, message })),
                drainTimeout,
                retired
            ];
            const result = await Promise.race([
                ...contenders,
                ...(!evaluated ? [evaluation.then((outcome) => ({ kind: "evaluated" as const, outcome }))] : [])
            ]);
            if (result.kind === "evaluated") {
                evaluated = true;
                continue;
            }
            if (result.kind === "retired") {
                pendingWorkerReads.delete(runtime);
                throw new Error(result.error);
            }
            if (result.kind === "timeout") {
                throw new Error("runtime-session-channel-drain-timeout");
            }
            pendingWorkerReads.delete(runtime);
            const message = result.message;
            if (!message || message.type === "closed") {
                throw new RuntimeControlTransportError(null, message
                    ? "runtime-session-channel-closed"
                    : "runtime-session-channel-read-invalid");
            }
            if (message?.type === "dialogforge-runtime-drain") {
                if (message.data === responsePath) {
                    drained = true;
                    // Worker stat is host mechanics; acceptance uses the SAME
                    // byte-length owner as native socket assembly/decoding.
                    // Never read an unbounded file when its size is unavailable.
                    checkRuntimeControlFrameByteLength(message.responseBytes);
                }
                continue;
            }

            if (message?.type === "dialogforge-output-journal") {
                await outputJournal?.receive(message.data);
                continue;
            }
            if (message?.type === "dialogforge-graphics") {
                const images = Array.isArray(message.data) ? message.data : [];
                if (options.graphicsReceived) {
                    await options.graphicsReceived(images, message.count);
                } else {
                    for (const image of images) {
                        image?.close?.();
                    }
                }
                continue;
            }
            if (message?.type === "dialogforge-prompt-reply") {
                promptTransport.receive(message.data);
                continue;
            }
            if (message?.type === "dialogforge-runtime-event") {
                const event = message.data;
                const eventError = readRuntimeControlEventError(event, request, true);
                if (eventError) {
                    throw new RuntimeControlTransportError(null, eventError);
                }
                const record = event as Record<string, unknown>;
                // A worker prompt is ready for input only when its physical
                // console read announces it, not when R creates the event.
                if (record.type !== "prompt") {
                    await options.runtimeEventReceived?.(record, request, Boolean(outputJournal));
                }
                continue;
            }
            if (!message || String(message.type || "") !== "prompt") {
                continue;
            }

            const event = promptTransport.receivePrompt(message.data, request);
            if (event) {
                await options.promptReceived?.(event);
            }
        }
        const outcome = await evaluation;
        if (!outcome.completed) {
            throw new RuntimeControlTransportError(
                outcome.error, "runtime-session-evaluation-delivery-failed"
            );
        }
        try {
            const file = await runtime.FS.readFile(responsePath);

            return decodeRuntimeControlFrameBytes(file);
        }
        catch (error) {
            throw new RuntimeControlTransportError(error, "runtime-session-response-read-failed");
        }
    }
    catch (error) {
        const knownFailure = error instanceof RuntimeControlTransportError
            || error instanceof RuntimeControlEventRetentionError
            || (error instanceof Error && error.message === "runtime-session-channel-drain-timeout");
        if (!drained && !knownFailure) {
            throw new Error("runtime-session-channel-drain-failed");
        }
        throw error;
    }
    finally {
        reading = false;
        unsubscribeRetirement();
        if (drainTimer !== null) {
            clearTimeout(drainTimer);
        }
        if (drained) {
            // Cleanup must not replace the evaluation/channel failure.
            try {
                await runtime.FS.unlink?.(responsePath);
            } catch {}
        }
    }
};


export const installWebRSharedRuntimeControl = async function(
    options: WebRSharedRuntimeControlOptions
): Promise<WebRSharedRuntimeControlClient> {
    const requestAdmission = createRuntimeControlRequestAdmission(options.maxOutstandingRequests);
    const eventRetention = createRuntimeControlEventRetention(options);
    const requestSizeLimit = createRuntimeControlRequestSizeLimit(options.maxRequestBytes);
    if (Boolean(options.orderedOutput) !== Boolean(options.outputJournalForRequest)) {
        throw new Error("WebR ordered output requires both backend configuration and request-owned delivery.");
    }
    const diagnostics = createRuntimeControlDiagnostics("webr");
    const requestPreparation = createRuntimeControlRequestPreparation({
        admission: requestAdmission,
        diagnostics,
        sizeLimit: requestSizeLimit
    });
    const startupRequest = { id: "lifecycle", method: "runtime.start" };
    diagnostics.record(startupRequest, "startup.started");
    const compilationCache = options.fetchControlCompilationCache
        ? options.fetchControlCompilationCache().catch(() => null)
        : Promise.resolve(null);
    // Fetch independently, then evaluate in the established dependency order.
    // Serial network requests added one round trip for every runtime source.
    const [initializationSource, productSource] = await Promise.all([
        options.fetchSource("runtimeInitialization.R"),
        options.fetchProductSource ? options.fetchProductSource() : Promise.resolve("")
    ]);
    const sourceNamesText = await options.runRuntimeOperation(function() {
        return options.runtime.evalRString([
            "local({",
            initializationSource,
            '    paste(c(paste("core", runtime_control_source_names(), sep = ":"),',
            '        paste("dispatch", runtime_control_source_names("dispatch"), sep = ":")), collapse = "\\n")',
            "})"
        ].join("\n"));
    });
    const sourceEntries = sourceNamesText.split("\n").filter(Boolean).map((entry) => {
        const separator = entry.indexOf(":");
        const stage = entry.slice(0, separator);
        const name = entry.slice(separator + 1);
        if (
            separator < 0
            || (stage !== "core" && stage !== "dispatch")
            || !/^[a-zA-Z0-9_-]+\.R$/.test(name)
        ) {
            throw new Error("Invalid shared runtime source manifest entry.");
        }
        return { stage, name };
    });
    if (
        !sourceEntries.some((entry) => entry.stage === "core")
        || !sourceEntries.some((entry) => entry.stage === "dispatch")
        || new Set(sourceEntries.map((entry) => entry.name)).size !== sourceEntries.length
    ) {
        throw new Error("Shared runtime source manifest is incomplete or duplicated.");
    }
    const sources = await Promise.all(sourceEntries.map(async function(entry) {
        return { stage: entry.stage, source: await options.fetchSource(entry.name) };
    }));
    diagnostics.record(startupRequest, "startup.sources_ready");

    await options.runRuntimeOperation(function() {
        return options.runtime.evalRVoid(createRuntimeEnvironmentCommand(initializationSource));
    });

    await options.runRuntimeOperation(async function() {
        const runtime = options.runtime;
        if (!runtime.FS?.writeFile) {
            throw new Error("WebR cannot stage the required runtime helper package.");
        }
        const version = await runtime.evalRString("as.character(getRversion())");
        if (!/^\d+\.\d+\.\d+$/.test(version)) {
            throw new Error("Unsupported WebR version for the runtime helper package.");
        }
        const directory = await runtime.evalRString('tempfile("dialogforge-runtime-")');
        const library = options.orderedOutput?.library || `${directory}/library`;
        await runtime.evalRVoid(`dir.create(${JSON.stringify(directory)}, recursive = TRUE)`);
        const archive = options.fetchHelperArchive ? await options.fetchHelperArchive(version) : await (async function() {
            const response = await fetch(`/r-runtime/webr/${version}/dialogforgeruntime_0.1.0.tgz`);
            if (!response.ok) {
                throw new Error("Build and serve the WebR runtime helper package before startup.");
            }
            return new Uint8Array(await response.arrayBuffer());
        })();
        const archivePath = `${directory}/dialogforgeruntime_0.1.0.tgz`;
        let stagingCompleted = false;
        try {
            await runtime.FS.writeFile(archivePath, archive);
            await runtime.evalRVoid([
                `dir.create(${JSON.stringify(library)}, recursive = TRUE, showWarnings = FALSE)`,
                `utils::untar(${JSON.stringify(archivePath)}, exdir = ${JSON.stringify(library)}, tar = "internal")`,
                ...["runtime_inspection_library", "runtime_transport_library", "runtime_output_library"].map(variable =>
                    `assign(${JSON.stringify(variable)}, ${JSON.stringify(library)}, envir = as.environment("DialogApp"))`
                )
            ].join("\n"));
            stagingCompleted = true;
        }
        finally {
            try {
                await runtime.FS.unlink?.(archivePath);
            }
            catch (error) {
                diagnostics.record(startupRequest, "startup.helper_archive_release_failed");
                // Keep the required write/extraction failure as the cause.
                // Successful staging still requires its existing cleanup.
                if (stagingCompleted) {
                    throw error;
                }
            }
        }
    });

    for (const entry of sources.filter((entry) => entry.stage === "core")) {
        await options.runRuntimeOperation(function() {
            return options.runtime.evalRVoid(
                evaluateRuntimeSourceCommand(entry.source)
            );
        });
    }
    diagnostics.record(startupRequest, "startup.helpers_ready");

    if (options.orderedOutput) {
        const { library, directory, sessionId } = options.orderedOutput;
        await options.runRuntimeOperation(function() {
            return options.runtime.evalRVoid([
                `dir.create(${JSON.stringify(directory)}, recursive = TRUE, showWarnings = FALSE)`,
                "local({",
                '    .runtime <- as.environment("DialogApp")',
                "    .runtime$runtime_ordered_output_config <- .runtime$runtime_create_ordered_output_config(",
                `        ${JSON.stringify(library)}, ${JSON.stringify(directory)}, ${JSON.stringify(sessionId)}`,
                "    )",
                "})"
            ].join("\n"));
        });
    }

    await options.runRuntimeOperation(function() {
        return options.runtime.evalRVoid(
            'as.environment("DialogApp")$runtime_install_worker_prompt_transport()'
        );
    });

    if (productSource.trim()) {
        await options.runRuntimeOperation(function() {
            return options.runtime.evalRVoid(
                evaluateRuntimeSourceCommand(productSource)
            );
        });
    }

    for (const entry of sources.filter((entry) => entry.stage === "dispatch")) {
        await options.runRuntimeOperation(function() {
            return options.runtime.evalRVoid(evaluateRuntimeSourceCommand(entry.source));
        });
    }

    if (options.runtime.read && options.runtime.FS?.readFile) {
        await options.runRuntimeOperation(function() {
            return options.runtime.evalRVoid(
                'as.environment("DialogApp")$runtime_install_worker_graphics_transport()'
            );
        });
    }

    if (options.fetchControlCompilationCache && options.runtime.FS?.writeFile) {
        const cache = await compilationCache;
        if (cache) {
            await options.runRuntimeOperation(async function() {
                const runtime = options.runtime;
                const path = await runtime.evalRString('tempfile("dialogforge-control-cache-")');
                let stagedPath = path;
                try {
                    try {
                        await runtime.FS!.writeFile!(path, cache);
                    }
                    catch {
                        stagedPath = "";
                        diagnostics.record(startupRequest, "startup.compilation_cache_unavailable");
                    }
                    await runtime.evalRVoid([
                        "local({",
                        '    .runtime <- as.environment("DialogApp")',
                        "    .runtime$runtime_control_compilation_cache <-",
                        `        .runtime$runtime_read_control_compilation_cache(${JSON.stringify(stagedPath)})`,
                        "})"
                    ].join("\n"));
                }
                finally {
                    try {
                        await runtime.FS?.unlink?.(path);
                    }
                    catch {
                        diagnostics.record(startupRequest, "startup.compilation_cache_release_failed");
                    }
                }
            });
        }
    }

    await options.runRuntimeOperation(function() {
        return options.runtime.evalRVoid(
            'as.environment("DialogApp")$runtime_prepare_control_functions(as.environment("DialogApp"))'
        );
    });

    let attached = true;
    const promptTransport = createWebRPromptTransport(options.runtime, function(request, response) {
        try {
            eventRetention.check(response.events || []);
        } catch (error) {
            attached = false;
            throw error;
        }
        diagnostics.receiveResponse(request, response);
    });
    diagnostics.record(startupRequest, "startup.ready");

    const executeRequest: RRuntimeControlClient["execute"] = async function(request, dispatchOptions) {
            if (!attached) {
                return {
                    id: request.id,
                    method: request.method,
                    ok: false,
                    transportFailure: true,
                    error: "runtime-session-detached"
                };
            }

            const prepared = requestPreparation.prepare(request);
            if (!prepared.accepted) {
                return prepared.response;
            }
            request = prepared.request;
            let encodedRequest = prepared.encodedRequest;
            const liveEventBudget = eventRetention.createRequestBudget();

            let dispatched = false;
            let transportError = "runtime-session-detached";
            let outputJournal: WebROutputJournalReader | null | undefined;
            try {
                if (request.method === "reply_prompt") {
                    const response = await promptTransport.send(request, {
                        ...dispatchOptions,
                        onDispatched: function() {
                            dispatchOptions?.onDispatched?.();
                            dispatched = true;
                            diagnostics.record(request, "request.sent");
                        }
                    });
                    if (response.transportFailure) {
                        attached = false;
                        transportError = response.error || "runtime-session-detached";
                    }
                    return response;
                }
                let command = executeRuntimeMethodCommand(encodedRequest);
                const text = await options.runRuntimeOperation(async function() {
                    if (!attached) {
                        throw new Error("runtime-session-detached");
                    }
                    diagnostics.record(request, "request.dequeued");
                    await options.prepareRequest?.(request);
                    if (!attached) {
                        throw new Error("runtime-session-detached");
                    }
                    const orderedInput = request.method === "execute_input" && request.params?.visible !== false;
                    outputJournal = orderedInput ? options.outputJournalForRequest?.(request) : null;
                    if (options.orderedOutput && orderedInput && !outputJournal) {
                        throw new Error("WebR ordered input has no request-owned output delivery.");
                    }
                    if (outputJournal) {
                        if (request.method !== "execute_input") {
                            throw new Error("WebR ordered output only supports input execution.");
                        }
                        request = { ...request, params: { ...request.params, ...outputJournal.params } };
                        encodedRequest = encodeRuntimeControlOutputCapture(encodedRequest, outputJournal.params);
                        requestSizeLimit.check(encodedRequest);
                        command = executeRuntimeMethodCommand(encodedRequest);
                    }
                    if (outputJournal && (!options.runtime.read || !options.runtime.FS?.readFile)) {
                        throw new Error("WebR output transport requires worker-channel and response-file access.");
                    }
                    dispatchOptions?.onDispatched?.();
                    dispatched = true;
                    diagnostics.record(request, "request.sent");
                    if (!attached) {
                        throw new Error("runtime-session-detached");
                    }
                    if (options.runtime.read && options.runtime.FS?.readFile) {
                        return executeWorkerRuntimeMethod(
                            {
                                ...options,
                                runtimeEventReceived: async function(event, owner, ordered) {
                                    if (!attached) {
                                        return;
                                    }
                                    liveEventBudget.check([event]);
                                    diagnostics.receiveEvent(request, event);
                                    await options.runtimeEventReceived?.(event, owner, ordered);
                                },
                                promptReceived: async function(input) {
                                    if (!attached) {
                                        return;
                                    }
                                    liveEventBudget.check([input]);
                                    diagnostics.record(request, "prompt.requested");
                                    await options.promptReceived?.(input);
                                }
                            },
                            request,
                            command,
                            promptTransport,
                            requestAdmission,
                            outputJournal
                        );
                    }

                    const responseText = await options.runtime.evalRString(command);
                    // UTF-16 length is a cheap lower bound; the SDK string
                    // still needs the SAME UTF-8 byte check as file/socket data.
                    checkRuntimeControlFrameByteLength(responseText.length);
                    checkRuntimeControlFrameByteLength(
                        new TextEncoder().encode(responseText).byteLength
                    );
                    return responseText;
                }, () => requestAdmission.waitForRelease(request.id));
                let result;
                try {
                    result = JSON.parse(String(text || "").trim());
                } catch {
                    attached = false;
                    throw new Error("runtime-session-batch-response-mismatch");
                }
                const responseError = readRuntimeControlResponseError(result, request);
                if (responseError) {
                    attached = false;
                    throw new RuntimeControlTransportError(null, responseError);
                }
                try {
                    // The worker response repeats events already sent live.
                    // Check that complete list without counting it a second time.
                    eventRetention.check(result.events || []);
                } catch (error) {
                    attached = false;
                    throw error;
                }
                diagnostics.receiveResponse(
                    request, result,
                    diagnostics.enabled ? new TextEncoder().encode(text).byteLength : 0
                );

                const response = createValidatedRuntimeControlResponse(result);
                dispatchOptions?.onResponseReceived?.(response);
                return outputJournal ? await outputJournal.finish(response) : response;
            }
            catch (error) {
                if (
                    error instanceof RuntimeControlTransportError
                    || error instanceof RuntimeControlEventRetentionError
                    || (error instanceof Error && error.message.startsWith("runtime-session-channel-drain-"))
                ) {
                    attached = false;
                }
                if (!attached && error instanceof Error) {
                    transportError = error.message;
                }
                await outputJournal?.retire();
                diagnostics.record(request, "request.failed");
                return {
                    id: request.id,
                    method: request.method,
                    ok: false,
                    ...(!dispatched && error instanceof Error && error.message === "runtime-session-request-too-large"
                        ? { requestRejected: true } : { transportFailure: !attached }),
                    error: error instanceof Error
                        ? error.message
                        : String(error)
                };
            }
            finally {
                if (!attached) {
                    requestAdmission.retire(transportError);
                    promptTransport.retire();
                }
                else {
                    requestAdmission.releaseAfterResponseDelivery(
                        request.id,
                        dispatched ? dispatchOptions?.waitForResponseDelivery : undefined,
                        function(): void {
                            attached = false;
                            promptTransport.retire();
                        }
                    );
                }
                if (dispatched && request.method === "execute_input") {
                    promptTransport.finishActivity(String(request.params?.parentId || ""));
                }
                diagnostics.record(request, "response.resolved");
            }
        };

    return {
        getWorkspaceEpoch: requestPreparation.getWorkspaceEpoch,
        execute: function(request, dispatchOptions) {
            return executeRuntimeControlRequestWithDeadline(request,
                (dispatch) => executeRequest(request, dispatch), dispatchOptions,
                () => diagnostics.record(request, "request.timed_out"), {
                    subscribe: requestAdmission.subscribeRetirement
                });
        },
        detach: function() {
            requestPreparation.retireWorkspaceEpoch();
            attached = false;
            requestAdmission.retire();
            promptTransport.retire();
        }
    };
};
