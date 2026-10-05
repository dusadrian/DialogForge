"use strict";

const assert = require("node:assert/strict");
const { installWebRSharedRuntimeControl } = require("../dist/src/runtime/providers/webr/webRSharedRuntimeControl");
const { prewarmWebRGraphicsTransport } = require("../dist/src/runtime/providers/webr/webRGraphicsTransport");

const fixture = async function(response, { responseText, ...controlOptions } = {}) {
    const commands = [];
    let lastCommand = "";
    const runtime = {
        evalRVoid: async (command) => { commands.push(command); },
        evalRString: async (command) => {
            if (command.includes('runtime_control_source_names("dispatch")')) {
                return "core:runtimePrelude.R\ndispatch:runtimeDispatchCore.R\ndispatch:runtimeConsoleBindings.R";
            }
            if (command === "as.character(getRversion())") return "4.6.0";
            if (command.startsWith('tempfile(')) return "/fixture";
            lastCommand = command;
            return responseText === undefined ? JSON.stringify(response) : responseText;
        },
        FS: { writeFile: async () => {}, unlink: async () => {} }
    };
    const client = await installWebRSharedRuntimeControl({
        ...controlOptions,
        runtime, fetchSource: async () => "", fetchInspectionArchive: async () => new Uint8Array(),
        fetchTransportArchive: async () => new Uint8Array(),
        runRuntimeOperation: (action) => action()
    });
    return { client, command: () => lastCommand, commands };
};

