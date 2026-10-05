"use strict";

const assert = require("node:assert/strict");
const { installWebRSharedRuntimeControl } = require("../dist/src/runtime/providers/webr/webRSharedRuntimeControl");
const { createRuntimeOperationQueue } = require("../dist/src/runtime/session/runtimeOperationQueue");

const createFixture = async function(options = {}) {
    const queue = createRuntimeOperationQueue();
    const sent = [];
    const messages = [];
    const files = new Map();
    let reader = null;
    let reads = 0;
    let captureRetirements = 0;
    let finishDelivery;
    let deliveryStarted;
    let finishEvaluation;
    let evaluationStarted;
    const evaluationBegan = new Promise(resolve => { evaluationStarted = resolve; });
    const evaluation = new Promise(resolve => { finishEvaluation = resolve; });
    const deliveryBegan = new Promise((resolve) => { deliveryStarted = resolve; });
    const delivery = new Promise((resolve) => { finishDelivery = resolve; });
    const runtime = {
        evalRString: async function(command) {
            if (command.includes('runtime_control_source_names("dispatch")')) {
                return "core:runtimePrelude.R\ndispatch:runtimeDispatchCore.R";
            }
            return command === "as.character(getRversion())" ? "4.6.0" : "/fixture";
        },
        evalRVoid: async function(command, evaluationOptions) {
            const file = command.match(/writeChar\(\.payload, ("[^"]+")/);
            if (!file) {
                return;
            }
            const raw = JSON.parse(command.match(/\.raw <- ("(?:[^"\\]|\\.)*")/)[1]);
            const id = decodeURIComponent(JSON.parse(raw).id);
            const method = decodeURIComponent(JSON.parse(raw).method);
            assert.deepEqual(evaluationOptions, method === "execute_input"
                ? { captureConditions: false } : undefined,
                "Only ordered capture disables WebR's outer condition interception.");
            sent.push({ id, payload: JSON.parse(raw) });
            const responsePath = JSON.parse(file[1]);
            files.set(responsePath, new TextEncoder().encode(JSON.stringify({
                id, method, ok: true, events: options.responseEvents || []
            })));
            const message = Object.hasOwn(options, "channelMessage")
                ? options.channelMessage
                : { type: "dialogforge-runtime-drain", data: responsePath,
                    responseBytes: files.get(responsePath).byteLength };
            if (reader) {
                const resolve = reader;
                reader = null;
                resolve(message);
            } else {
                messages.push(message);
            }
            evaluationStarted();
            if (options.holdEvaluationAfterDrain) {
                await evaluation;
            }
        },
        read: function() {
            reads += 1;
            if (messages.length) {
                return Promise.resolve(messages.shift());
            }
            assert.equal(reader, null, "Only the owned operation reads the worker channel.");
            return new Promise((resolve) => { reader = resolve; });
        },
        FS: {
            writeFile: async () => {}, unlink: async () => {},
            readFile: async (file) => files.get(file)
        }
    };
    const client = await installWebRSharedRuntimeControl({
        runtime, maxOutstandingRequests: 2,
        fetchSource: async () => "", fetchHelperArchive: async () => new Uint8Array(),
        runRuntimeOperation: (action, waitBeforeNext) => queue.run(action, waitBeforeNext),
        orderedOutput: { library: "/fixture", directory: "/tmp", sessionId: "fixture" },
        outputJournalForRequest: function() {
            return {
                params: { outputCaptureName: "fixture.bin", outputCaptureSession: "fixture" },
                receive: async () => true,
                retire: async () => { captureRetirements += 1; },
                finish: async function(response) {
                    deliveryStarted();
                    await delivery;
                    if (options.deliveryFailure) {
                        throw new Error(options.deliveryFailure);
                    }
                    return response;
                }
            };
        }
    });
    return { client, sent, deliveryBegan, finishDelivery, evaluationBegan, finishEvaluation,
        runPhysicalProbe: action => queue.run(action),
        reads: () => reads, captureRetirements: () => captureRetirements };
};

const main = async function() {
    for (const channelMessage of [{ type: "closed" }, null]) {
        const fixture = await createFixture({ channelMessage });
        let deadline;
        try {
            const result = await Promise.race([
                fixture.client.execute({ id: "closed-channel", method: "execute_input",
                    params: { code: "1" } }),
                new Promise((_, reject) => {
                    deadline = setTimeout(() => reject(Error("Terminal worker message was ignored.")), 1000);
                })
            ]);
            assert.equal(result.ok, false);
            assert.equal(result.transportFailure, true);
            assert.equal(result.error, channelMessage
                ? "runtime-session-channel-closed" : "runtime-session-channel-read-invalid");
            assert.equal(fixture.reads(), 1, "Do not read a closed/invalid channel again.");
            assert.equal(fixture.captureRetirements(), 1, "Retire unfinished ordered capture.");
            const next = await fixture.client.execute({ id: "after-channel-close",
                method: "workspace.snapshot" });
            assert.equal(next.ok, false);
            assert.equal(next.transportFailure, true);
            assert.equal(fixture.sent.length, 1, "Do not dispatch through retired attachment.");
        } finally {
            clearTimeout(deadline);
            fixture.client.detach();
        }
    }
    const receivedEvents = [{ type: "stream", text: "validated response fact" }];
    const pendingEvaluationFixture = await createFixture({ holdEvaluationAfterDrain: true });
    let evaluationReleaseDeadline;
    try {
        const active = pendingEvaluationFixture.client.execute({
            id: "drained-pending-evaluation", method: "execute_input", params: { code: "1" }
        });
        await pendingEvaluationFixture.evaluationBegan;
        await new Promise(resolve => setImmediate(resolve));
        let probeEntered = false;
        const probe = pendingEvaluationFixture.runPhysicalProbe(async () => { probeEntered = true; });
        pendingEvaluationFixture.client.detach();
        const result = await active;
        assert.equal(result.ok, false);
        assert.equal(result.transportFailure, true);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(probeEntered, false,
            "Public retirement must not overlap a still-live worker evaluation after its drain marker.");
        pendingEvaluationFixture.finishDelivery();
        pendingEvaluationFixture.finishEvaluation();
        await Promise.race([
            probe,
            new Promise((_, reject) => {
                evaluationReleaseDeadline = setTimeout(() => reject(
                    Error("Physical queue did not recover after SDK evaluation returned.")
                ), 1000);
            })
        ]);
        assert.equal(probeEntered, true, "Physical ownership ends only after SDK evaluation returns.");
    } finally {
        clearTimeout(evaluationReleaseDeadline);
        pendingEvaluationFixture.finishDelivery();
        pendingEvaluationFixture.finishEvaluation();
        pendingEvaluationFixture.client.detach();
    }
    const failedDeliveryFixture = await createFixture({
        responseEvents: receivedEvents, deliveryFailure: "fixture-output-delivery-failed"
    });
    try {
        const failedDelivery = failedDeliveryFixture.client.execute({
            id: "failed-delivery", method: "execute_input", params: { code: "1" }
        });
        await failedDeliveryFixture.deliveryBegan;
        failedDeliveryFixture.finishDelivery();
        const result = await failedDelivery;
        assert.equal(result.ok, false);
        assert.equal(result.error, "fixture-output-delivery-failed");
        assert.deepEqual(result.events, receivedEvents,
            "The worker adapter's eventless delivery error retains its validated response events.");
        assert.equal(failedDeliveryFixture.captureRetirements(), 1);
    } finally {
        failedDeliveryFixture.client.detach();
    }
    for (const retireDuringDelivery of [false, true]) {
        const fixture = await createFixture({ responseEvents: receivedEvents });
        const active = fixture.client.execute({ id: "active", method: "execute_input", params: { code: "1" } });
        await fixture.deliveryBegan;
        assert.equal((await fixture.client.execute({ id: "active", method: "evaluate_code" })).error,
            "runtime-session-invalid-or-duplicate-request");
        const columns = ["before"];
        const queued = fixture.client.execute({ id: "queued", method: "workspace.snapshot", params: { columns } });
        columns[0] = "after";
        const epoch = fixture.client.getWorkspaceEpoch();
        const rejected = await fixture.client.execute({ id: "overflow", method: "evaluate_code" });
        assert.equal(rejected.error, "runtime-session-request-capacity");
        assert.equal(rejected.requestRejected, true);
        assert.equal(fixture.client.getWorkspaceEpoch(), epoch, "Rejected work cannot invalidate workspace state.");
        assert.deepEqual(fixture.sent.map((entry) => entry.id), ["active"], "The drained response does not release output delivery ownership.");
        if (retireDuringDelivery) {
            fixture.client.detach();
        }
        fixture.finishDelivery();
        const activeResult = await active;
        assert.equal(activeResult.ok, !retireDuringDelivery);
        assert.deepEqual(activeResult.events, receivedEvents,
            "Retirement during worker delivery retains the already validated response events.");
        const result = await queued;
        assert.equal(result.ok, !retireDuringDelivery);
        assert.deepEqual(fixture.sent.map((entry) => entry.id), retireDuringDelivery ? ["active"] : ["active", "queued"]);
        if (!retireDuringDelivery) {
            assert.equal(decodeURIComponent(fixture.sent[1].payload.columns), "before", "Queued wire parameters are frozen at admission.");
        }
        fixture.client.detach();
    }
    const timedFixture = await createFixture({ responseEvents: receivedEvents });
    const timedInput = timedFixture.client.execute({
        id: "timed-input", method: "execute_input",
        params: { code: "1", timeoutMs: 250 }
    });
    await timedFixture.deliveryBegan;
    const afterTimeout = timedFixture.client.execute({
        id: "after-timeout", method: "workspace.snapshot"
    });
    const timedResult = await timedInput;
    assert.equal(timedResult.error, "runtime-session-timeout");
    assert.deepEqual(timedResult.events, receivedEvents,
        "A timeout during worker delivery retains the already validated response events.");
    assert.deepEqual(timedFixture.sent.map((entry) => entry.id), ["timed-input"],
        "A timed-out consumer cannot release unfinished worker output delivery.");
    assert.equal((await timedFixture.client.execute({
        id: "timed-input", method: "workspace.snapshot"
    })).error, "runtime-session-invalid-or-duplicate-request",
    "Timeout must preserve the active request identity until physical release.");
    timedFixture.finishDelivery();
    assert.equal((await afterTimeout).ok, true);
    assert.deepEqual(timedFixture.sent.map((entry) => entry.id), ["timed-input", "after-timeout"]);
    timedFixture.client.detach();
    console.log("WebR adapter admission/delivery cases passed; real runtime acceptance remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
