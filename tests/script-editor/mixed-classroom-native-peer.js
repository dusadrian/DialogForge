"use strict";

const collaboration = require(
    "../../dist/src/script-editor/collaboration"
);
const {
    createNativeIrohLiveScriptTransport
} = require(
    "../../dist/src/shell-electron/collaboration/nativeIrohLiveScriptTransport"
);


const role = String(process.env.DIALOGFORGE_MIXED_CLASSROOM_ROLE || "");
const participantCount = Number(
    process.env.DIALOGFORGE_MIXED_CLASSROOM_PARTICIPANTS || 0
);
const expectedParticipantCount = Number(
    process.env.DIALOGFORGE_MIXED_CLASSROOM_EXPECTED_PARTICIPANTS || 0
);
const initialScriptBytes = Number(
    process.env.DIALOGFORGE_MIXED_CLASSROOM_INITIAL_BYTES || 262144
);
const line = "value <- value + 1 # mixed classroom analysis\n";
const initialContent = line.repeat(
    Math.ceil(initialScriptBytes / Buffer.byteLength(line))
);
const memoryBefore = process.memoryUsage();


const report = function(message) {
    process.send?.(message);
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


const waitFor = async function(predicate, message, timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (predicate()) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    if (!predicate()) {
        throw new Error(message);
    }
};


const memoryMetrics = function() {
    const current = process.memoryUsage();

    return {
        current,
        heapDelta: current.heapUsed - memoryBefore.heapUsed,
        rssDelta: current.rss - memoryBefore.rss
    };
};


const runHost = async function() {
    const transport = createNativeIrohLiveScriptTransport({});
    const capability = await transport.capability();

    if (!capability.available || !capability.endpointId) {
        throw new Error(capability.message);
    }

    const sessionId = String(
        process.env.DIALOGFORGE_MIXED_CLASSROOM_SESSION_ID || ""
    );
    const sessionCapability = String(
        process.env.DIALOGFORGE_MIXED_CLASSROOM_CAPABILITY || ""
    );
    const expiresAt = Date.now() + 30 * 60 * 1000;
    const transportAddress = await transport.host(sessionId);
    const host = collaboration.createLiveScriptHostSession({
        sessionId,
        capability: sessionCapability,
        endpointId: capability.endpointId,
        displayName: "mixed-classroom.R",
        content: initialContent,
        expiresAt,
        maxParticipants: expectedParticipantCount
    });
    const outboundMetrics = { frames: 0, bytes: 0 };
    let receiveQueue = Promise.resolve();
    let receiveError = null;
    let editQueue = Promise.resolve();

    transport.onFrame((event) => {
        receiveQueue = receiveQueue.then(async () => {
            await sendOutbound(
                transport,
                host.receive(event.frame, event.remoteEndpointId),
                outboundMetrics
            );
        }).catch((error) => {
            receiveError = error;
            report({ type: "failure", message: error.stack || error.message });
        });
    });

    report({
        type: "ready",
        ticket: {
            formatVersion: 1,
            instructorEndpointId: capability.endpointId,
            transportAddress,
            sessionId,
            capability: sessionCapability,
            protocolVersions: { minimum: 1, maximum: 1 },
            expiresAt,
            displayName: "mixed-classroom.R"
        }
    });

    process.on("message", (message) => {
        if (message?.type === "wait-participants") {
            void waitFor(
                () => Boolean(receiveError)
                    || host.state().participants.length === expectedParticipantCount,
                "Native presenter did not observe every mixed participant."
            ).then(() => {
                if (receiveError) {
                    throw receiveError;
                }

                report({
                    type: "participants-ready",
                    count: host.state().participants.length
                });
            }).catch((error) => {
                report({ type: "failure", message: error.stack || error.message });
            });
            return;
        }

        if (message?.type === "edit") {
            editQueue = editQueue.then(async () => {
                const current = host.state().content;
                const text = String(message.text || "");
                const revision = host.state().revision + 1;

                await sendOutbound(
                    transport,
                    host.publishEdits([{
                        range: {
                            startLineNumber: current.split("\n").length,
                            startColumn: 1,
                            endLineNumber: current.split("\n").length,
                            endColumn: 1
                        },
                        rangeOffset: current.length,
                        rangeLength: 0,
                        text
                    }]),
                    outboundMetrics
                );
                await waitFor(
                    () => Boolean(receiveError)
                        || host.state().participants.every((participant) => {
                            return participant.acknowledgedRevision >= revision;
                        }),
                    `Mixed participants did not acknowledge revision ${revision}.`
                );

                if (receiveError) {
                    throw receiveError;
                }

                report({ type: "revision-complete", revision });
            }).catch((error) => {
                report({ type: "failure", message: error.stack || error.message });
            });
            return;
        }

        if (message?.type === "metrics") {
            report({
                type: "metrics",
                role,
                memory: memoryMetrics(),
                outbound: outboundMetrics
            });
            return;
        }

        if (message?.type === "shutdown") {
            void sendOutbound(transport, host.end("stopped"), outboundMetrics)
                .catch(() => {})
                .then(() => transport.shutdown())
                .then(() => report({ type: "shutdown" }))
                .catch((error) => {
                    report({ type: "failure", message: error.stack || error.message });
                });
        }
    });
};


const createParticipant = async function(ticket, index) {
    const transport = createNativeIrohLiveScriptTransport({});
    const capability = await transport.capability();

    if (!capability.available || !capability.endpointId) {
        throw new Error(capability.message);
    }

    let participant = null;
    let receiveQueue = Promise.resolve();
    let receiveError = null;

    transport.onFrame((event) => {
        receiveQueue = receiveQueue.then(async () => {
            if (!participant) {
                return;
            }

            await sendOutbound(
                transport,
                participant.receive(event.frame, event.remoteEndpointId)
            );
        }).catch((error) => {
            receiveError = error;
        });
    });

    const started = process.hrtime.bigint();
    await transport.join(ticket);
    participant = collaboration.createLiveScriptParticipantSession({
        endpointId: capability.endpointId,
        ticket
    });
    await sendOutbound(transport, [participant.join()]);
    await waitFor(
        () => Boolean(receiveError) || participant.state().status === "active",
        `Native participant ${index} did not receive its initial snapshot.`
    );

    if (receiveError) {
        throw receiveError;
    }

    return {
        transport,
        participant,
        initialSyncMs: Number(process.hrtime.bigint() - started) / 1_000_000
    };
};


const runParticipants = async function() {
    const ticket = JSON.parse(String(
        process.env.DIALOGFORGE_MIXED_CLASSROOM_TICKET || "{}"
    ));
    const participants = [];

    for (let index = 0; index < participantCount; index += 1) {
        participants.push(await createParticipant(ticket, index));
    }

    report({
        type: "ready",
        initialSyncMs: participants.map((entry) => entry.initialSyncMs)
    });

    process.on("message", (message) => {
        if (message?.type === "metrics") {
            report({
                type: "metrics",
                role,
                memory: memoryMetrics(),
                revisions: participants.map((entry) => {
                    return entry.participant.state().revision;
                })
            });
            return;
        }

        if (message?.type === "shutdown") {
            void Promise.all(participants.map((entry) => {
                return entry.transport.shutdown();
            })).then(() => report({ type: "shutdown" })).catch((error) => {
                report({ type: "failure", message: error.stack || error.message });
            });
        }
    });
};


const run = async function() {
    if (role === "host") {
        await runHost();
        return;
    }

    if (role === "participants") {
        await runParticipants();
        return;
    }

    throw new Error(`Unknown mixed-classroom native peer role: ${role}`);
};


run().catch((error) => {
    report({ type: "failure", message: error.stack || error.message });
    process.exitCode = 1;
});
