"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { readRuntimeControlEventError, readRuntimeControlResponseError, createValidatedRuntimeControlResponse,
    RuntimeControlTransportError, decodeRuntimeControlFrameBytes,
    checkRuntimeControlFrameByteLength, maximumRuntimeControlFrameBytes } = require("../dist/src/runtime/providers/r/protocol/runtimeControlResponseValidation");
const { createRuntimeControlClient } = require("../dist/src/runtime/providers/r/protocol/runtimeControlClient");
const { installWebRSharedRuntimeControl } = require("../dist/src/runtime/providers/webr/webRSharedRuntimeControl");
const { readWebRPromptEvent } = require("../dist/src/runtime/providers/webr/webRPromptTransport");
const { createRuntimeOperationQueue } = require("../dist/src/runtime/session/runtimeOperationQueue");
const { createRuntimeControlRequestAdmission } = require("../dist/src/runtime/providers/r/protocol/runtimeControlRequestAdmission");
const { createRVisibleCommandExecutor } = require("../dist/src/runtime/providers/r/controllers/rVisibleCommandExecutor");
const { createVisibleCommandRequest, commandExecutionDidNotSucceed } = require("../dist/src/runtime/commands/commandProtocol");
const { createRuntimeCommandReceipt, runtimeCommandResultSucceeded } = require("../dist/src/runtime/commands/runtimeCommandReceipt");
const { createRuntimeCommandOperationController } = require("../dist/src/runtime/commands/runtimeCommandOperationController");
const {
    createRuntimeControlEventRetention
} = require("../dist/src/runtime/providers/r/protocol/runtimeControlEventRetention");

const retentionEvent = { type: "stream", text: "ş😀" };
const retentionBytes = Buffer.byteLength(JSON.stringify(retentionEvent));
const byteRetention = createRuntimeControlEventRetention({ maxRetainedEventBytes: retentionBytes * 2 });
const byteBudget = byteRetention.createRequestBudget();
byteBudget.check([retentionEvent]);
byteBudget.check([retentionEvent]);
assert.throws(() => byteBudget.check([retentionEvent]), /event-retention-limit/);
byteRetention.createRequestBudget().check([retentionEvent, retentionEvent]);
const countRetention = createRuntimeControlEventRetention({ maxRetainedEvents: 2 });
const countBudget = countRetention.createRequestBudget();
countBudget.check([retentionEvent]);
countBudget.check([retentionEvent]);
assert.throws(() => countBudget.check([retentionEvent]), /event-retention-limit/);
countRetention.createRequestBudget().check([retentionEvent, retentionEvent]);

