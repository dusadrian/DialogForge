"use strict";

const assert = require("node:assert/strict");
const collaboration = require(
    "../../dist/src/script-editor/collaboration"
);


const frameBase = function(endpointId, messageNumber) {
    return {
        protocol: collaboration.LIVE_SCRIPT_PROTOCOL,
        version: collaboration.LIVE_SCRIPT_PROTOCOL_VERSION,
        sessionId: "session_1234567890abcdef",
        senderEndpointId: endpointId,
        messageNumber
    };
};


const joinFrame = function(endpointId, capability, messageNumber = 1) {
    return {
        ...frameBase(endpointId, messageNumber),
        type: "join",
        payload: {
            capability,
            supportedVersions: [collaboration.LIVE_SCRIPT_PROTOCOL_VERSION]
        }
    };
};


const verifyParticipantAndAuthorizationLimits = function() {
    const capability = "capability_1234567890abcdefghijklmnop";
    const host = collaboration.createLiveScriptHostSession({
        sessionId: "session_1234567890abcdef",
        capability,
        endpointId: "instructor_1234567890abcdef",
        displayName: "limits.R",
        content: "x <- 1\n",
        maxParticipants: 2
    });

    for (const endpointId of [
        "participant_1234567890abcdef",
        "participant_2234567890abcdef"
    ]) {
        const response = host.receive(
            joinFrame(endpointId, capability),
            endpointId
        );
        assert.deepEqual(response.map((entry) => entry.frame.type), [
            "welcome",
            "snapshot"
        ]);
    }

    const extraEndpoint = "participant_3234567890abcdef";
    const limitResponse = host.receive(
        joinFrame(extraEndpoint, capability),
        extraEndpoint
    );
    assert.equal(limitResponse[0].frame.type, "error");
    assert.equal(limitResponse[0].frame.payload.code, "participant-limit");

    const protectedHost = collaboration.createLiveScriptHostSession({
        sessionId: "session_1234567890abcdef",
        capability,
        endpointId: "instructor_1234567890abcdef",
        displayName: "protected.R",
        content: "x <- 1\n"
    });
    const attacker = "attacker_1234567890abcdefghij";

    for (let attempt = 1;
        attempt <= collaboration.LIVE_SCRIPT_MAX_JOIN_ATTEMPTS_PER_ENDPOINT;
        attempt += 1) {
        const response = protectedHost.receive(
            joinFrame(attacker, "wrong_capability_1234567890", attempt),
            attacker
        );
        assert.equal(response[0].frame.payload.code, "authorization-failed");
        assert.equal(response[0].frame.payload.message, "Live session is not available.");
    }

    const blocked = protectedHost.receive(
        joinFrame(
            attacker,
            capability,
            collaboration.LIVE_SCRIPT_MAX_JOIN_ATTEMPTS_PER_ENDPOINT + 1
        ),
        attacker
    );
    assert.equal(blocked[0].frame.payload.code, "authorization-failed");
    assert.equal(protectedHost.state().participants.length, 0);
};


const verifyExpiredSessionRejectsJoin = function() {
    const endpointId = "participant_1234567890abcdef";
    const capability = "capability_1234567890abcdefghijklmnop";
    const host = collaboration.createLiveScriptHostSession({
        sessionId: "session_1234567890abcdef",
        capability,
        endpointId: "instructor_1234567890abcdef",
        displayName: "expired.R",
        content: "x <- 1\n",
        expiresAt: Date.now() - 1
    });
    const response = host.receive(joinFrame(endpointId, capability), endpointId);

    assert.equal(response[0].frame.type, "error");
    assert.equal(response[0].frame.payload.code, "session-ended");
    assert.equal(host.state().status, "ended");
};


