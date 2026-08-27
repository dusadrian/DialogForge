"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const collaboration = require(
    "../../dist/src/script-editor/collaboration"
);


const targets = JSON.parse(fs.readFileSync(
    path.join(__dirname, "live-script-classroom-targets.json"),
    "utf8"
));
const scenarioName = String(
    process.env.DIALOGFORGE_LIVE_SCRIPT_CLASSROOM_SCENARIO || "required"
).trim();
const scenario = targets[scenarioName];

if (!scenario || (scenarioName !== "required" && scenarioName !== "stretch")) {
    throw new Error(`Unknown live-script classroom scenario: ${scenarioName}`);
}

const participantCount = scenario.participants;
const editCount = targets.editCount;
const line = "value <- value + 1 # classroom analysis\n";
const initialContent = line.repeat(
    Math.ceil(targets.initialScriptBytes / line.length)
);


const createOutboundMetrics = function() {
    return {
        frames: 0,
        bytes: 0
    };
};


const sendOutbound = async function(transport, frames, metrics = null) {
    for (const outbound of frames) {
        if (metrics) {
            metrics.frames += 1;
            metrics.bytes += Buffer.byteLength(JSON.stringify(outbound.frame)) + 4;
        }

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


const toMiB = function(bytes) {
    return bytes / 1048576;
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
        protocolVersions: { minimum: 2, maximum: 2 },
        displayName: "classroom-analysis.R"
    };
    const participants = [];
    const transports = [];
    const memoryBefore = process.memoryUsage();
    const hostOutbound = createOutboundMetrics();
    const initialSyncStarted = process.hrtime.bigint();

    hostTransport.onFrame((event) => {
        void sendOutbound(
            hostTransport,
            host.receive(event.frame, event.remoteEndpointId),
            hostOutbound
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
    const initialSyncMs = Number(
        process.hrtime.bigint() - initialSyncStarted
    ) / 1_000_000;

    const latenciesMs = [];

    for (let index = 0; index < editCount; index += 1) {
        const current = host.state().content;
        const started = process.hrtime.bigint();
        await sendOutbound(
            hostTransport,
            host.publishEdits([{
                range: {
                    startLineNumber: current.split("\n").length,
                    startColumn: 1,
                    endLineNumber: current.split("\n").length,
                    endColumn: 1
                },
                rangeOffset: current.length,
                rangeLength: 0,
                text: `# edit ${index}\n`
            }]),
            hostOutbound
        );
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

    const result = {
        scenario: scenarioName,
        participants: participantCount,
        initialBytes: Buffer.byteLength(initialContent),
        edits: editCount,
        initialSyncMs,
        editLatencyMs: {
            p50: percentile(latenciesMs, 0.50),
            p95: percentile(latenciesMs, 0.95),
            p99: percentile(latenciesMs, 0.99),
            maximum: Math.max(...latenciesMs)
        },
        hostOutboundFrames: hostOutbound.frames,
        hostOutboundMiB: toMiB(hostOutbound.bytes),
        heapDeltaMiB: toMiB(memoryAfter.heapUsed - memoryBefore.heapUsed),
        rssDeltaMiB: toMiB(memoryAfter.rss - memoryBefore.rss)
    };

    assert.ok(
        result.initialSyncMs <= scenario.initialSyncMs,
        `Initial synchronization exceeded ${scenario.initialSyncMs} ms.`
    );
    assert.ok(
        result.editLatencyMs.p95 <= scenario.editP95Ms,
        `Edit p95 exceeded ${scenario.editP95Ms} ms.`
    );
    assert.ok(
        result.editLatencyMs.maximum <= scenario.editMaximumMs,
        `Maximum edit latency exceeded ${scenario.editMaximumMs} ms.`
    );
    assert.ok(
        result.heapDeltaMiB <= scenario.inMemoryHeapDeltaMiB,
        `Heap delta exceeded ${scenario.inMemoryHeapDeltaMiB} MiB.`
    );

    process.stdout.write([
        `live-script ${scenarioName} classroom: ${participantCount} participants`,
        `${result.initialBytes} initial bytes`,
        `${editCount} edits`,
        `initial=${result.initialSyncMs.toFixed(2)}ms`,
        `p50=${result.editLatencyMs.p50.toFixed(2)}ms`,
        `p95=${result.editLatencyMs.p95.toFixed(2)}ms`,
        `max=${result.editLatencyMs.maximum.toFixed(2)}ms`,
        `hostOutbound=${result.hostOutboundMiB.toFixed(1)}MiB`,
        `heapDelta=${result.heapDeltaMiB.toFixed(1)}MiB`,
        `rssDelta=${result.rssDeltaMiB.toFixed(1)}MiB`
    ].join(", ") + "\n");
    process.stdout.write(`${JSON.stringify(result)}\n`);

    await Promise.all(transports.map((transport) => transport.shutdown()));
    await hostTransport.shutdown();
};


run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