const request = { id: "owned", method: "execute_input", transportNonce: "attachment:1", params: { parentId: "activity" } };
const response = { ...request, ok: true, events: [] };
for (const host of ["r", "webr"]) {
    const text = '{"text":"ş😀\\n"}';
    assert.equal(decodeRuntimeControlFrameBytes(new TextEncoder().encode(text)), text, host);
    for (const bytes of [[0xff], [0xc3], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80]]) {
        assert.throws(() => decodeRuntimeControlFrameBytes(new Uint8Array(bytes)), error =>
            error instanceof RuntimeControlTransportError && error.message === "runtime-session-frame-encoding-invalid");
    }
    assert.equal(decodeRuntimeControlFrameBytes(new Uint8Array(512).fill(32), 512).length, 512);
    assert.throws(() => decodeRuntimeControlFrameBytes(new Uint8Array(513).fill(32), 512), error =>
        error instanceof RuntimeControlTransportError && error.message === "runtime-session-frame-too-large",
        "Both hosts enforce the same complete-response byte ceiling before decoding.");
    checkRuntimeControlFrameByteLength(0);
    checkRuntimeControlFrameByteLength(maximumRuntimeControlFrameBytes);
    assert.throws(() => checkRuntimeControlFrameByteLength(maximumRuntimeControlFrameBytes + 1), /frame-too-large/);
    for (const length of [null, undefined, "512", -1, 0.5, NaN, Infinity]) {
        assert.throws(() => checkRuntimeControlFrameByteLength(length), /invalid-frame-size/);
    }
    assert.throws(() => checkRuntimeControlFrameByteLength(0, NaN), /frame limit/);
    const privateFailure = Error("private socket/file contents");
    const physicalFailure = new RuntimeControlTransportError(privateFailure, "runtime-session-response-read-failed");
    assert.equal(physicalFailure.message, "runtime-session-response-read-failed", host);
    assert.equal(physicalFailure.cause, privateFailure);
    assert.equal(new RuntimeControlTransportError(Error("runtime-session-known-failure"),
        "runtime-session-frame-delivery-failed").message, "runtime-session-known-failure");
    assert.equal(new RuntimeControlTransportError("private-non-error", "runtime-session-frame-delivery-failed").message,
        "runtime-session-frame-delivery-failed");
    assert.equal(readRuntimeControlResponseError(response, request), null, host);
    const stream = { type: "stream", id: "stream-event", parent_id: "activity", text: "owned" };
    assert.equal(readRuntimeControlEventError(stream, request, true), null);
    assert.equal(readRuntimeControlEventError({ ...stream, parent_id: " Ω😀 " },
        { ...request, params: { parentId: " Ω😀 " } }, true), null,
        "Ownership compares the exact R activity identity, never a normalized label.");
    assert.equal(readRuntimeControlEventError({ type: "prompt_state" }, request, true), null,
        "Parentless prompt-state delivery remains supported.");
    assert.equal(readRuntimeControlEventError(stream, { ...request, method: "evaluate_code" }, true),
        "runtime-session-event-request-mode-mismatch");
    assert.equal(readRuntimeControlEventError(stream, { ...request, method: "evaluate_code" }), null,
        "A returned query event is not unsolicited live input delivery.");
    assert.equal(readRuntimeControlEventError({ ...stream, parent_id: "foreign" }, request),
        "runtime-session-event-identity-mismatch");
    for (const event of [null, [], "text", {}, { ...stream, type: "" },
        { ...stream, id: 12 }, { ...stream, parent_id: 12 }]) {
        assert.equal(readRuntimeControlEventError(event, request), "runtime-session-invalid-event-envelope");
        assert.equal(readRuntimeControlResponseError({ ...response, events: [event] }, request),
            "runtime-session-invalid-event-envelope");
    }
    const prompt = { type: "prompt", id: "prompt-event", parent_id: "activity", prompt: "", password: false };
    assert.equal(readRuntimeControlEventError(prompt, request, true), null);
    assert.deepEqual(readWebRPromptEvent("DIALOGFORGE_PROMPT1:" + JSON.stringify(prompt), request), prompt);
    for (const invalid of [{ ...prompt, id: "" }, { ...prompt, parent_id: "" },
        { ...prompt, prompt: null }, { ...prompt, password: "false" }]) {
        assert.equal(readRuntimeControlEventError(invalid, request), "runtime-session-invalid-event-envelope");
        assert.throws(() => readWebRPromptEvent("DIALOGFORGE_PROMPT1:" + JSON.stringify(invalid), request),
            /runtime-session-invalid-event-envelope/);
    }
    assert.throws(() => readWebRPromptEvent("DIALOGFORGE_PROMPT1:" + JSON.stringify({ ...prompt, parent_id: "foreign" }), request),
        /runtime-session-event-identity-mismatch/);
    assert.equal(readRuntimeControlResponseError({ ...response, ok: false }, request), null);
    for (const invalid of [null, [], "text", { ...response, id: "foreign" },
        { ...response, method: "evaluate_code" }, { ...response, ok: "true" }]) {
        assert.equal(readRuntimeControlResponseError(invalid, request), "runtime-session-response-mismatch");
    }
    assert.equal(readRuntimeControlResponseError({ ...response, events: {} }, request), "runtime-session-invalid-response-events");
    assert.equal(readRuntimeControlResponseError({ ...response, events: undefined }, request), null);
    assert.equal(readRuntimeControlResponseError({ ...response, completionFailure: "true" }, request), "runtime-session-response-mismatch");
    assert.equal(readRuntimeControlResponseError({ ...response, completionFailure: true }, request), "runtime-session-response-mismatch");
    const failedCompletion = { ...response, ok: false, completionFailure: true, error: "flush failed" };
    assert.equal(readRuntimeControlResponseError(failedCompletion, request), null);
    assert.equal(createValidatedRuntimeControlResponse(failedCompletion).completionFailure, true);
    const retained = [{ type: "stream", text: "already collected" }];
    assert.equal(createValidatedRuntimeControlResponse(response, retained).events, retained);
    assert.equal("completionFailure" in createValidatedRuntimeControlResponse(response), false);
    assert.equal(readRuntimeControlResponseError(response, request, true), null);
    assert.equal(readRuntimeControlResponseError({ ...response, transportNonce: "old:1" }, request, true), "runtime-session-response-identity-mismatch");
    assert.equal(readRuntimeControlResponseError({ ...response, transportNonce: undefined }, request, true), "runtime-session-response-identity-mismatch");
    assert.equal(readRuntimeControlResponseError({ ...response, transportNonce: undefined },
        { ...request, transportNonce: undefined }, true), "runtime-session-response-identity-mismatch");
}

