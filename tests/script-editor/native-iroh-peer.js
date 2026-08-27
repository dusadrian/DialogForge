"use strict";

const collaboration = require("../../dist/src/script-editor/collaboration");
const {
    createNativeIrohLiveScriptTransport
} = require("../../dist/src/shell-electron/collaboration/nativeIrohLiveScriptTransport");

const sessionId = "session_native_1234567890abcdef";
const capability = "capability_native_1234567890abcdefghijklmnop";
const role = String(process.env.DIALOGFORGE_NATIVE_IROH_ROLE || "");
const userDataPath = String(process.env.DIALOGFORGE_NATIVE_IROH_USER_DATA || "");


const report = function(message) {
    if (process.send) {
        process.send(message);
    }
};


const sendOutbound = async function(transport, outboundFrames) {
    for (const outbound of outboundFrames) {
        await transport.send(outbound.frame, outbound.recipientEndpointId);
    }
};


const runHost = async function() {
    let transport = createNativeIrohLiveScriptTransport({ userDataPath });
    const available = await transport.capability();

    if (!available.available) {
        throw new Error(available.message);
    }

    const endpointId = available.endpointId;
    const host = collaboration.createLiveScriptHostSession({
        sessionId,
        capability,
        endpointId,
        displayName: "/private/teacher/native-proof.R",
        content: "x <- 1\n"
    });
    const transportAddress = await transport.host(sessionId);

    transport.onFrame((event) => {
        const responses = host.receive(event.frame, event.remoteEndpointId);
        void sendOutbound(transport, responses).catch((error) => {
            report({ type: "failure", message: error.message });
        });
    });

    report({
        type: "ready",
        endpointId,
        ticket: {
            formatVersion: 1,
            instructorEndpointId: endpointId,
            transportAddress,
            sessionId,
            capability,
            protocolVersions: { minimum: 2, maximum: 2 },
            displayName: "native-proof.R"
        }
    });

    process.on("message", (message) => {
        void (async () => {
            if (message?.type === "edit") {
                const current = host.state().content;
                const text = String(message.text || "");
                await sendOutbound(transport, host.publishEdits([{
                    range: {
                        startLineNumber: current.split("\n").length,
                        startColumn: 1,
                        endLineNumber: current.split("\n").length,
                        endColumn: 1
                    },
                    rangeOffset: current.length,
                    rangeLength: 0,
                    text
                }]));
                report({ type: "host-revision", revision: host.state().revision });
                return;
            }

            if (message?.type === "end") {
                await sendOutbound(transport, host.end("stopped"));
                report({ type: "host-ended" });
                return;
            }

            if (message?.type === "verify-ephemeral-identity") {
                await transport.shutdown();
                transport = createNativeIrohLiveScriptTransport({ userDataPath });
                const restarted = await transport.capability();
                report({
                    type: "restarted",
                    endpointId: restarted.endpointId,
                    available: restarted.available
                });
                await transport.shutdown();
                return;
            }

            if (message?.type === "metrics") {
                report({
                    type: "metrics",
                    role,
                    memory: process.memoryUsage()
                });
            }
        })().catch((error) => {
            report({ type: "failure", message: error.message });
        });
    });
};


const runParticipant = async function() {
    const ticket = JSON.parse(String(process.env.DIALOGFORGE_NATIVE_IROH_TICKET || "{}"));
    const transport = createNativeIrohLiveScriptTransport({ userDataPath });
    const available = await transport.capability();

    if (!available.available) {
        throw new Error(available.message);
    }

    const participant = collaboration.createLiveScriptParticipantSession({
        endpointId: available.endpointId,
        ticket
    });
    let lastReportedRevision = -1;
    let endedReported = false;
    let reconnectPending = false;
    let snapshotCount = 0;

    transport.onFrame((event) => {
        if (event.frame.type === "snapshot") {
            snapshotCount += 1;
        }
        const responses = participant.receive(event.frame, event.remoteEndpointId);
        void sendOutbound(transport, responses).then(() => {
            const state = participant.state();

            if (state.status === "active" && state.revision !== lastReportedRevision) {
                lastReportedRevision = state.revision;
                report({
                    type: "participant-state",
                    endpointId: available.endpointId,
                    status: state.status,
                    revision: state.revision,
                    content: state.content
                });
            }

            if (reconnectPending
                && event.frame.type === "snapshot"
                && state.status === "active") {
                reconnectPending = false;
                report({
                    type: "participant-reconnected",
                    revision: state.revision,
                    content: state.content,
                    snapshotCount
                });
            }

            if (state.status === "ended" && !endedReported) {
                endedReported = true;
                report({ type: "participant-ended" });
            }
        }).catch((error) => {
            report({ type: "failure", message: error.message });
        });
    });

    await transport.join(ticket);
    await sendOutbound(transport, [participant.join()]);

    process.on("message", (message) => {
        if (message?.type === "reconnect") {
            void (async () => {
                reconnectPending = true;
                await transport.closeSession(ticket.sessionId);
                await transport.join(ticket);
                await sendOutbound(transport, [participant.reconnect()]);
            })().catch((error) => {
                report({ type: "failure", message: error.message });
            });
            return;
        }

        if (message?.type === "metrics") {
            report({
                type: "metrics",
                role,
                memory: process.memoryUsage()
            });
            return;
        }

        if (message?.type !== "shutdown") {
            return;
        }

        void transport.shutdown().then(() => {
            report({ type: "shutdown" });
        }).catch((error) => {
            report({ type: "failure", message: error.message });
        });
    });
};


const run = async function() {
    if (!userDataPath) {
        throw new Error("Native iroh test userData path is required.");
    }

    if (role === "host") {
        await runHost();
        return;
    }

    if (role === "participant") {
        await runParticipant();
        return;
    }

    throw new Error(`Unknown native iroh peer role: ${role}`);
};


run().catch((error) => {
    report({ type: "failure", message: error.stack || error.message });
    process.exitCode = 1;
});