const verifyVersionMismatch = function() {
    const endpointId = "participant_1234567890abcdef";
    const capability = "capability_1234567890abcdefghijklmnop";
    const host = collaboration.createLiveScriptHostSession({
        sessionId: "session_1234567890abcdef",
        capability,
        endpointId: "instructor_1234567890abcdef",
        displayName: "version.R",
        content: "x <- 1\n"
    });
    const incompatible = joinFrame(endpointId, capability);
    incompatible.payload.supportedVersions = [99];
    const response = host.receive(incompatible, endpointId);

    assert.equal(response[0].frame.type, "error");
    assert.equal(response[0].frame.payload.code, "incompatible-version");
    assert.equal(host.state().participants.length, 0);
};


const settleCallbacks = async function() {
    for (let index = 0; index < 6; index += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
};


const verifySlowParticipantIsolation = async function() {
    const frameListeners = [];
    const hostStates = [];
    const healthyEndpointId = "healthy_1234567890abcdef";
    const slowEndpointId = "slow_1234567890abcdefghij";
    const healthyRevisions = [];
    let slowPendingBytes = 0;
    let maximumSlowPendingBytes = 0;
    const bridge = {
        capability: async () => ({
            available: true,
            endpointId: "instructor_1234567890abcdef",
            message: ""
        }),
        host: async () => ({
            ok: true,
            message: "",
            endpointId: "instructor_1234567890abcdef",
            transportAddress: "memory://instructor"
        }),
        join: async () => ({ ok: true, message: "", endpointId: "" }),
        send: (frame, recipientEndpointId) => {
            if (frame.type !== "edit") {
                return Promise.resolve({ ok: true, message: "" });
            }

            if (recipientEndpointId === healthyEndpointId) {
                healthyRevisions.push(frame.payload.revision);
                return Promise.resolve({ ok: true, message: "" });
            }

            if (recipientEndpointId === slowEndpointId) {
                const bytes = Buffer.byteLength(JSON.stringify(frame)) + 4;

                if (slowPendingBytes + bytes
                    > collaboration.LIVE_SCRIPT_MAX_PENDING_OUTBOUND_BYTES) {
                    return Promise.resolve({
                        ok: false,
                        message: "Live-script recipient is not keeping up."
                    });
                }

                slowPendingBytes += bytes;
                maximumSlowPendingBytes = Math.max(
                    maximumSlowPendingBytes,
                    slowPendingBytes
                );
                return new Promise(() => {});
            }

            return Promise.resolve({ ok: true, message: "" });
        },
        close: async () => ({ ok: true, message: "" }),
        onFrame: (listener) => frameListeners.push(listener),
        onState() {}
    };
    const controller = collaboration.createLiveScriptSessionController({
        transport: bridge,
        participantFrameApplied() {},
        participantStateChanged() {},
        hostStateChanged(_sessionId, state) {
            hostStates.push(state);
        },
        transportStateChanged() {}
    });
    const hosted = await controller.host({
        sessionId: "session_1234567890abcdef",
        capability: "capability_1234567890abcdefghijklmnop",
        displayName: "backpressure.R",
        content: "",
        expiresAt: Date.now() + 60_000
    });

    frameListeners[0]({
        frame: joinFrame(slowEndpointId, hosted.ticket.capability),
        remoteEndpointId: slowEndpointId
    });
    frameListeners[0]({
        frame: joinFrame(healthyEndpointId, hosted.ticket.capability),
        remoteEndpointId: healthyEndpointId
    });
    await settleCallbacks();
    assert.equal(controller.getHostState(hosted.ticket.sessionId).participants.length, 2);

    const paste = "x".repeat(collaboration.LIVE_SCRIPT_MAX_EDIT_TEXT_BYTES);
    const started = performance.now();

    for (let revision = 1; revision <= 20; revision += 1) {
        const offset = (revision - 1) * paste.length;
        await controller.publishHostEdits(hosted.ticket.sessionId, [{
            range: {
                startLineNumber: 1,
                startColumn: offset + 1,
                endLineNumber: 1,
                endColumn: offset + 1
            },
            rangeOffset: offset,
            rangeLength: 0,
            text: paste
        }]);
    }

    const healthyElapsedMs = performance.now() - started;
    const finalPasteOffset = 19 * paste.length;
    await controller.publishHostEdits(hosted.ticket.sessionId, [{
        range: {
            startLineNumber: 1,
            startColumn: finalPasteOffset + 1,
            endLineNumber: 1,
            endColumn: finalPasteOffset + paste.length + 1
        },
        rangeOffset: finalPasteOffset,
        rangeLength: paste.length,
        text: ""
    }]);
    await controller.publishHostEdits(hosted.ticket.sessionId, [{
        range: {
            startLineNumber: 1,
            startColumn: finalPasteOffset + 1,
            endLineNumber: 1,
            endColumn: finalPasteOffset + 1
        },
        rangeOffset: finalPasteOffset,
        rangeLength: 0,
        text: paste
    }]);
    await settleCallbacks();
    assert.deepEqual(
        healthyRevisions,
        Array.from({ length: 22 }, (_value, index) => index + 1)
    );
    assert.ok(
        healthyElapsedMs < 250,
        `Healthy participant was delayed for ${healthyElapsedMs.toFixed(2)} ms.`
    );
    assert.ok(
        maximumSlowPendingBytes
            <= collaboration.LIVE_SCRIPT_MAX_PENDING_OUTBOUND_BYTES
    );
    assert.deepEqual(
        controller.getHostState(hosted.ticket.sessionId).participants
            .map((participant) => participant.endpointId),
        [healthyEndpointId]
    );
    assert.ok(hostStates.some((state) => {
        return state.revision === 22 && state.participants.length === 1;
    }));

    process.stdout.write(
        `slow-participant isolation: healthy 20-frame burst ${healthyElapsedMs
            .toFixed(2)} ms, slow queue ${(maximumSlowPendingBytes / 1048576)
            .toFixed(2)} MiB\n`
    );

    await controller.endHost(hosted.ticket.sessionId, "stopped");
};


const verifyEditsDoNotCancelExpiry = async function() {
    const stateListeners = [];
    const frameListeners = [];
    const hostStates = [];
    const closedSessions = [];
    const bridge = {
        capability: async () => ({
            available: true,
            endpointId: "instructor_1234567890abcdef",
            message: ""
        }),
        host: async () => ({
            ok: true,
            message: "",
            endpointId: "instructor_1234567890abcdef",
            transportAddress: "memory://instructor"
        }),
        join: async () => ({ ok: true, message: "", endpointId: "" }),
        send: async () => ({ ok: true, message: "" }),
        close: async (sessionId) => {
            closedSessions.push(sessionId);
            return { ok: true, message: "" };
        },
        onFrame: (listener) => frameListeners.push(listener),
        onState: (listener) => stateListeners.push(listener)
    };
    const controller = collaboration.createLiveScriptSessionController({
        transport: bridge,
        participantFrameApplied() {},
        participantStateChanged() {},
        hostStateChanged(_sessionId, state) {
            hostStates.push(state.status);
        },
        transportStateChanged() {}
    });
    const expiresAt = Date.now() + 80;
    const hosted = await controller.host({
        sessionId: "session_1234567890abcdef",
        capability: "capability_1234567890abcdefghijklmnop",
        displayName: "expiry.R",
        content: "x <- 1\n",
        expiresAt
    });

    await controller.publishHostEdits(hosted.ticket.sessionId, [{
        range: {
            startLineNumber: 1,
            startColumn: 6,
            endLineNumber: 1,
            endColumn: 7
        },
        rangeOffset: 5,
        rangeLength: 1,
        text: "2"
    }]);
    await new Promise((resolve) => setTimeout(resolve, 140));

    assert.ok(hostStates.includes("ended"));
    assert.deepEqual(closedSessions, [hosted.ticket.sessionId]);
    assert.equal(controller.getHostState(hosted.ticket.sessionId), null);
};


const run = async function() {
    verifyParticipantAndAuthorizationLimits();
    verifyExpiredSessionRejectsJoin();
    verifyVersionMismatch();
    await verifyEditsDoNotCancelExpiry();
    await verifySlowParticipantIsolation();
    process.stdout.write(
        "live-script participant limits, authorization bounds, and expiry: ok\n"
    );
};


run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