for (const file of ["runtime/providers/r/protocol/runtimeControlFrameReader.ts",
    "runtime/providers/webr/webRSharedRuntimeControl.ts"]) {
    assert.ok(fs.readFileSync(path.join(__dirname, "../src", file), "utf8").includes("decodeRuntimeControlFrameBytes("),
        "Both adapters decode physical bytes with the SAME canonical function.");
}

for (const relativePath of [
    "src/runtime/providers/r/protocol/runtimeControlClient.ts",
    "src/runtime/providers/webr/webRSharedRuntimeControl.ts",
    "src/runtime/providers/webr/webRPromptTransport.ts"
]) {
    const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
    assert.ok(source.includes("readRuntimeControlResponseError("));
    assert.ok(source.includes("readRuntimeControlEventError("),
        "Both transports and the physical prompt envelope use the SAME event validator.");
    assert.ok(source.includes("createValidatedRuntimeControlResponse("));
    if (!relativePath.endsWith("webRPromptTransport.ts")) {
        assert.ok(source.includes("new RuntimeControlTransportError("),
            "Both physical response adapters use the SAME transport failure type and diagnostic policy.");
    }
}
const checkEventThroughHostTransport = async function(host, delivery, fixture) {
    const activeRequest = { id: "transport-owner", method: fixture.method || "execute_input",
        params: { parentId: fixture.parentId ?? "activity" } };
    const expectedError = fixture.liveOnly && delivery === "tail" ? null : fixture.error;
    const fixtureEvents = fixture.events || [fixture.event];
    const forwarded = [];
    const files = new Map();
    const messages = [];
    const peers = new Set();
    let dispatches = 0;
    let client;
    let server;
    let deadline;
    let releaseDelivery;
    let rejectDelivery;
    let deliveryCalls = 0;
    const deliveryBarrier = fixture.barrier ? new Promise((resolve, reject) => {
        releaseDelivery = resolve;
        rejectDelivery = reject;
    }) : null;
    const withinDeadline = async function(work) {
        try {
            return await Promise.race([
                work,
                new Promise((resolve, reject) => {
                    deadline = setTimeout(() => reject(Error("Owned event adapter fixture stalled.")), 2000);
                })
            ]);
        }
        finally {
            clearTimeout(deadline);
        }
    };
    let acceptedBeforeFailure = fixture.acceptedBeforeFailure ?? 0;
    const createResponse = function(id, method, nonce) {
        const events = fixtureEvents.map(function(event) {
            return event && typeof event === "object" && !Array.isArray(event)
                ? { ...event, ...(nonce ? { transportNonce: nonce } : {}) } : event;
        });
        if (fixture.limits?.maxRetainedEventBytes && fixture.error) {
            acceptedBeforeFailure = Math.floor(
                fixture.limits.maxRetainedEventBytes / Buffer.byteLength(JSON.stringify(events[0]))
            );
        }
        return { id, method, ok: true,
            events: dispatches === 1 && (delivery === "tail" || host === "worker") ? events : [],
            ...(nonce ? { transportNonce: nonce } : {}) };
    };
    try {
        if (host !== "worker") {
            server = net.createServer(function(socket) {
                peers.add(socket);
                let input = "";
                socket.setEncoding("utf8");
                socket.on("data", function(bytes) {
                    input += bytes;
                    const boundary = input.indexOf("\n");
                    if (boundary < 0) {
                        return;
                    }
                    const wire = JSON.parse(input.slice(0, boundary));
                    input = input.slice(boundary + 1);
                    dispatches++;
                    const nonce = wire.transportNonce ? decodeURIComponent(wire.transportNonce) : undefined;
                    const response = createResponse(
                        decodeURIComponent(wire.id), decodeURIComponent(wire.method), nonce
                    );
                    if (delivery !== "tail" && dispatches === 1) {
                        for (const event of fixtureEvents) {
                            socket.write(JSON.stringify({ ...event,
                                ...(nonce ? { transportNonce: nonce } : {}) }) + "\n");
                        }
                    }
                    socket.write(JSON.stringify(response) + "\n");
                });
            });
            await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
            client = createRuntimeControlClient({
                host: "127.0.0.1", port: server.address().port,
                ...(host === "native" ? {
                    responseIdentity: "attachment-request-v1", eventIdentity: "request-nonce-v1"
                } : {})
            }, { ...fixture.limits, onEvent: event => { forwarded.push(event); } });
        }
        else {
            const runtime = {
                evalRString: async function(command) {
                    if (command.includes('runtime_control_source_names("dispatch")')) {
                        return "core:runtimePrelude.R\ndispatch:runtimeDispatchCore.R";
                    }
                    return command === "as.character(getRversion())" ? "4.6.0" : "/fixture";
                },
                evalRVoid: async function(command) {
                    const file = command.match(/writeChar\(\.payload, ("[^"]+")/);
                    if (!file) {
                        return;
                    }
                    dispatches++;
                    const raw = JSON.parse(command.match(/\.raw <- ("(?:[^"\\]|\\.)*")/)[1]);
                    const wire = JSON.parse(raw);
                    const responsePath = JSON.parse(file[1]);
                    files.set(responsePath, new TextEncoder().encode(JSON.stringify(createResponse(
                        decodeURIComponent(wire.id), decodeURIComponent(wire.method)
                    ))));
                    if (delivery !== "tail" && dispatches === 1) {
                        for (const event of fixtureEvents) {
                            messages.push(delivery === "physical-prompt"
                                ? { type: "prompt", data: "DIALOGFORGE_PROMPT1:" + JSON.stringify(event) }
                                : { type: "dialogforge-runtime-event", data: event });
                        }
                    }
                    messages.push({ type: "dialogforge-runtime-drain", data: responsePath,
                        responseBytes: files.get(responsePath).byteLength });
                },
                read: async function() {
                    assert.ok(messages.length, "The captured fixture must provide a worker packet.");
                    return messages.shift();
                },
                FS: {
                    writeFile: async () => {}, unlink: async () => {},
                    readFile: async file => files.get(file)
                }
            };
            const workerQueue = createRuntimeOperationQueue();
            client = await installWebRSharedRuntimeControl({
                ...fixture.limits,
                runtime, fetchSource: async () => "",
                fetchHelperArchive: async () => new Uint8Array(),
                runRuntimeOperation: (action, waitBeforeNext) => workerQueue.run(action, waitBeforeNext),
                runtimeEventReceived: event => { forwarded.push(event); },
                promptReceived: event => { forwarded.push(event); }
            });
        }
        if (fixture.completionMarker) {
            let returnedResponse;
            let untouchedResponse;
            const commandClient = {
                execute: async function(command, dispatch) {
                    returnedResponse = await client.execute(command, dispatch);
                    untouchedResponse = structuredClone(returnedResponse);
                    return returnedResponse;
                }
            };
            const executor = createRVisibleCommandExecutor({
                getClient: () => commandClient,
                createRequestId: () => activeRequest.id,
                resolveParentId: () => activeRequest.params.parentId
            });
            const commandResult = await withinDeadline(executor.executeVisibleCommand(
                createVisibleCommandRequest({ text: "probe()", source: "ordinary-completion-fixture" }),
                { providerId: "r", status: "ready", connection: "fixture", message: "Ready." }
            ));
            const marker = fixture.completionMarker;
            const invalid = !["idle", "error", "interrupted"].includes(marker);
            assert.equal(returnedResponse.ok, true, "Transport acceptance remains an independent fact.");
            assert.deepEqual(returnedResponse, untouchedResponse, "The executor must not rewrite the R response.");
            assert.equal(commandExecutionDidNotSucceed(commandResult), marker !== "idle",
                `${host}/ordinary/${marker}: stream acceptance cannot substitute for completion.`);
            assert.equal(commandResult.evaluationOutcome, fixture.expectedEvaluationOutcome,
                "Terminal disposition must not fabricate or rewrite an evaluation-phase outcome.");
            assert.equal(createRuntimeCommandReceipt(commandResult).ok, marker === "idle");
            assert.equal(runtimeCommandResultSucceeded(commandResult.transcriptEvents), marker === "idle",
                "Legacy transcript-only receipts must reject interrupted terminal state.");
            if (fixture.noWorkspaceReceipt) {
                assert.equal(commandResult.workspaceUpdate, null,
                    "Ambiguous workspace receipts cannot select the first revision.");
            }
            else if (marker !== "empty") {
                assert.deepEqual(commandResult.workspaceUpdate.workspaceRevision,
                    { session: "ordinary-completion", sequence: 1 },
                    "A completion-delivery failure cannot erase validated workspace effects.");
            }
            if ("expectedWorkspaceReconciliation" in fixture) {
                assert.equal(commandResult.workspaceReconciliation, fixture.expectedWorkspaceReconciliation);
                let applied = 0;
                let invalidated = 0;
                let recoveryReads = 0;
                const runtimeEvents = [];
                const operation = createRuntimeCommandOperationController({
                    commandExecutionController: { executeVisibleCommand: async () => commandResult },
                    getSnapshot: () => ({ providerId: "r", status: "ready" }),
                    getWorkspaceGeneration: () => 1,
                    applyWorkspaceUpdate: function(update) {
                        assert.equal(update, commandResult.workspaceUpdate);
                        applied++;
                        return true;
                    },
                    invalidateWorkspace: () => { invalidated++; },
                    completeVisibleCommand: async function() {
                        recoveryReads++;
                        return null;
                    },
                    recordRuntimeEvent: type => { runtimeEvents.push(type); }
                });
                const published = await withinDeadline(operation.executeVisibleCommand(
                    createVisibleCommandRequest({ text: "probe()", source: "workspace-receipt-fixture" })
                ));
                const failed = fixture.expectedWorkspaceReconciliation === "failed";
                assert.equal(applied, failed ? 0 : 1,
                    "The actual shared caller must not apply a rejected transport-derived workspace receipt.");
                assert.equal(invalidated, failed ? 1 : 0);
                assert.equal(recoveryReads, 0, "Ambiguity must not schedule command recovery/replay.");
                assert.equal(runtimeEvents.filter(type => type === "workspace.reconciliation.failed").length,
                    failed ? 1 : 0);
                assert.equal(published.evaluationOutcome, commandResult.evaluationOutcome);
                assert.equal(published.workspaceUpdate, commandResult.workspaceUpdate);
            }
            assert.equal(commandResult.transcriptEvents.filter(event =>
                String(event.message || "").includes("R command response has")).length, invalid ? 1 : 0);
            if (invalid) {
                assert.equal(commandResult.transcriptEvents.at(-1).type, "failed");
            }
            assert.equal(dispatches, 1, "Missing completion must never replay the R command.");
            return;
        }
        const first = client.execute(activeRequest, deliveryBarrier ? {
            waitForResponseDelivery: function() {
                deliveryCalls++;
                return deliveryBarrier;
            }
        } : undefined);
        let queuedSettled = false;
        const queued = deliveryBarrier ? client.execute({
            id: "queued-delivery", method: "workspace.snapshot"
        }).then(value => {
            queuedSettled = true;
            return value;
        }) : null;
        const result = await withinDeadline(first);
        assert.equal(result.ok, !expectedError, `${host}/${delivery}/${fixture.name}`);
        if (expectedError) {
            assert.equal(result.error, expectedError);
            assert.equal(result.transportFailure, true);
            assert.equal(forwarded.length, delivery === "tail" ? 0 : acceptedBeforeFailure,
                "Reject the first over-budget event before publication, retaining earlier accepted events.");
            assert.equal((await client.execute({ id: "after-failure", method: "workspace.snapshot" })).ok, false);
            assert.equal(dispatches, 1, "Retired transport cannot dispatch or replay another request.");
        }
        else {
            assert.equal(forwarded.length, delivery === "tail" ? 0 : fixtureEvents.length);
            assert.equal(result.events[0].type, fixtureEvents[0].type);
        }
        if (deliveryBarrier) {
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(deliveryCalls, 1, "Both adapters invoke the caller's captured delivery wait once.");
            assert.equal(queuedSettled, false);
            assert.equal(dispatches, 1, "Consumer delivery keeps the shared queue/admission owner.");
            const duplicate = await withinDeadline(client.execute(activeRequest));
            assert.equal(duplicate.requestRejected, true);
            assert.equal(duplicate.error, "runtime-session-invalid-or-duplicate-request");
            if (fixture.barrier === "failed") {
                rejectDelivery(Error("Private consumer failure contents."));
            }
            else {
                if (fixture.barrier === "detached") {
                    client.detach();
                }
                releaseDelivery();
            }
            const queuedResult = await withinDeadline(queued);
            assert.equal(queuedResult.ok, fixture.barrier === "accepted");
            if (fixture.barrier !== "accepted") {
                assert.equal(queuedResult.transportFailure, true);
                assert.equal(queuedResult.error, fixture.barrier === "failed"
                    ? "runtime-session-response-delivery-failed" : "runtime-session-detached");
                assert.equal(dispatches, 1, "Failed/retired delivery cannot dispatch queued R work.");
            }
            else {
                assert.equal(dispatches, 2);
                assert.equal((await withinDeadline(client.execute({
                    id: activeRequest.id, method: "workspace.snapshot"
                }))).ok, true, "Completed delivery releases the original request ID.");
                assert.equal(dispatches, 3);
            }
        }
    }
    finally {
        clearTimeout(deadline);
        releaseDelivery?.();
        client?.detach();
        for (const socket of peers) {
            socket.destroy();
        }
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
    }
};

const checkCapturedResponseDelivery = async function(outcome) {
    const admission = createRuntimeControlRequestAdmission();
    const request = { id: "captured-delivery", method: "execute_input" };
    const failures = [];
    const retirements = [];
    admission.subscribeRetirement(error => retirements.push(error));
    let release;
    let reject;
    const gate = new Promise((resolve, fail) => {
        release = resolve;
        reject = fail;
    });
    assert.equal(admission.admit(request), null);
    admission.releaseAfterResponseDelivery(request.id, function() {
        if (outcome === "throw") {
            throw Error("Private synchronous consumer contents.");
        }
        return gate;
    }, error => failures.push(error));
    await new Promise(resolve => setImmediate(resolve));
    if (outcome.startsWith("stale-")) {
        admission.release(request.id);
        assert.equal(admission.admit(request), null);
    }
    if (outcome === "retired") {
        admission.retire("explicit-retirement");
    }
    if (outcome === "rejected" || outcome === "stale-rejected") {
        reject("private rejected consumer contents");
    }
    else {
        release();
    }
    await new Promise(resolve => setImmediate(resolve));
    if (outcome === "throw" || outcome === "rejected") {
        assert.deepEqual(failures, ["runtime-session-response-delivery-failed"]);
        assert.deepEqual(retirements, failures);
        assert.equal(admission.admit({ id: "later", method: "evaluate_code" }), "runtime-session-detached");
    }
    else if (outcome.startsWith("stale-")) {
        assert.deepEqual(failures, []);
        assert.deepEqual(retirements, []);
        assert.equal(admission.admit(request), "runtime-session-invalid-or-duplicate-request",
            "An old delivery wait cannot release or retire a reused request identity.");
    }
    else if (outcome === "retired") {
        assert.deepEqual(failures, []);
        assert.deepEqual(retirements, ["explicit-retirement"]);
    }
    else {
        assert.deepEqual(failures, []);
        assert.equal(admission.admit(request), null);
    }
    admission.retire();
};

(async function() {
    for (const outcome of ["accepted", "throw", "rejected", "stale-accepted", "stale-rejected", "retired"]) {
        await checkCapturedResponseDelivery(outcome);
    }
    const unownedDelivery = createRuntimeControlRequestAdmission();
    unownedDelivery.releaseAfterResponseDelivery("unknown", function() {
        assert.fail("Unknown request IDs cannot invoke a consumer delivery wait.");
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(unownedDelivery.admit({ id: "unknown", method: "evaluate_code" }), null);
    unownedDelivery.retire();
    const stream = { type: "stream", id: "event", parent_id: "activity", text: "owned" };
    const prompt = { type: "prompt", id: "prompt-event", parent_id: "activity", prompt: "", password: false };
    const cases = [
        { name: "ordinary", event: stream, error: null },
        { name: "event-id-equals-request", event: { ...stream, id: "transport-owner" }, error: null },
        { name: "exact-parent-identity", event: { ...stream, parent_id: " Ω😀 " }, parentId: " Ω😀 ", error: null },
        { name: "parentless-prompt-state", event: { type: "prompt_state", id: "prompt-state" }, error: null },
        { name: "foreign-parent", event: { ...stream, parent_id: "foreign" }, error: "runtime-session-event-identity-mismatch" },
        { name: "numeric-parent", event: { ...stream, parent_id: 12 }, error: "runtime-session-invalid-event-envelope" },
        { name: "numeric-id", event: { ...stream, id: 12 }, error: "runtime-session-invalid-event-envelope" },
        { name: "empty-type", event: { ...stream, type: "" }, error: "runtime-session-invalid-event-envelope" },
        { name: "missing-type", event: { id: "event", parent_id: "activity" }, error: "runtime-session-invalid-event-envelope" },
        { name: "invalid-password", event: { ...prompt, password: "false" }, error: "runtime-session-invalid-event-envelope" },
        { name: "missing-prompt-text", event: { ...prompt, prompt: null }, error: "runtime-session-invalid-event-envelope" },
        { name: "query-live-event", event: stream, method: "evaluate_code", liveOnly: true,
            error: "runtime-session-event-request-mode-mismatch" }
    ];
    const physicalPrompts = [
        { name: "empty-prompt", event: prompt, error: null },
        { name: "prompt-id-equals-request", event: { ...prompt, id: "transport-owner" }, error: null },
        { name: "exact-prompt-parent-identity", event: { ...prompt, parent_id: " Ω😀 " }, parentId: " Ω😀 ", error: null },
        { name: "foreign-prompt", event: { ...prompt, parent_id: "foreign" }, error: "runtime-session-event-identity-mismatch" },
        { name: "invalid-prompt-password", event: { ...prompt, password: "false" }, error: "runtime-session-invalid-event-envelope" },
        { name: "query-physical-prompt", event: prompt, method: "evaluate_code",
            error: "runtime-session-event-request-mode-mismatch" }
    ];
    for (const host of ["native", "native-legacy", "worker"]) {
        const completionCases = ["missing", "empty", "idle", "error", "interrupted",
            "missing-state", "busy", "invalid-state-type", "duplicate"].map(marker => ({
                marker, phaseMode: "matching"
            }));
        completionCases.push(
            { marker: "idle", phaseMode: "absent" },
            { marker: "error", phaseMode: "absent" },
            { marker: "interrupted", phaseMode: "absent" },
            { marker: "interrupted", phaseMode: "success" }
        );
        for (const { marker, phaseMode } of completionCases) {
            const expectedEvaluationOutcome = marker === "empty" || phaseMode === "absent"
                ? undefined : phaseMode === "success" ? "success"
                    : marker === "error" || marker === "interrupted" ? marker : "success";
            const events = marker === "empty" ? [] : [
                ...(phaseMode === "absent" ? [] : [{
                    type: "execution_phase", parent_id: "activity", phase: "evaluated",
                    outcome: expectedEvaluationOutcome
                }]),
                { type: "stream", parent_id: "activity", text: "ordinary output\n", name: "stdout" },
                { type: "workspace_update", parent_id: "activity", update: {
                    workspaceRevision: { session: "ordinary-completion", sequence: 1 },
                    objectCount: 0, added: [], updated: [], removed: [],
                    datasets: { added: [], removed: [], changed: [], copied: [] }
                } }
            ];
            if (marker !== "missing" && marker !== "empty") {
                const completion = { type: "completion", parent_id: "activity",
                    state: marker === "duplicate" ? "idle" : marker,
                    workspaceReconciliation: "changed" };
                if (marker === "missing-state") {
                    delete completion.state;
                }
                else if (marker === "invalid-state-type") {
                    completion.state = { private: "not a state" };
                }
                events.push(completion);
                if (marker === "duplicate") {
                    events.push({ ...completion });
                }
            }
            await checkEventThroughHostTransport(host, "tail", {
                name: "ordinary-completion-" + marker + "-" + phaseMode,
                completionMarker: marker, expectedEvaluationOutcome, events, error: null
            });
        }
        for (const receiptCase of ["single", "duplicate", "conflicting-revision",
            "reversed-revision", "conflicting-outcome", "independent-delta"]) {
            const completion = {
                type: "completion", parent_id: "activity", state: "idle",
                workspaceReconciliation: "unchanged", workspaceObjectCount: 0,
                workspaceRevision: { session: "ordinary-completion", sequence: 1 }
            };
            const completions = [completion];
            if (receiptCase !== "single") {
                completions.push({ ...completion,
                    ...(receiptCase === "conflicting-revision" || receiptCase === "reversed-revision"
                        || receiptCase === "independent-delta" ? {
                            workspaceRevision: { session: "ordinary-completion", sequence: 2 }
                        } : {}),
                    ...(receiptCase === "conflicting-outcome" ? { workspaceReconciliation: "failed" } : {})
                });
                if (receiptCase === "reversed-revision") {
                    completions.reverse();
                }
            }
            const events = [
                { type: "execution_phase", parent_id: "activity", phase: "evaluated", outcome: "success" },
                ...(receiptCase === "independent-delta" ? [{
                    type: "workspace_update", parent_id: "activity", update: {
                        workspaceRevision: { session: "ordinary-completion", sequence: 1 },
                        objectCount: 0, added: [], updated: [], removed: [],
                        datasets: { added: [], removed: [], changed: [], copied: [] }
                    }
                }] : []),
                ...completions
            ];
            await checkEventThroughHostTransport(host, "tail", {
                name: "workspace-completion-" + receiptCase, events, error: null,
                completionMarker: receiptCase === "single" ? "idle" : "duplicate",
                expectedEvaluationOutcome: "success",
                noWorkspaceReceipt: receiptCase !== "single" && receiptCase !== "independent-delta",
                expectedWorkspaceReconciliation: receiptCase === "single" ? "unchanged"
                    : receiptCase === "independent-delta" ? "not_checked" : "failed"
            });
        }
        for (const deltaCase of ["single", "duplicate", "sequential", "reversed",
            "conflicting-count", "invalid-second", "receipt-revision", "receipt-session",
            "receipt-count", "legacy-receipt"]) {
            const update = {
                workspaceRevision: { session: "ordinary-completion", sequence: 1 },
                objectCount: 0, added: [], updated: [], removed: [],
                datasets: { added: [], removed: [], changed: [], copied: [] }
            };
            const updates = [update];
            if (["duplicate", "sequential", "reversed", "conflicting-count", "invalid-second"].includes(deltaCase)) {
                updates.push(deltaCase === "invalid-second" ? { added: [] } : {
                    ...update,
                    ...(deltaCase === "sequential" || deltaCase === "reversed" ? {
                        workspaceRevision: { session: "ordinary-completion", sequence: 2 }
                    } : {}),
                    ...(deltaCase === "conflicting-count" ? { objectCount: 1 } : {})
                });
                if (deltaCase === "reversed") {
                    updates.reverse();
                }
            }
            const completion = {
                type: "completion", parent_id: "activity", state: "idle",
                workspaceReconciliation: "changed", workspaceObjectCount: 0,
                workspaceRevision: { session: "ordinary-completion", sequence: 1 }
            };
            if (deltaCase === "receipt-revision") {
                completion.workspaceRevision.sequence = 2;
            }
            else if (deltaCase === "receipt-session") {
                completion.workspaceRevision.session = "different-workspace";
            }
            else if (deltaCase === "receipt-count") {
                completion.workspaceObjectCount = 1;
            }
            else if (deltaCase === "legacy-receipt") {
                delete completion.workspaceRevision;
                delete completion.workspaceObjectCount;
            }
            const rejected = deltaCase !== "single" && deltaCase !== "legacy-receipt";
            await checkEventThroughHostTransport(host, "tail", {
                name: "workspace-delta-" + deltaCase, completionMarker: "idle", error: null,
                events: [
                    { type: "execution_phase", parent_id: "activity", phase: "evaluated", outcome: "success" },
                    ...updates.map(payload => ({ type: "workspace_update", parent_id: "activity", update: payload })),
                    completion
                ],
                expectedEvaluationOutcome: "success", noWorkspaceReceipt: rejected,
                expectedWorkspaceReconciliation: rejected ? "failed" : "changed"
            });
        }
        for (const delivery of ["live", "tail"]) {
            for (const fixture of cases) {
                await checkEventThroughHostTransport(host, delivery, fixture);
            }
        }
        for (const fixture of physicalPrompts) {
            await checkEventThroughHostTransport(host, "physical-prompt", fixture);
        }
        for (const delivery of ["live", "physical-prompt"]) {
            const event = delivery === "physical-prompt" ? prompt : stream;
            await checkEventThroughHostTransport(host, delivery, {
                name: "live-count-boundary", events: [event, event],
                limits: { maxRetainedEvents: 2 }, error: null
            });
            await checkEventThroughHostTransport(host, delivery, {
                name: "live-count-overflow", events: [event, event, event],
                limits: { maxRetainedEvents: 2 }, acceptedBeforeFailure: 2,
                error: "runtime-session-event-retention-limit"
            });
            await checkEventThroughHostTransport(host, delivery, {
                name: "live-byte-overflow", events: Array(8).fill(event),
                limits: { maxRetainedEventBytes: 512 },
                error: "runtime-session-event-retention-limit"
            });
        }
        for (const barrier of ["accepted", "failed", "detached"]) {
            await checkEventThroughHostTransport(host, "live", {
                name: "response-delivery-" + barrier, event: stream, error: null, barrier
            });
        }
    }
    console.log("Shared response/event validation cases passed; real R/SDK/rendered acceptance remains open.");
})().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
