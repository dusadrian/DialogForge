"use strict";

const assert = require("node:assert/strict");
const { createRuntimeOutputJournalReader } = require(
    "../dist/src/runtime/output/runtimeOutputJournalReader"
);
const { createRuntimeOutputByteTransport } = require("../dist/src/runtime/output/runtimeOutputByteTransport");
const { createRuntimeOutputTranscriptReader } = require("../dist/src/runtime/output/runtimeOutputTranscriptReader");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");
const { createROrderedOutputDelivery } = require("../dist/src/runtime/providers/r/controllers/rOrderedOutputDelivery");
const { runtimeOutputJournalFormat } = require("../dist/src/runtime/output/runtimeOutputJournalFormat");

const frame = function(sequence, channel, text = "") {
    const payload = new TextEncoder().encode(text);
    const bytes = new Uint8Array(13 + payload.length);
    const view = new DataView(bytes.buffer);
    bytes[0] = channel;
    view.setBigUint64(1, BigInt(sequence));
    view.setUint32(9, payload.length);
    bytes.set(payload, 13);
    return bytes;
};

const fixture = function(publish) {
    let bytes = new TextEncoder().encode("DFOUT001");
    let identity = "fixture";
    let current = true;
    let closed = false;
    const released = [];
    const chunks = [];
    const reader = createRuntimeOutputJournalReader({
        sessionId: "session", parentId: "activity", isCurrent: () => current,
        transport: {
            inspect: async () => ({ identity, size: bytes.length }),
            read: async (offset, length) => bytes.slice(offset, offset + length),
            close: async () => { closed = true; },
            releaseAcceptedSource: async source => {
                assert.equal(closed, true, "Source release follows handle closure");
                released.push(source);
            }
        },
        publish: publish || ((chunk) => { chunks.push(chunk); return true; })
    });
    return {
        reader, chunks, released, closed: () => closed,
        replace: () => { identity = "replacement"; },
        retire: () => { current = false; },
        append: (...frames) => {
            for (const part of frames) {
                const combined = new Uint8Array(bytes.length + part.length);
                combined.set(bytes);
                combined.set(part, bytes.length);
                bytes = combined;
            }
        }
    };
};

const receipt = { sessionId: "session", parentId: "activity", captureStatus: "sealed", outputSequence: 3 };

const checkTransportCloseFailure = async function(scenario, synchronous) {
    const header = new TextEncoder().encode("DFOUT001");
    const bytes = new Uint8Array(header.length + 13);
    bytes.set(header);
    bytes.set(frame(1, 0), header.length);
    let closeAttempts = 0;
    let releases = 0;
    const reader = createRuntimeOutputJournalReader({
        sessionId: "session", parentId: "activity",
        isCurrent: () => scenario !== "retired",
        publish: () => true,
        transport: {
            inspect: async function() {
                if (scenario === "inspect") {
                    throw new Error("Original inspection failed.");
                }
                return { identity: "owned", size: bytes.length };
            },
            read: async function(offset, length) {
                if (scenario === "read") {
                    throw new Error("Original read failed.");
                }
                return bytes.slice(offset, offset + length);
            },
            close: function() {
                closeAttempts++;
                const error = new Error("Secondary close failure.");
                if (synchronous) {
                    throw error;
                }
                return Promise.reject(error);
            },
            releaseAcceptedSource: async function() {
                releases++;
            }
        }
    });
    const result = scenario === "receipt" || scenario === "sealed"
        ? await reader.finishProducer({
            ...receipt, outputSequence: 1,
            sessionId: scenario === "receipt" ? "foreign" : "session"
        })
        : await reader.poll();
    assert.equal(result.status, scenario === "retired" ? "retired" : "failed");
    const expected = {
        inspect: "Original inspection failed.",
        read: "Original read failed.",
        receipt: "Runtime output producer receipt failed or has a different owner.",
        sealed: "Runtime output journal could not be closed.",
        retired: ""
    };
    assert.equal(result.detail, expected[scenario], "Cleanup must not replace the primary failure.");
    await reader.retire();
    await reader.retire();
    assert.equal(closeAttempts, 1, "Cleanup exceptions must not cause a repeated close attempt.");
    assert.equal(releases, 0, "Failed close cannot authorize accepted-source deletion.");
};

