"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const collaboration = require(
    "../../dist/src/script-editor/collaboration"
);

const instructorId = "instructor_1234567890abcdef";
const participantId = "participant_1234567890abcdef";
const attackerId = "attacker_1234567890abcdefghij";
const sessionId = "session_1234567890abcdef";
const capability = "capability_1234567890abcdefghijklmnop";


const loadFixture = function(name) {
    const fixturePath = path.join(
        __dirname,
        "../../protocol/live-script/v1/fixtures",
        name
    );

    return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
};


const settleTransport = async function() {
    for (let index = 0; index < 6; index += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
};


const sendOutbound = async function(transport, outboundFrames) {
    for (const outbound of outboundFrames) {
        await transport.send(outbound.frame, outbound.recipientEndpointId);
    }
};


const verifyFixturesAndBounds = function() {
    const validFrames = loadFixture("valid-frames.json");

    for (const frame of validFrames) {
        const parsed = collaboration.parseLiveScriptFrameValue(frame);
        assert.strictEqual(parsed.ok, true, `valid ${frame.type} fixture must parse`);

        const encoded = collaboration.encodeLiveScriptFrame(frame);
        const decoded = collaboration.parseLengthPrefixedLiveScriptFrame(encoded);
        assert.strictEqual(decoded.ok, true, `encoded ${frame.type} fixture must parse`);
        assert.deepStrictEqual(decoded.frame, frame);
    }

    const invalidFrames = loadFixture("invalid-frames.json");

    for (const fixture of invalidFrames) {
        const parsed = collaboration.parseLiveScriptFrameValue(fixture.frame);
        assert.strictEqual(parsed.ok, false, fixture.name);
    }

    const malformed = collaboration.parseLiveScriptJsonFrame(
        new TextEncoder().encode("{not-json")
    );
    assert.strictEqual(malformed.ok, false);
    assert.strictEqual(malformed.error.code, "malformed-json");

    const oversized = collaboration.parseLiveScriptJsonFrame(
        new Uint8Array(collaboration.LIVE_SCRIPT_MAX_FRAME_BYTES + 1)
    );
    assert.strictEqual(oversized.ok, false);
    assert.strictEqual(oversized.error.code, "oversized-frame");

    const wrongLength = collaboration.encodeLiveScriptFrame(validFrames[0]);
    wrongLength[3] -= 1;
    const mismatched = collaboration.parseLengthPrefixedLiveScriptFrame(wrongLength);
    assert.strictEqual(mismatched.ok, false);
    assert.strictEqual(mismatched.error.code, "length-mismatch");
};


const verifyTicketSanitization = function() {
    assert.strictEqual(
        collaboration.sanitizeLiveScriptDisplayName("/Users/teacher/private/analysis.R"),
        "analysis.R"
    );
    assert.strictEqual(
        collaboration.sanitizeLiveScriptDisplayName("C:\\Users\\teacher\\lesson.R"),
        "lesson.R"
    );

    const parsed = collaboration.parseLiveScriptSessionTicket({
        formatVersion: 1,
        instructorEndpointId: instructorId,
        transportAddress: `memory://${instructorId}/${sessionId}`,
        sessionId,
        capability,
        protocolVersions: { minimum: 1, maximum: 1 },
        displayName: "analysis.R"
    });

    assert.strictEqual(parsed.ok, true);
};


const verifyInMemorySession = async function() {
    const network = collaboration.createInMemoryLiveScriptNetwork();
    const instructorTransport = network.createEndpoint(instructorId);
    const participantTransport = network.createEndpoint(participantId);
    const attackerTransport = network.createEndpoint(attackerId);
    const host = collaboration.createLiveScriptHostSession({
        sessionId,
        capability,
        endpointId: instructorId,
        displayName: "/Users/teacher/private/analysis.R",
        content: "x <- 1\n"
    });
    const transportAddress = await instructorTransport.host(sessionId);
    const ticket = {
        formatVersion: 1,
        instructorEndpointId: instructorId,
        transportAddress,
        sessionId,
        capability,
        protocolVersions: { minimum: 1, maximum: 1 },
        displayName: "analysis.R"
    };
    const participant = collaboration.createLiveScriptParticipantSession({
        endpointId: participantId,
        ticket
    });
    const attackerResponses = [];

    instructorTransport.onFrame((event) => {
        const responses = host.receive(event.frame, event.remoteEndpointId);
        void sendOutbound(instructorTransport, responses);
    });
    participantTransport.onFrame((event) => {
        const responses = participant.receive(event.frame, event.remoteEndpointId);
        void sendOutbound(participantTransport, responses);
    });
    attackerTransport.onFrame((event) => {
        attackerResponses.push(event.frame);
    });

    await participantTransport.join(ticket);
    await sendOutbound(participantTransport, [participant.join()]);
    await settleTransport();

    assert.deepStrictEqual(participant.state(), {
        status: "active",
        revision: 0,
        content: "x <- 1\n",
        displayName: "analysis.R",
        resyncPending: false,
        errorMessage: ""
    });
    assert.strictEqual(host.state().participants[0].acknowledgedRevision, 0);

    const firstEdit = host.publishEdits([{
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
    await sendOutbound(instructorTransport, firstEdit);
    await settleTransport();

    assert.strictEqual(participant.state().content, "x <- 2\n");
    assert.strictEqual(participant.state().revision, 1);

    host.publishEdits([{
        range: {
            startLineNumber: 1,
            startColumn: 6,
            endLineNumber: 1,
            endColumn: 7
        },
        rangeOffset: 5,
        rangeLength: 1,
        text: "3"
    }]);
    const afterMissedRevision = host.publishEdits([{
        range: {
            startLineNumber: 2,
            startColumn: 1,
            endLineNumber: 2,
            endColumn: 1
        },
        rangeOffset: 7,
        rangeLength: 0,
        text: "# shared\n"
    }]);
    await sendOutbound(instructorTransport, afterMissedRevision);
    await settleTransport();

    assert.strictEqual(participant.state().content, "x <- 3\n# shared\n");
    assert.strictEqual(participant.state().revision, 3);
    assert.strictEqual(participant.state().resyncPending, false);

    const duplicateEdit = host.publishEdits([{
        range: {
            startLineNumber: 3,
            startColumn: 1,
            endLineNumber: 3,
            endColumn: 1
        },
        rangeOffset: 16,
        rangeLength: 0,
        text: "print(x)\n"
    }]);
    await sendOutbound(instructorTransport, duplicateEdit);
    await sendOutbound(instructorTransport, duplicateEdit);
    await settleTransport();

    assert.strictEqual(participant.state().content, "x <- 3\n# shared\nprint(x)\n");
    assert.strictEqual(participant.state().revision, 4);

    await sendOutbound(
        instructorTransport,
        host.replaceContent("answer <- 42\n")
    );
    await settleTransport();

    assert.strictEqual(participant.state().content, "answer <- 42\n");
    assert.strictEqual(participant.state().revision, 5);

    const hostContentBeforeAttack = host.state().content;
    await attackerTransport.send({
        protocol: collaboration.LIVE_SCRIPT_PROTOCOL,
        version: collaboration.LIVE_SCRIPT_PROTOCOL_VERSION,
        sessionId,
        type: "edit",
        senderEndpointId: attackerId,
        messageNumber: 1,
        payload: {
            baseRevision: 5,
            revision: 6,
            edits: [{
                range: {
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: 1,
                    endColumn: 1
                },
                rangeOffset: 0,
                rangeLength: 0,
                text: "system('forbidden')\n"
            }]
        }
    }, instructorId);
    await settleTransport();

    assert.strictEqual(host.state().content, hostContentBeforeAttack);
    assert.strictEqual(attackerResponses.length, 1);
    assert.strictEqual(attackerResponses[0].type, "error");
    assert.strictEqual(attackerResponses[0].payload.code, "authorization-failed");

    await sendOutbound(instructorTransport, host.end("stopped"));
    await settleTransport();

    assert.strictEqual(participant.state().status, "ended");
    assert.strictEqual(host.state().status, "ended");

    await participantTransport.shutdown();
    await attackerTransport.shutdown();
    await instructorTransport.shutdown();
};


const run = async function() {
    verifyFixturesAndBounds();
    verifyTicketSanitization();
    await verifyInMemorySession();
    process.stdout.write("OK live-script host-neutral collaboration contract\n");
};


run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
