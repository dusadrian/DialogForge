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
    await verifyEditsDoNotCancelExpiry();
    process.stdout.write(
        "live-script participant limits, authorization bounds, and expiry: ok\n"
    );
};


run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