const main = async function() {
    const graphicsCalls = [];
    let graphicsFlushes = 0;
    let graphicsPurges = 0;
    const graphicsRuntime = {
        Shelter: function() {
            return Promise.resolve({
                captureR: async function(command, options) {
                    graphicsCalls.push({ command, options });
                    return { output: [{ data: "response" }], images: ["fixture-image"] };
                },
                purge: async () => { graphicsPurges += 1; }
            });
        },
        flush: async () => { graphicsFlushes += 1; return []; }
    };
    const closedImages = [];
    assert.equal(await prewarmWebRGraphicsTransport(graphicsRuntime, {
        closeImages: (images) => closedImages.push(...images)
    }), true);
    assert.equal(graphicsCalls[0].command, "local({ plot.new(); invisible(NULL) })");
    assert.deepEqual(closedImages, ["fixture-image"]);
    assert.equal(graphicsCalls[0].options.captureGraphics.width, 720);
    assert.equal(graphicsFlushes, 1);
    assert.equal(graphicsPurges, 1);

    let readCount = 0;
    let nextMessage;
    const queuedMessages = [];
    const receiveMessage = function(message) {
        if (nextMessage) {
            const resolve = nextMessage;
            nextMessage = null;
            resolve(message);
        } else {
            queuedMessages.push(message);
        }
    };
    const receivedImages = [];
    const responses = new Map();
    let retentionStream = false;
    let responseReadFailure = null;
    let corruptResponseEncoding = false;
    let oversizedResponse = false;
    let missingResponseSize = false;
    let responseFileReads = 0;
    let responseUnlinkFailure = false;
    let responseEvaluations = 0;
    let responseUnlinks = 0;
    let sdkEvaluationFailureEnabled = false;
    let sdkEvaluationFailure;
    const runtime = {
        evalRVoid: async function(command) {
            const path = command.match(/writeChar\(\.payload, ("[^"]+")/);
            if (!path) {
                return;
            }
            const responsePath = JSON.parse(path[1]);
            responseEvaluations++;
            const raw = JSON.parse(command.match(/\.raw <- ("(?:[^"\\]|\\.)*")/)[1]);
            const id = decodeURIComponent(JSON.parse(raw).id);
            responses.set(responsePath, new TextEncoder().encode(JSON.stringify({
                id, method: "execute_input", ok: true, events: [],
                ...(corruptResponseEncoding ? { result: "valid-encoding-payload" } : {})
            })));
            // Evaluation resolves first; the existing pending read must receive the fence.
            setTimeout(() => {
                if (retentionStream) {
                    receiveMessage({ type: "dialogforge-runtime-event", data: {
                        type: "stream", parent_id: id, text: "ş😀"
                    } });
                }
                receiveMessage({ type: "dialogforge-graphics", data: [id] });
                receiveMessage({ type: "dialogforge-runtime-drain", data: responsePath,
                    ...(!missingResponseSize ? { responseBytes: responses.get(responsePath).byteLength } : {}) });
            }, 0);
            if (sdkEvaluationFailureEnabled) throw sdkEvaluationFailure;
        },
        evalRString: async (command) => {
            if (command.includes('runtime_control_source_names("dispatch")')) {
                return "core:runtimePrelude.R\ndispatch:runtimeDispatchCore.R\ndispatch:runtimeConsoleBindings.R";
            }
            return command === "as.character(getRversion())" ? "4.6.0" : "/fixture";
        },
        read: function() {
            readCount += 1;
            if (queuedMessages.length) {
                return Promise.resolve(queuedMessages.shift());
            }
            return new Promise((resolve) => { nextMessage = resolve; });
        },
        FS: {
            writeFile: async () => {},
            unlink: async (path) => {
                if (path.startsWith("/tmp/dialogforge-runtime-")) {
                    responseUnlinks++;
                    if (responseUnlinkFailure) throw Error("private cleanup path");
                }
            },
            readFile: async (path) => {
                responseFileReads++;
                if (responseReadFailure) throw responseReadFailure;
                const bytes = responses.get(path);
                if (oversizedResponse) {
                    const large = new Uint8Array(16 * 1024 * 1024 + 1).fill(32);
                    large.set(bytes);
                    return large;
                }
                if (corruptResponseEncoding) {
                    const corrupt = new Uint8Array(bytes);
                    // Corrupt a character inside JSON text, not its structure.
                    const index = new TextDecoder().decode(bytes).indexOf("valid-encoding-payload");
                    assert.ok(index >= 0, "Encoding fault must target payload text, never request identity.");
                    corrupt[index] = 0xff;
                    return corrupt;
                }
                return bytes;
            }
        }
    };
    const drainedClient = await installWebRSharedRuntimeControl({
        runtime, fetchSource: async () => "", fetchInspectionArchive: async () => new Uint8Array(),
        fetchTransportArchive: async () => new Uint8Array(),
        graphicsReceived: (images) => receivedImages.push(...images),
        runRuntimeOperation: (action) => action()
    });
    for (const id of ["read-one", "read-two"]) {
        const result = await drainedClient.execute({
            id, method: "execute_input", params: { code: 'indirect_helper()', parentId: id }
        });
        assert.equal(result.ok, true);
    }
    assert.equal(readCount, 4, "One reader handles bitmap delivery and drain, without orphan readers.");
    assert.deepEqual(receivedImages, ["read-one", "read-two"], "Graphics delivery must not depend on command text.");
    drainedClient.detach();

    for (const fault of [Error("private-response-path-and-secret"), "private-non-error-secret"]) {
        responseReadFailure = fault;
        const reader = await installWebRSharedRuntimeControl({
            runtime, fetchSource: async () => "", fetchInspectionArchive: async () => new Uint8Array(),
            fetchTransportArchive: async () => new Uint8Array(), runRuntimeOperation: action => action()
        });
        const evaluationsBefore = responseEvaluations;
        const unlinksBefore = responseUnlinks;
        const failed = await reader.execute({ id: "response-read-fault", method: "execute_input",
            params: { code: "already_executed <- TRUE", parentId: "response-read-fault" } });
        assert.equal(failed.transportFailure, true,
            "A lost physical response is not an ordinary R evaluation rejection.");
        assert.equal(failed.error, "runtime-session-response-read-failed",
            "Physical filesystem details must not leak into console error messages.");
        assert.equal(responseUnlinks, unlinksBefore + 1, "A drained response file still receives scoped cleanup.");
        assert.equal((await reader.execute({ id: "after-response-read-fault", method: "execute_input" })).error,
            "runtime-session-detached");
        assert.equal(responseEvaluations, evaluationsBefore + 1,
            "A failed physical reply cannot replay its mutation or dispatch a new command.");
        reader.detach();
    }
    responseReadFailure = null;
    responseUnlinkFailure = true;
    const cleanupReader = await installWebRSharedRuntimeControl({
        runtime, fetchSource: async () => "", fetchInspectionArchive: async () => new Uint8Array(),
        fetchTransportArchive: async () => new Uint8Array(), runRuntimeOperation: action => action()
    });
    for (const id of ["cleanup-fault", "after-cleanup-fault"]) {
        assert.equal((await cleanupReader.execute({ id, method: "execute_input", params: { parentId: id } })).ok, true,
            "Cleanup failure cannot replace an accepted drained response or retire its usable attachment.");
    }
    cleanupReader.detach();
    responseUnlinkFailure = false;

    corruptResponseEncoding = true;
    const encodingReader = await installWebRSharedRuntimeControl({
        runtime, fetchSource: async () => "", fetchInspectionArchive: async () => new Uint8Array(),
        fetchTransportArchive: async () => new Uint8Array(), runRuntimeOperation: action => action()
    });
    const invalidEncoding = await encodingReader.execute({ id: "encoding-read-fault", method: "execute_input",
        params: { parentId: "encoding-read-fault" } });
    assert.equal(invalidEncoding.error, "runtime-session-frame-encoding-invalid",
        "The worker must reject corrupt UTF-8 bytes instead of accepting replacement characters.");
    assert.equal(invalidEncoding.transportFailure, true);
    assert.equal((await encodingReader.execute({ id: "after-encoding-fault", method: "workspace.snapshot" })).error,
        "runtime-session-detached");
    encodingReader.detach();
    corruptResponseEncoding = false;

    sdkEvaluationFailureEnabled = true;
    for (const failure of [Error("private-sdk-evaluation-error"), "private-sdk-non-error", null, undefined]) {
        sdkEvaluationFailure = failure;
        const evaluationReader = await installWebRSharedRuntimeControl({
            runtime, fetchSource: async () => "", fetchInspectionArchive: async () => new Uint8Array(),
            fetchTransportArchive: async () => new Uint8Array(), runRuntimeOperation: action => action()
        });
        const beforeEvaluation = responseEvaluations;
        const beforeRead = responseFileReads;
        const failed = await evaluationReader.execute({ id: "sdk-evaluation-fault", method: "execute_input",
            params: { parentId: "sdk-evaluation-fault" } });
        assert.equal(failed.ok, false, "Even null/undefined SDK rejection is failure, never a successful evaluation.");
        assert.equal(failed.error, "runtime-session-evaluation-delivery-failed");
        assert.equal(failed.transportFailure, true,
            "An SDK evaluation rejection after its fence is uncertain transport loss, not ordinary R rejection.");
        assert.equal(responseEvaluations, beforeEvaluation + 1);
        assert.equal(responseFileReads, beforeRead, "Never read/accept effects from a failed physical evaluation.");
        assert.equal((await evaluationReader.execute({ id: "after-sdk-fault", method: "workspace.snapshot" })).error,
            "runtime-session-detached");
        evaluationReader.detach();
    }
    sdkEvaluationFailureEnabled = false;
    oversizedResponse = true;
    const oversizedReader = await installWebRSharedRuntimeControl({
        runtime, fetchSource: async () => "", fetchInspectionArchive: async () => new Uint8Array(),
        fetchTransportArchive: async () => new Uint8Array(), runRuntimeOperation: action => action()
    });
    const tooLarge = await oversizedReader.execute({ id: "oversized-read-fault", method: "execute_input",
        params: { parentId: "oversized-read-fault" } });
    assert.equal(tooLarge.error, "runtime-session-frame-too-large",
        "A worker response cannot bypass the SAME native frame-size ceiling.");
    assert.equal(tooLarge.transportFailure, true);
    assert.equal((await oversizedReader.execute({ id: "after-oversized-fault", method: "workspace.snapshot" })).error,
        "runtime-session-detached");
    oversizedReader.detach();
    oversizedResponse = false;

    missingResponseSize = true;
    const missingSizeReader = await installWebRSharedRuntimeControl({
        runtime, fetchSource: async () => "", fetchInspectionArchive: async () => new Uint8Array(),
        fetchTransportArchive: async () => new Uint8Array(), runRuntimeOperation: action => action()
    });
    const readsBefore = responseFileReads;
    const missingSize = await missingSizeReader.execute({ id: "missing-size", method: "execute_input",
        params: { parentId: "missing-size" } });
    assert.equal(missingSize.error, "runtime-session-invalid-frame-size");
    assert.equal(missingSize.transportFailure, true);
    assert.equal(responseFileReads, readsBefore, "An unknown physical response size cannot trigger unbounded SDK reading.");
    missingSizeReader.detach();
    missingResponseSize = false;

    retentionStream = true;
    const liveRetentionClient = await installWebRSharedRuntimeControl({
        maxRetainedEventBytes: 1,
        runtime, fetchSource: async () => "", fetchInspectionArchive: async () => new Uint8Array(),
        fetchTransportArchive: async () => new Uint8Array(),
        runRuntimeOperation: (action) => action()
    });
    const liveRetention = await liveRetentionClient.execute({
        id: "live-retention", method: "execute_input", params: { parentId: "live-retention" }
    });
    assert.equal(liveRetention.error, "runtime-session-event-retention-limit",
        "Physical channel adaptation must preserve the SAME retention failure identity.");
    assert.equal(liveRetention.transportFailure, true);
    assert.equal((await liveRetentionClient.execute({
        id: "after-live-retention", method: "workspace.snapshot"
    })).error, "runtime-session-detached");
    liveRetentionClient.detach();

    const request = { id: "batch-owner", method: "evaluate_code", params: { code: "1" } };
    const valid = await fixture({ id: request.id, method: request.method, ok: true, events: [] });
    assert.equal((await valid.client.execute(request)).ok, true);
    assert.ok(valid.command().includes("runtime_transport_decode_request("), "Request identity comes from the shared decoder.");
    assert.ok(valid.command().includes("runtime_evaluate_control_request("), "Both hosts use the shared evaluator.");
    assert.equal(valid.command().includes("$eval_method("), false, "Worker transport must not duplicate evaluation policy.");
    assert.equal(valid.command().includes("$runtime_diagnostic_begin("), false, "Diagnostic lifecycle belongs to the shared evaluator.");
    valid.client.detach();
    const bounded = await fixture({ id: request.id, method: request.method, ok: true, events: [] }, {
        maxRequestBytes: 262144, maxOutstandingRequests: 1
    });
    let oversizedDispatched = false;
    const oversized = await bounded.client.execute({
        id: "oversized", method: "evaluate_code", params: { code: "x".repeat(262144) }
    }, { onDispatched: () => { oversizedDispatched = true; } });
    assert.equal(oversized.error, "runtime-session-request-too-large");
    assert.equal(oversized.requestRejected, true);
    assert.equal(oversizedDispatched, false);
    assert.equal(bounded.client.getWorkspaceEpoch(), 0);
    assert.equal((await bounded.client.execute(request)).ok, true, "Rejected size must release admission and retain a usable attachment.");
    bounded.client.detach();
    for (const response of [null, [],
        { id: "foreign", method: request.method, ok: true },
        { id: request.id, method: "foreign", ok: true },
        { id: request.id, method: request.method, ok: "true" },
        { id: request.id, method: request.method, ok: true, events: {} }
    ]) {
        const invalid = await fixture(response);
        const result = await invalid.client.execute(request);
        assert.equal(result.ok, false);
        assert.equal(result.transportFailure, true);
        assert.equal(result.error, response && !Array.isArray(response) && response.events
            ? "runtime-session-invalid-response-events" : "runtime-session-response-mismatch");
        assert.equal((await invalid.client.execute(request)).error, "runtime-session-detached");
    }
    for (const responseText of ["", "{", "not JSON"]) {
        const invalid = await fixture(null, { responseText });
        const result = await invalid.client.execute(request);
        assert.equal(result.error, "runtime-session-batch-response-mismatch");
        assert.equal(result.transportFailure, true);
        assert.equal((await invalid.client.execute(request)).error, "runtime-session-detached");
    }
    const envelope = { id: request.id, method: request.method, ok: true, result: "", events: [] };
    const maximumPayload = 16 * 1024 * 1024 - JSON.stringify(envelope).length;
    for (const payload of ["ş😀", "x".repeat(maximumPayload)]) {
        const accepted = await fixture({ ...envelope, result: payload });
        const response = await accepted.client.execute(request);
        assert.equal(response.ok, true);
        assert.equal(response.result, payload, "Ordinary Unicode and exact-byte-ceiling fallback replies remain accepted.");
        accepted.client.detach();
    }
    for (const payload of ["x".repeat(16 * 1024 * 1024), "ş".repeat(8 * 1024 * 1024)]) {
        const fallback = await fixture({ id: request.id, method: request.method, ok: true,
            result: payload, events: [] });
        let dispatches = 0;
        const rejected = await fallback.client.execute(request, { onDispatched: () => { dispatches++; } });
        assert.equal(rejected.ok, false,
            "The string-only physical adapter cannot bypass the SAME response-byte ceiling.");
        assert.equal(rejected.error, "runtime-session-frame-too-large");
        assert.equal(rejected.transportFailure, true);
        assert.equal((await fallback.client.execute(request)).error, "runtime-session-detached");
        assert.equal(dispatches, 1, "Oversized fallback replies must not replay already-dispatched R work.");
        fallback.client.detach();
    }
    for (const controlOptions of [{ maxRetainedEvents: 1 }, { maxRetainedEventBytes: 1 }]) {
        const limited = await fixture({
            id: request.id, method: request.method, ok: true,
            events: [{ type: "stream", text: "ş😀" }, { type: "completion" }]
        }, controlOptions);
        const result = await limited.client.execute(request);
        assert.equal(result.error, "runtime-session-event-retention-limit");
        assert.equal(result.transportFailure, true);
        assert.equal((await limited.client.execute(request)).error, "runtime-session-detached");
    }
    console.log("WebR batch ownership cases passed; actual R collection cleanup and incremental delivery remain separate.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
