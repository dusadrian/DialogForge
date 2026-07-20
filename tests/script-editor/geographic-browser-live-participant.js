"use strict";

const readline = require("node:readline");
const { chromium } = require("playwright");


const webUrl = String(
    process.env.DIALOGFORGE_LIVE_SCRIPT_WEB_URL || "http://127.0.0.1:5173/"
);
const ticket = JSON.parse(Buffer.from(
    String(process.env.DIALOGFORGE_LIVE_SCRIPT_TICKET_BASE64 || ""),
    "base64"
).toString("utf8"));


const report = function(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
};


const run = async function() {
    report({ type: "progress", stage: "launching-chromium" });
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
            report({
                type: "browser-console",
                level: message.type(),
                message: message.text()
            });
        }
    });
    page.on("pageerror", (error) => {
        report({ type: "failure", message: error.message });
    });
    await page.goto(webUrl, { waitUntil: "domcontentloaded" });
    report({ type: "progress", stage: "web-app-loaded" });
    const initialStarted = performance.now();
    const initial = await page.evaluate(async (sessionTicket) => {
        const transportModule = await import(
            "/vendor/dialogforge-iroh/0.1.0/index.mjs"
        );
        const participantModule = await import(
            "/browser-esm/src/script-editor/collaboration/"
            + "liveScriptParticipantSession.js"
        );
        console.warn("geographic-browser: modules-loaded");
        const transport = await transportModule.createLiveScriptTransport();
        console.warn("geographic-browser: transport-created");
        let participant = null;
        let receiveQueue = Promise.resolve();
        let snapshotCount = 0;

        const sendOutbound = async function(frames) {
            for (const outbound of frames) {
                await transport.send(
                    outbound.frame,
                    outbound.recipientEndpointId
                );
            }
        };

        transport.onFrame((event) => {
            receiveQueue = receiveQueue.then(async () => {
                if (!participant) {
                    return;
                }

                if (event.frame.type === "snapshot") {
                    snapshotCount += 1;

                    if (window.__dialogForgeGeographicParticipant) {
                        window.__dialogForgeGeographicParticipant.snapshotCount =
                            snapshotCount;
                    }
                }

                await sendOutbound(participant.receive(
                    event.frame,
                    event.remoteEndpointId
                ));
            });
        });
        await transport.join(sessionTicket);
        console.warn("geographic-browser: transport-joined");
        participant = participantModule.createLiveScriptParticipantSession({
            endpointId: transport.endpointId,
            ticket: sessionTicket
        });
        await sendOutbound([participant.join()]);
        console.warn("geographic-browser: join-frame-sent");

        const deadline = Date.now() + 90000;

        while (Date.now() < deadline) {
            if (participant.state().status === "active") {
                window.__dialogForgeGeographicParticipant = {
                    participant,
                    snapshotCount,
                    ticket: sessionTicket,
                    transport
                };
                return participant.state();
            }

            await new Promise((resolve) => setTimeout(resolve, 10));
        }

        throw new Error("The geographic browser participant did not activate.");
    }, ticket);

    report({
        type: "state",
        revision: initial.revision,
        content: initial.content,
        elapsedMs: performance.now() - initialStarted
    });

    const input = readline.createInterface({ input: process.stdin });

    for await (const line of input) {
        const command = JSON.parse(line);

        if (command.type === "state") {
            const started = performance.now();
            const state = await page.evaluate(async (revision) => {
                const live = window.__dialogForgeGeographicParticipant;
                const deadline = Date.now() + 90000;

                while (Date.now() < deadline) {
                    if (live.participant.state().revision === revision) {
                        return live.participant.state();
                    }

                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                throw new Error(`Revision ${revision} did not arrive.`);
            }, command.revision);

            report({
                type: "state",
                revision: state.revision,
                content: state.content,
                elapsedMs: performance.now() - started
            });
            continue;
        }

        if (command.type === "reconnect") {
            const result = await page.evaluate(async () => {
                const live = window.__dialogForgeGeographicParticipant;
                const previousSnapshots = live.snapshotCount;
                const previousRevision = live.participant.state().revision;
                const started = performance.now();

                await live.transport.closeSession(live.ticket.sessionId);
                await live.transport.join(live.ticket);
                const outbound = live.participant.reconnect(
                    live.transport.endpointId
                );
                await live.transport.send(
                    outbound.frame,
                    outbound.recipientEndpointId
                );

                const deadline = Date.now() + 90000;

                while (Date.now() < deadline) {
                    if (live.participant.state().status === "active"
                        && live.snapshotCount === previousSnapshots + 1) {
                        return {
                            elapsedMs: performance.now() - started,
                            revision: live.participant.state().revision,
                            snapshots: live.snapshotCount - previousSnapshots,
                            previousRevision
                        };
                    }

                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                throw new Error("The geographic browser participant did not reconnect.");
            });

            report({ type: "reconnected", ...result });
            continue;
        }

        if (command.type === "ended") {
            const state = await page.evaluate(async () => {
                const live = window.__dialogForgeGeographicParticipant;
                const deadline = Date.now() + 90000;

                while (Date.now() < deadline) {
                    if (live.participant.state().status === "ended") {
                        return live.participant.state();
                    }

                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                throw new Error("The geographic browser session did not end.");
            });

            report({ type: "ended", revision: state.revision });
            continue;
        }

        if (command.type === "shutdown") {
            await page.evaluate(async () => {
                await window.__dialogForgeGeographicParticipant.transport.shutdown();
            });
            await browser.close();
            report({ type: "shutdown" });
            return;
        }
    }
};


run().catch((error) => {
    report({ type: "failure", message: error.stack || error.message });
    process.exitCode = 1;
});
