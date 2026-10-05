"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { prepareNativeOrderedOutput } = require(
    "../dist/src/runtime/providers/r/session/runtimeOrderedOutputExecutionPrototype"
);
const { createRVisibleCommandExecutor } = require(
    "../dist/src/runtime/providers/r/controllers/rVisibleCommandExecutor"
);
const { createVisibleCommandRequest, commandExecutionDidNotSucceed,
    isTranscriptFailureEvent } = require("../dist/src/runtime/commands/commandProtocol");
const { encodeRuntimeControlRequest } = require("../dist/src/runtime/providers/r/protocol/runtimeControlRequestEncoding");
const { createWebROutputJournalReader } = require("../dist/src/runtime/providers/webr/webRSharedRuntimeControl");

const frame = function(sequence, channel, text = "") {
    const bytes = Buffer.from(text);
    const header = Buffer.alloc(13);
    header[0] = channel;
    header.writeBigUInt64BE(BigInt(sequence), 1);
    header.writeUInt32BE(bytes.length, 9);
    return Buffer.concat([header, bytes]);
};

const checkMatchingCompletion = async function(directory, host, completion, sealed) {
    const parentId = "completion-activity";
    const sessionId = `${host}-${completion}-${sealed ? "sealed" : "failed"}`;
    const request = createVisibleCommandRequest({ text: "probe <- 2", source: "completion-marker-fixture" });
    const workerPath = `/fixture/${sessionId}.bin`;
    const capture = host === "native"
        ? prepareNativeOrderedOutput({ directory, sessionId, parentId, request, isCurrent: () => true })
        : createWebROutputJournalReader({ path: workerPath, sessionId, parentId, request, isCurrent: () => true });
    const workspaceRevision = { session: sessionId, sequence: 1 };
    const receipt = { sessionId, parentId, captureStatus: sealed ? "sealed" : "failed",
        outputSequence: sealed ? 2 : null };
    const evaluationOutcome = completion.endsWith("no-phase") ? undefined
        : completion.startsWith("error") ? "error"
            : completion === "interrupted" ? "interrupted" : "success";
    const events = [
        ...(evaluationOutcome ? [{
            type: "execution_phase", parent_id: parentId,
            phase: "evaluated", outcome: evaluationOutcome
        }] : []),
        { type: "workspace_update", parent_id: parentId, update: {
            workspaceRevision, objectCount: 0, added: [], updated: [], removed: [],
            datasets: { added: [], removed: [], changed: [], copied: [] }
        } }
    ];
    if (completion !== "missing") {
        const marker = {
            type: "completion", parent_id: completion === "matching" ? parentId : "foreign-activity",
            state: completion.startsWith("error") ? "error"
                : completion.startsWith("interrupted") ? "interrupted" : "idle",
            workspaceReconciliation: "changed"
        };
        if (completion !== "foreign") {
            marker.parent_id = parentId;
        }
        if (completion === "missing-state") {
            delete marker.state;
        }
        else if (completion === "unexpected-state") {
            marker.state = "busy";
        }
        else if (completion === "invalid-state-type") {
            marker.state = { toString: null };
        }
        events.push(marker);
        if (completion === "duplicate") {
            events.push({ ...marker });
        }
    }
    if (sealed) {
        const bytes = Buffer.concat([Buffer.from("DFOUT001"), frame(1, 1, "accepted output\n"), frame(2, 0)]);
        if (host === "native") {
            await fs.writeFile(path.join(directory, capture.params.outputCaptureName), bytes);
        }
        else {
            assert.equal(await capture.receive({ path: workerPath, offset: 0, bytes: new Uint8Array(bytes) }), true);
        }
    }
    let delivered;
    const client = {
        execute: async function(command, dispatch) {
            dispatch.onDispatched();
            const response = { id: command.id, method: command.method, ok: true, result: receipt, events };
            if (host === "native") {
                return response;
            }
            delivered = await capture.finish(response);
            return delivered;
        }
    };
    const executor = createRVisibleCommandExecutor({
        getClient: () => client,
        resolveParentId: () => parentId,
        createRequestId: () => "completion-request",
        ...(host === "native" ? { prepareOutputCapture: () => ({
            ...capture,
            finish: async function(response) {
                delivered = await capture.finish(response);
                return delivered;
            }
        }) } : {})
    });
    try {
        const result = await executor.executeVisibleCommand(request, { providerId: "r", status: "ready" });
        const validMarker = ["matching", "error", "interrupted", "error-no-phase",
            "interrupted-no-phase", "interrupted-after-success"].includes(completion);
        const deliveryRejected = !sealed || !validMarker;
        const shouldFail = deliveryRejected || completion !== "matching";
        assert.equal(commandExecutionDidNotSucceed(result), shouldFail,
            "Missing/foreign completion or rejected output cannot advertise command success.");
        assert.equal(result.evaluationOutcome, evaluationOutcome,
            "Output and terminal disposition cannot fabricate or rewrite R evaluation.");
        assert.deepEqual(result.workspaceUpdate.workspaceRevision, workspaceRevision,
            "Independent accepted workspace effects are not erased or replayed by delivery failure.");
        assert.equal(delivered.result, receipt, "Keep the producer receipt unchanged.");
        if (host === "worker") {
            assert.equal(capture.snapshot().completionAccepted, !deliveryRejected,
                "Valid error/interruption can have accepted output delivery without successful R execution.");
        }
        if (host === "native" && sealed) {
            const file = path.join(directory, capture.params.outputCaptureName);
            if (deliveryRejected) {
                assert.ok((await fs.readFile(file)).length > 0,
                    "An absent/invalid completion cannot dispose accepted capture bytes.");
            }
            else {
                await assert.rejects(fs.stat(file), error => error.code === "ENOENT",
                    "Fully accepted output still disposes its matching source.");
            }
        }
        if (deliveryRejected || completion.startsWith("error")) {
            assert.ok(result.transcriptEvents.some(event =>
                isTranscriptFailureEvent(event) && event.parentId === parentId));
        }
        else if (completion.startsWith("interrupted")) {
            assert.ok(result.transcriptEvents.some(event =>
                event.state === "interrupted" && event.parentId === parentId),
                "Accepted interrupted delivery retains its distinct terminal state.");
            assert.equal(result.transcriptEvents.some(isTranscriptFailureEvent), false,
                "Successful delivery of interrupted execution must not fabricate a transcript error.");
        }
        if (completion === "missing" || completion === "foreign") {
            assert.equal(delivered.events.some(event => event.type === "completion" && event.parent_id === parentId), false,
                "Delivery failure must not invent an R completion marker.");
        }
        if (completion === "foreign") {
            assert.equal(events.at(-1).state, "idle", "Another command's marker cannot be rewritten.");
        }
    }
    finally {
        await capture.retire();
    }
};