const checkPendingTransportFailure = async function(operation, retire, closeFails) {
    let rejectTransport;
    let signalStarted;
    const started = new Promise(resolve => { signalStarted = resolve; });
    const pendingTransport = new Promise((resolve, reject) => { rejectTransport = reject; });
    let closeAttempts = 0;
    let releases = 0;
    let publications = 0;
    const reader = createRuntimeOutputJournalReader({
        sessionId: "session", parentId: "activity", isCurrent: () => true,
        publish: function() { publications++; return true; },
        transport: {
            inspect: function() {
                if (operation === "inspect") {
                    signalStarted();
                    return pendingTransport;
                }
                return Promise.resolve({ identity: "owned", size: 8 });
            },
            read: function() {
                signalStarted();
                return pendingTransport;
            },
            close: async function() {
                closeAttempts++;
                if (closeFails) {
                    throw new Error("Secondary close failure.");
                }
            },
            releaseAcceptedSource: async function() { releases++; }
        }
    });
    const reading = reader.poll();
    await started;
    const finishing = retire ? reader.retire()
        : reader.finishProducer({ ...receipt, sessionId: "foreign" });
    const expectedDetail = retire ? ""
        : "Runtime output producer receipt failed or has a different owner.";
    assert.equal(reader.snapshot().detail, expectedDetail);
    assert.equal(closeAttempts, 0, "Terminal cleanup must wait for the captured pending transport operation.");
    rejectTransport(new Error("Later transport operation failed."));
    await Promise.all([reading, finishing]);
    assert.equal(reader.snapshot().status, retire ? "retired" : "failed");
    assert.equal(reader.snapshot().detail, expectedDetail,
        "Late transport rejection cannot replace the first terminal disposition.");
    assert.equal(closeAttempts, 1);
    assert.equal(releases, 0);
    assert.equal(publications, 0);
    await reader.retire();
    assert.equal(closeAttempts, 1, "Repeated retirement cannot repeat physical cleanup.");
};

const checkAcceptedSourceDisposition = async function(scenario, hasReleaseHook) {
    const header = new TextEncoder().encode("DFOUT001");
    const output = frame(1, 1, scenario === "incomplete" ? "é" : "accepted");
    if (scenario === "incomplete") {
        // Retain a valid raw frame with an incomplete UTF-8 suffix.
        output[output.length - 1] = 0xc3;
        output[output.length - 2] = 0x61;
    }
    const seal = frame(2, 0);
    const bytes = new Uint8Array(header.length + output.length + seal.length);
    bytes.set(header);
    bytes.set(output, header.length);
    bytes.set(seal, header.length + output.length);
    let current = true;
    let ownerThrows = false;
    let closes = 0;
    let releases = 0;
    const reader = createRuntimeOutputTranscriptReader({
        sessionId: "session", parentId: "activity", encoding: "utf8",
        request: createVisibleCommandRequest({ text: "fixture()" }),
        isCurrent: function() {
            if (ownerThrows) {
                throw Error("Later owner callback failed.");
            }
            return current;
        },
        publish: () => true,
        acceptCompletion: function() {
            if (scenario === "completion-throws") {
                throw Error("Completion predicate failed.");
            }
            return scenario !== "completion-rejected";
        },
        transport: {
            inspect: async () => ({ identity: "accepted-source", size: bytes.length }),
            read: async (offset, length) => bytes.slice(offset, offset + length),
            close: async function() {
                closes++;
                if (scenario === "retired-during-close") {
                    current = false;
                }
                if (scenario === "owner-throws-during-close") {
                    ownerThrows = true;
                }
            },
            ...(hasReleaseHook ? {
                releaseAcceptedSource: async function(identity) {
                    assert.equal(identity, "accepted-source");
                    assert.equal(closes, 1);
                    releases++;
                }
            } : {})
        }
    });
    const result = await reader.finishProducer({ ...receipt, outputSequence: 2 });
    assert.equal(result.completionAccepted, scenario === "accepted");
    assert.equal(result.capture.status,
        scenario === "retired-during-close" ? "retired"
            : scenario === "completion-throws" || scenario === "owner-throws-during-close" ? "failed" : "accepted");
    assert.equal(result.transcript.status, scenario === "incomplete" ? "failed" : "finished",
        "Raw receipt and text completion remain separate facts.");
    assert.equal(releases, scenario === "accepted" && hasReleaseHook ? 1 : 0,
        "Source disposal requires byte/text/completion acceptance and current ownership after close.");
    await reader.finishProducer({ ...receipt, outputSequence: 2 });
    await reader.retire();
    assert.equal(closes, 1);
    assert.equal(releases, scenario === "accepted" && hasReleaseHook ? 1 : 0,
        "Repeated terminal calls cannot retry or authorize source disposal.");
};

