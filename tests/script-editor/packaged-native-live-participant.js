"use strict";

const path = require("node:path");
const readline = require("node:readline");


const applicationRoot = String(
    process.env.DIALOGFORGE_PACKAGED_APP_ROOT || ""
);
const applicationArchive = path.join(
    applicationRoot,
    "resources",
    "app.asar"
);
const collaboration = require(path.join(
    applicationArchive,
    "src/script-editor/collaboration"
));
const {
    createNativeIrohLiveScriptTransport
} = require(path.join(
    applicationArchive,
    "src/shell-electron/collaboration/nativeIrohLiveScriptTransport"
));
const ticket = JSON.parse(Buffer.from(
    String(process.env.DIALOGFORGE_LIVE_SCRIPT_TICKET_BASE64 || ""),
    "base64"
).toString("utf8"));


const report = function(value) {
    process.stdout.write(`${JSON.stringify(value)}\n`);
};


const sendOutbound = async function(transport, frames) {
    for (const outbound of frames) {
        await transport.send(outbound.frame, outbound.recipientEndpointId);
    }
};


const run = async function() {
    const transport = createNativeIrohLiveScriptTransport({
        userDataPath: path.dirname(__filename)
    });
    const capability = await transport.capability();

    if (!capability.available) {
        throw new Error(capability.message);
    }

    const participant = collaboration.createLiveScriptParticipantSession({
        endpointId: capability.endpointId,
        ticket
    });
    let receiveQueue = Promise.resolve();
    let snapshotCount = 0;
    let lastRevision = -1;
    let reconnectPending = false;

    transport.onFrame((event) => {
        receiveQueue = receiveQueue.then(async () => {
            if (event.frame.type === "snapshot") {
                snapshotCount += 1;
            }

            await sendOutbound(
                transport,
                participant.receive(event.frame, event.remoteEndpointId)
            );
            const state = participant.state();

            if (state.status === "active" && state.revision !== lastRevision) {
                lastRevision = state.revision;
                report({
                    type: "state",
                    status: state.status,
                    revision: state.revision,
                    content: state.content,
                    snapshotCount
                });
            }

            if (reconnectPending
                && event.frame.type === "snapshot"
                && state.status === "active") {
                reconnectPending = false;
                report({
                    type: "reconnected",
                    revision: state.revision,
                    snapshotCount
                });
            }

            if (state.status === "ended") {
                report({ type: "ended", snapshotCount });
            }
        }).catch((error) => {
            report({ type: "failure", message: error.stack || error.message });
        });
    });

    await transport.join(ticket);
    await sendOutbound(transport, [participant.join()]);

    const input = readline.createInterface({ input: process.stdin });
    input.on("line", (line) => {
        void (async () => {
            const message = JSON.parse(line);

            if (message.type === "reconnect") {
                reconnectPending = true;
                await transport.closeSession(ticket.sessionId);
                await transport.join(ticket);
                await sendOutbound(transport, [
                    participant.reconnect(transport.endpointId)
                ]);
                return;
            }

            if (message.type === "shutdown") {
                input.close();
                await transport.shutdown();
                report({ type: "shutdown" });
            }
        })().catch((error) => {
            report({ type: "failure", message: error.stack || error.message });
        });
    });
};


run().catch((error) => {
    report({ type: "failure", message: error.stack || error.message });
    process.exitCode = 1;
});