const main = async function() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dialogforge-ordered-hook-"));
    for (const host of ["native", "worker"]) {
        for (const completion of [
            "matching", "missing", "foreign", "missing-state", "unexpected-state",
            "invalid-state-type", "duplicate", "error", "interrupted",
            "error-no-phase", "interrupted-no-phase", "interrupted-after-success"
        ]) {
            for (const sealed of [true, false]) {
                await checkMatchingCompletion(directory, host, completion, sealed);
            }
        }
    }
    const request = createVisibleCommandRequest({ text: "cat('early\\n')", source: "ordered-hook" });
    const events = [];
    const order = [];
    let current;
    let capture;
    let deliveryWait;
    let receiveFirst;
    let rejectFirst;
    const firstPublished = new Promise((resolve, reject) => {
        receiveFirst = resolve;
        rejectFirst = reject;
    });
    const client = {
        execute: async function(command, dispatch) {
            assert.ok(command.params.outputCaptureName.endsWith(".bin"));
            assert.equal(command.params.outputCaptureSession, "session");
            const encoded = JSON.parse(encodeRuntimeControlRequest(command));
            assert.equal(decodeURIComponent(encoded.outputCaptureName), command.params.outputCaptureName);
            assert.equal(decodeURIComponent(encoded.outputCaptureSession), "session");
            assert.equal(typeof dispatch.waitForResponseDelivery, "function");
            deliveryWait = dispatch.waitForResponseDelivery().then(() => {
                order.push("delivery-released");
            });
            dispatch.onDispatched();
            const file = path.join(directory, command.params.outputCaptureName);
            await fs.writeFile(file, Buffer.concat([Buffer.from("DFOUT001"), frame(1, 1, "early\n")]));
            await firstPublished;
            order.push("producer-response");
            await fs.appendFile(file, frame(2, 0));
            return {
                id: command.id, method: command.method, ok: true,
                result: { sessionId: "session", parentId: command.params.parentId, captureStatus: "sealed", outputSequence: 2 },
                events: [
                    { type: "execution_phase", phase: "evaluated", outcome: "success", parent_id: command.params.parentId },
                    { type: "completion", state: "idle", parent_id: command.params.parentId, workspaceReconciliation: "unchanged" }
                ]
            };
        }
    };
    current = client;
    const executor = createRVisibleCommandExecutor({
        getClient: () => current,
        createRequestId: (prefix) => `${prefix}-fixture`,
        prepareOutputCapture: (request, parentId, owner) => {
            capture = prepareNativeOrderedOutput({
                directory, sessionId: "session", parentId, request,
                isCurrent: () => current === owner,
                onTranscriptEvents: (incoming) => {
                    events.push(...incoming);
                    order.push("live-output");
                    receiveFirst();
                }
            });
            return capture;
        },
        onExecutionFinished: () => order.push("finished")
    });
    const deadline = setTimeout(() => {
        rejectFirst(new Error("Live output was not delivered before response."));
    }, 2000);
    try {
        const result = await executor.executeVisibleCommand(request, { providerId: "r", status: "ready" });
        await deliveryWait;
        assert.deepEqual(order, ["live-output", "producer-response", "finished", "delivery-released"]);
        assert.equal(events[0].message, "early\n");
        assert.ok(result.transcriptEvents.some((event) => event.type === "completed"));
        assert.equal(result.transcriptEvents.filter((event) => event.message === "early\n").length, 0, "Live output is not returned twice");
    } finally {
        clearTimeout(deadline);
        await capture?.retire();
    }

    const fallback = prepareNativeOrderedOutput({ directory, sessionId: "fallback", parentId: "activity", request, isCurrent: () => true });
    await fs.writeFile(path.join(directory, fallback.params.outputCaptureName), Buffer.concat([
        Buffer.from("DFOUT001"), frame(1, 1, "returned\n"), frame(2, 0)
    ]));
    const returned = await fallback.finish({
        id: "fallback", method: "execute_input", ok: true,
        result: { sessionId: "fallback", parentId: "activity", captureStatus: "sealed", outputSequence: 2 },
        events: [{ type: "completion", state: "idle", parent_id: "activity", workspaceReconciliation: "unchanged" }]
    });
    assert.equal(returned.events[0].text, "returned\n", "Consumers without a live callback retain output");
    await fallback.retire();

    const failed = prepareNativeOrderedOutput({ directory, sessionId: "failed", parentId: "activity", request, isCurrent: () => true });
    const failedResponse = await failed.finish({
        id: "failed", method: "execute_input", ok: true,
        result: { sessionId: "failed", parentId: "activity", captureStatus: "failed", outputSequence: null },
        events: [
            { type: "execution_phase", phase: "evaluated", outcome: "success", parent_id: "activity" },
            { type: "completion", state: "idle", parent_id: "activity", workspaceReconciliation: "changed", workspaceRevision: 8 }
        ]
    });
    assert.equal(failedResponse.events.find((event) => event.type === "completion").state, "error");
    assert.equal(failedResponse.events.find((event) => event.type === "completion").workspaceRevision, 8);
    assert.equal(failedResponse.events.find((event) => event.type === "execution_phase").outcome, "success");
    await failed.retire();
    console.log(`Native ordered hook cases passed; fixtures retained in ${directory}. Native R/rendered acceptance is separate.`);
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
