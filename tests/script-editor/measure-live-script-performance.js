"use strict";

const assert = require("node:assert/strict");
const collaboration = require(
    "../../dist/src/script-editor/collaboration"
);


const participantCount = 25;
const editCount = 50;
const line = "value <- value + 1 # classroom analysis\n";
const initialContent = line.repeat(Math.ceil((256 * 1024) / line.length));


const sendOutbound = async function(transport, frames) {
    for (const outbound of frames) {
        await transport.send(outbound.frame, outbound.recipientEndpointId);
    }
};


const waitFor = async function(predicate, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;

    while (!predicate() && Date.now() < deadline) {
        await new Promise((resolve) => setImmediate(resolve));
    }

    assert.ok(predicate(), "Timed out waiting for live-script propagation.");
};


const percentile = function(values, fraction) {
    const ordered = values.slice().sort((left, right) => left - right);
    const index = Math.min(
        ordered.length - 1,
        Math.floor(ordered.length * fraction)
    );

    return ordered[index];
};


const run = async function() {
    const network = collaboration.createInMemoryLiveScriptNetwork();
    const hostTransport = network.createEndpoint(
        "instructor_1234567890abcdef"
    );
    const host = collaboration.createLiveScriptHostSession({
        sessionId: "session_1234567890abcdef",
        capability: "capability_1234567890abcdefghijklmnop",
        endpointId: hostTransport.endpointId,
        displayName: "classroom-analysis.R",
        content: initialContent,
        maxParticipants: participantCount
    });
    const transportAddress = await hostTransport.host(host.state().sessionId);
    const ticket = {
        formatVersion: 1,
        instructorEndpointId: hostTransport.endpointId,
        transportAddress,
        sessionId: host.state().sessionId,
        capability: "capability_1234567890abcdefghijklmnop",
        protocolVersions: { minimum: 1, maximum: 1 },
        displayName: "classroom-analysis.R"
    };
    const participants = [];
    const transports = [];
    const memoryBefore = process.memoryUsage();

    hostTransport.onFrame((event) => {
        void sendOutbound(
            hostTransport,
            host.receive(event.frame, event.remoteEndpointId)
        );
    });

    for (let index = 0; index < participantCount; index += 1) {
        const endpointId = `participant_${String(index).padStart(16, "0")}abcdef`;
        const transport = network.createEndpoint(endpointId);
        const participant = collaboration.createLiveScriptParticipantSession({
            endpointId,
            ticket
        });
        transport.onFrame((event) => {
            void sendOutbound(
                transport,
                participant.receive(event.frame, event.remoteEndpointId)
            );
        });
        await transport.join(ticket);
        await sendOutbound(transport, [participant.join()]);
        participants.push(participant);
        transports.push(transport);
    }

    await waitFor(() => participants.every((participant) => {
        return participant.state().content === initialContent;
    }));

    const latenciesMs = [];

    for (let index = 0; index < editCount; index += 1) {
        const current = host.state().content;
        const started = process.hrtime.bigint();
        await sendOutbound(hostTransport, host.publishEdits([{
            range: {
                startLineNumber: current.split("\n").length,
                startColumn: 1,
                endLineNumber: current.split("\n").length,
                endColumn: 1
            },
            rangeOffset: current.length,
            rangeLength: 0,
            text: `# edit ${index}\n`
        }]));
        await waitFor(() => participants.every((participant) => {
            return participant.state().revision === index + 1;
        }));
        latenciesMs.push(
            Number(process.hrtime.bigint() - started) / 1_000_000
        );
    }

    const memoryAfter = process.memoryUsage();
    const expectedContent = host.state().content;
    assert.ok(participants.every((participant) => {
        return participant.state().content === expectedContent;
    }));

    process.stdout.write([
        `live-script performance: ${participantCount} participants`,
        `${Buffer.byteLength(initialContent)} initial bytes`,
        `${editCount} edits`,
        `p50=${percentile(latenciesMs, 0.50).toFixed(2)}ms`,
        `p95=${percentile(latenciesMs, 0.95).toFixed(2)}ms`,
        `heapDelta=${((memoryAfter.heapUsed - memoryBefore.heapUsed) / 1048576)
            .toFixed(1)}MiB`
    ].join(", ") + "\n");

    await Promise.all(transports.map((transport) => transport.shutdown()));
    await hostTransport.shutdown();
};


run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