const checkConcurrentProducerCompletion = async function(stage, outcome) {
    const header = new TextEncoder().encode("DFOUT001");
    const seal = frame(1, 0);
    const bytes = new Uint8Array(header.length + seal.length);
    bytes.set(header);
    bytes.set(seal, header.length);
    let finishGate;
    let rejectGate;
    const gate = new Promise((resolve, reject) => {
        finishGate = resolve;
        rejectGate = reject;
    });
    let signalStarted;
    const started = new Promise(resolve => { signalStarted = resolve; });
    let closes = 0;
    let releases = 0;
    let firstSettled = false;
    let secondSettled = false;
    let retiredSettled = false;
    let deadline;
    const withinDeadline = async function(work) {
        try {
            return await Promise.race([
                work,
                new Promise((resolve, reject) => {
                    deadline = setTimeout(() => reject(Error("Completion cleanup fixture stalled.")), 2000);
                })
            ]);
        }
        finally {
            clearTimeout(deadline);
        }
    };
    const reader = createRuntimeOutputTranscriptReader({
        sessionId: "session", parentId: "activity", encoding: "utf8",
        request: createVisibleCommandRequest({ text: "fixture()" }),
        isCurrent: () => true, publish: () => true,
        transport: {
            inspect: async () => ({ identity: "concurrent-source", size: bytes.length }),
            read: async (offset, length) => bytes.slice(offset, offset + length),
            close: async function() {
                closes++;
                if (stage === "close") {
                    signalStarted();
                    await gate;
                }
            },
            releaseAcceptedSource: async function() {
                releases++;
                if (stage === "release") {
                    signalStarted();
                    await gate;
                }
            }
        }
    });
    const expectedReceipt = { ...receipt, outputSequence: 1 };
    const mutableReceipt = { ...expectedReceipt };
    const first = reader.finishProducer(mutableReceipt).then(result => {
        firstSettled = true;
        return result;
    });
    try {
        await withinDeadline(started);
        mutableReceipt.parentId = "caller-mutated";
        assert.equal(reader.snapshot().completionAccepted, false,
            "A matched byte/text seal cannot advertise completed cleanup.");
        const secondReceipt = { ...expectedReceipt };
        if (outcome === "foreign-parent") {
            secondReceipt.parentId = "foreign";
        }
        else if (outcome === "foreign-session") {
            secondReceipt.sessionId = "foreign";
        }
        else if (outcome === "foreign-sequence") {
            secondReceipt.outputSequence = 2;
        }
        else if (outcome === "failed-capture") {
            secondReceipt.captureStatus = "failed";
        }
        const second = reader.finishProducer(secondReceipt).then(result => {
            secondSettled = true;
            return result;
        });
        const retiring = outcome === "retired" ? reader.retire().then(() => {
            retiredSettled = true;
        }) : Promise.resolve();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(firstSettled, false);
        assert.equal(secondSettled, false, "Concurrent completion must join captured cleanup.");
        assert.equal(retiredSettled, false, "Retirement must join an already-started release.");
        assert.equal(reader.snapshot().completionAccepted, false);
        if (outcome === "cleanup-failure") {
            rejectGate(Error("Held cleanup failed."));
        }
        else {
            finishGate();
        }
        const [a, b] = await withinDeadline(Promise.all([first, second, retiring]));
        const expectedStatus = outcome === "accepted" ? "accepted"
            : outcome === "retired" ? "retired" : "failed";
        assert.equal(a.capture.status, expectedStatus);
        assert.equal(b.capture.status, expectedStatus);
        assert.equal(a.completionAccepted, outcome === "accepted");
        assert.equal(b.completionAccepted, outcome === "accepted");
        if (outcome.startsWith("foreign-") || outcome === "failed-capture") {
            assert.equal(a.capture.detail, "Runtime output producer receipt changed after capture.");
            assert.equal(b.capture.detail, a.capture.detail);
        }
        assert.equal(closes, 1);
        const expectedReleases = stage === "release" || outcome === "accepted" ? 1 : 0;
        assert.equal(releases, expectedReleases);
        await reader.finishProducer(expectedReceipt);
        await reader.retire();
        assert.equal(closes, 1);
        assert.equal(releases, expectedReleases, "No repeated close/release or producer replay.");
    }
    finally {
        finishGate();
        await first;
        await reader.retire();
    }
};

const main = async function() {
    for (const stage of ["close", "release"]) {
        for (const outcome of [
            "accepted", "cleanup-failure", "retired", "foreign-parent",
            "foreign-session", "foreign-sequence", "failed-capture"
        ]) {
            await checkConcurrentProducerCompletion(stage, outcome);
        }
    }
    for (const scenario of [
        "accepted", "incomplete", "completion-rejected", "completion-throws",
        "retired-during-close", "owner-throws-during-close"
    ]) {
        for (const hasReleaseHook of [true, false]) {
            await checkAcceptedSourceDisposition(scenario, hasReleaseHook);
        }
    }
    for (const operation of ["inspect", "read"]) {
        for (const retire of [false, true]) {
            for (const closeFails of [false, true]) {
                await checkPendingTransportFailure(operation, retire, closeFails);
            }
        }
    }
    for (const scenario of ["inspect", "read", "receipt", "sealed", "retired"]) {
        for (const synchronous of [false, true]) {
            await checkTransportCloseFailure(scenario, synchronous);
        }
    }

    assert.deepEqual(runtimeOutputJournalFormat, {
        header: "DFOUT001", frameHeaderBytes: 13,
        maximumPayloadBytes: 65536, maximumJournalBytes: 64 * 1024 * 1024
    }, "Consolidation retains the established native/worker wire contract.");
    assert.equal(Object.isFrozen(runtimeOutputJournalFormat), true);
    const boundedStorage = createRuntimeOutputByteTransport("limit-fixture");
    boundedStorage.append(0, new Uint8Array(runtimeOutputJournalFormat.maximumPayloadBytes
        + runtimeOutputJournalFormat.frameHeaderBytes));
    assert.throws(() => boundedStorage.append(runtimeOutputJournalFormat.maximumPayloadBytes
        + runtimeOutputJournalFormat.frameHeaderBytes, new Uint8Array(runtimeOutputJournalFormat.maximumPayloadBytes
            + runtimeOutputJournalFormat.frameHeaderBytes + 1)), /invalid or out-of-order/);
    const deliveryStorage = createRuntimeOutputByteTransport("delivery-fixture");
    const delivery = createROrderedOutputDelivery({
        transport: deliveryStorage.transport, sessionId: "session", parentId: "activity",
        request: createVisibleCommandRequest({ text: "example()" }), isCurrent: () => true
    });
    const deliveryHeader = new TextEncoder().encode("DFOUT001");
    const deliveryOutput = frame(1, 1, "owned\n");
    deliveryStorage.append(0, deliveryHeader);
    deliveryStorage.append(deliveryHeader.length, deliveryOutput);
    deliveryStorage.append(deliveryHeader.length + deliveryOutput.length, frame(2, 0));
    const response = {
        id: "request", method: "execute_input", ok: true,
        result: { ...receipt, outputSequence: 2 },
        events: [{ type: "completion", parent_id: "activity", state: "idle" }]
    };
    const delivered = await delivery.finish(response);
    assert.equal(delivered.events[0].text, "owned\n");
    assert.equal(delivered.events[1].state, "idle");
    const missingDelivery = createROrderedOutputDelivery({
        transport: createRuntimeOutputByteTransport("missing-fixture").transport,
        sessionId: "session", parentId: "activity",
        request: createVisibleCommandRequest({ text: "example()" }), isCurrent: () => true
    });
    const rejectedDelivery = await missingDelivery.finish(response);
    assert.equal(rejectedDelivery.result, response.result, "Evaluation/workspace receipt remains intact");
    assert.equal(rejectedDelivery.events[1].state, "error");

    for (const closeThrows of [false, true]) {
        let closes = 0;
        let inspections = 0;
        const ownerFailureDelivery = createROrderedOutputDelivery({
            transport: {
                inspect: async () => { inspections++; return null; },
                read: async () => { throw new Error("No read after ownership failure"); },
                close: async () => {
                    closes++;
                    if (closeThrows) {
                        throw new Error("Secondary close failure");
                    }
                },
                releaseAcceptedSource: async () => {
                    throw new Error("No source release after ownership failure");
                }
            },
            sessionId: "session", parentId: "activity",
            request: createVisibleCommandRequest({ text: "example()" }),
            isCurrent: () => { throw new Error("Owner getter failed"); }
        });
        const ownerFailure = await ownerFailureDelivery.finish(response);
        assert.equal(ownerFailure.ok, false);
        assert.equal(ownerFailure.error, "runtime-output-owner-check-failed");
        assert.equal(ownerFailure.result, response.result,
            "Owner-check failure cannot erase an already known R receipt.");
        assert.deepEqual(ownerFailure.events, response.events);
        assert.equal(ownerFailureDelivery.snapshot().completionAccepted, false);
        assert.equal(inspections, 0);
        assert.equal(closes, 1);
        await ownerFailureDelivery.retire();
        assert.equal(closes, 1, "Repeated retirement does not retry a failed close.");
    }

    const storage = createRuntimeOutputByteTransport("pushed-fixture");
    const events = [];
    const pushed = createRuntimeOutputTranscriptReader({
        transport: storage.transport,
        sessionId: "session", parentId: "activity", encoding: "utf8",
        request: createVisibleCommandRequest({ text: "example()" }),
        isCurrent: () => true,
        publish: (event) => { events.push(event); return true; }
    });
    const header = new TextEncoder().encode("DFOUT001");
    const early = frame(1, 1, "early\n");
    storage.append(0, header);
    storage.append(header.length, early);
    await pushed.poll();
    assert.equal(events[0].message, "early\n");
    assert.equal(pushed.snapshot().completionAccepted, false);
    storage.append(header.length + early.length, frame(2, 0));
    assert.equal((await pushed.finishProducer({ ...receipt, outputSequence: 2 })).completionAccepted, true);
    assert.throws(() => storage.append(header.length + early.length + 13, frame(3, 1, "late")));

    const invalidStorage = createRuntimeOutputByteTransport("invalid-fixture");
    assert.throws(() => invalidStorage.append(1, header));
    await assert.rejects(invalidStorage.transport.inspect());

    const ordinary = fixture();
    ordinary.append(frame(1, 1, "early\n"));
    await ordinary.reader.poll();
    assert.equal(new TextDecoder().decode(ordinary.chunks[0].bytes), "early\n");
    ordinary.append(frame(2, 2, "later\n"), frame(3, 0));
    assert.equal((await ordinary.reader.finishProducer(receipt)).status, "accepted");
    assert.equal(ordinary.closed(), true);
    assert.deepEqual(ordinary.released, ["fixture"]);
    await ordinary.reader.finishProducer(receipt);
    await ordinary.reader.retire();
    assert.deepEqual(ordinary.released, ["fixture"], "Accepted source releases once, never on retirement");

    const fragment = fixture();
    const split = frame(1, 1, "é");
    fragment.append(split.slice(0, 10));
    await fragment.reader.poll();
    assert.equal(fragment.chunks.length, 0);
    fragment.append(split.slice(10), frame(2, 0));
    assert.equal((await fragment.reader.finishProducer({ ...receipt, outputSequence: 2 })).status, "accepted");

    const duplicate = fixture();
    duplicate.append(frame(1, 1, "one"), frame(1, 1, "again"));
    assert.equal((await duplicate.reader.poll()).status, "failed");
    assert.equal(duplicate.chunks.length, 1);
    const rejected = fixture(() => false);
    rejected.append(frame(1, 1, "unaccepted"));
    assert.equal((await rejected.reader.poll()).status, "failed");
    const foreign = fixture();
    assert.equal((await foreign.reader.finishProducer({ ...receipt, sessionId: "other" })).status, "failed");
    assert.deepEqual(foreign.released, [], "A foreign receipt cannot dispose source storage");
    const replaced = fixture();
    await replaced.reader.poll();
    replaced.replace();
    assert.equal((await replaced.reader.poll()).status, "failed");
    assert.deepEqual(replaced.released, []);
    const retired = fixture();
    retired.retire();
    assert.equal((await retired.reader.poll()).status, "retired");
    assert.equal(retired.closed(), true);
    assert.deepEqual(retired.released, [], "Retirement cannot remove a still-writing producer's storage");

    let completeInspection;
    let inspectionFinished = false;
    let closeCount = 0;
    const pendingInspection = createRuntimeOutputJournalReader({
        sessionId: "session", parentId: "activity", isCurrent: () => true, publish: () => true,
        transport: {
            inspect: async () => {
                await new Promise(resolve => { completeInspection = resolve; });
                inspectionFinished = true;
                return { identity: "pending", size: 0 };
            },
            read: async () => new Uint8Array(),
            close: async () => {
                assert.equal(inspectionFinished, true, "Retirement waits for a pending open before closing");
                closeCount++;
            },
            releaseAcceptedSource: async () => { throw new Error("Never release a retired producer"); }
        }
    });
    const pendingPoll = pendingInspection.poll();
    const retiring = pendingInspection.retire();
    completeInspection();
    await Promise.all([pendingPoll, retiring]);
    assert.equal(closeCount, 1);
    assert.equal(pendingInspection.snapshot().status, "retired");

    // Exercise cleanup rejection in the same reader, not in a host copy.
    const failedRelease = createRuntimeOutputJournalReader({
        sessionId: "session", parentId: "activity", isCurrent: () => true, publish: () => true,
        transport: {
            inspect: async () => ({ identity: "owned", size: header.length + 13 }),
            read: async (offset, length) => {
                const bytes = new Uint8Array(header.length + 13);
                bytes.set(header); bytes.set(frame(1, 0), header.length);
                return bytes.slice(offset, offset + length);
            },
            close: async () => {},
            releaseAcceptedSource: async () => { throw new Error("storage release failed"); }
        }
    });
    assert.equal((await failedRelease.finishProducer({ ...receipt, outputSequence: 1 })).status, "failed");
    assert.match(failedRelease.snapshot().detail, /storage could not be released/);
    console.log("Shared byte-reader cases passed; native/WebR transport acceptance remains separate.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
