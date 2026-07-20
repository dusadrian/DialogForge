"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");


const targets = JSON.parse(fs.readFileSync(
    path.join(__dirname, "live-script-classroom-targets.json"),
    "utf8"
));
const scenarioName = String(
    process.env.DIALOGFORGE_LIVE_SCRIPT_CLASSROOM_SCENARIO || "required"
).trim();
const scenario = targets[scenarioName];
const webUrl = String(
    process.env.DIALOGFORGE_LIVE_SCRIPT_WEB_URL || "http://127.0.0.1:5173/"
).trim();
const electronPath = require("electron");
const peerPath = path.join(__dirname, "mixed-classroom-native-peer.js");

if (!scenario || (scenarioName !== "required" && scenarioName !== "stretch")) {
    throw new Error(`Unknown live-script classroom scenario: ${scenarioName}`);
}


const nativeParticipantCount = Math.floor(scenario.participants / 2);
const browserParticipantCount = scenario.participants - nativeParticipantCount;
const initialLine = "value <- value + 1 # mixed classroom analysis\n";
const actualInitialBytes = Buffer.byteLength(initialLine) * Math.ceil(
    targets.initialScriptBytes / Buffer.byteLength(initialLine)
);


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


const createPeer = function(role, environment = {}) {
    const child = childProcess.spawn(electronPath, [peerPath], {
        env: {
            ...process.env,
            ...environment,
            ELECTRON_RUN_AS_NODE: "1",
            DIALOGFORGE_MIXED_CLASSROOM_ROLE: role,
            DIALOGFORGE_MIXED_CLASSROOM_INITIAL_BYTES:
                String(targets.initialScriptBytes)
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"]
    });
    const messages = [];
    const waiters = [];
    let stderr = "";

    child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
    });
    child.on("message", (message) => {
        messages.push(message);

        for (const wake of waiters.splice(0)) {
            wake();
        }
    });

    const waitFor = async function(predicate, timeoutMs = 120000) {
        const started = Date.now();

        while (Date.now() - started < timeoutMs) {
            const failure = messages.find((message) => {
                return message?.type === "failure";
            });

            if (failure) {
                throw new Error(`${failure.message}\n${stderr}`);
            }

            const match = messages.find(predicate);

            if (match) {
                return match;
            }

            await new Promise((resolve, reject) => {
                const remaining = Math.max(
                    1,
                    timeoutMs - (Date.now() - started)
                );
                const timer = setTimeout(() => {
                    reject(new Error(
                        `Timed out waiting for ${role} peer.\n${stderr}`
                    ));
                }, remaining);

                waiters.push(() => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        }

        throw new Error(`Timed out waiting for ${role} peer.\n${stderr}`);
    };

    return {
        child,
        waitFor
    };
};


const stopPeer = async function(peer) {
    if (!peer || peer.child.exitCode !== null) {
        return;
    }

    peer.child.send({ type: "shutdown" });

    try {
        await peer.waitFor((message) => message?.type === "shutdown", 10000);
    }
    catch {}

    if (peer.child.exitCode === null) {
        peer.child.kill("SIGTERM");
    }
};


const installBrowserParticipants = async function(page, ticket, count) {
    return page.evaluate(async ({ sessionTicket, participantCount }) => {
        const transportModule = await import(
            "/vendor/dialogforge-iroh/0.1.0/index.mjs"
        );
        const participantModule = await import(
            "/browser-esm/src/script-editor/collaboration/"
            + "liveScriptParticipantSession.js"
        );
        const participants = [];
        const errors = [];

        const sendOutboundFrames = async function(transport, frames) {
            for (const outbound of frames) {
                await transport.send(
                    outbound.frame,
                    outbound.recipientEndpointId
                );
            }
        };

        const waitUntilActive = async function(session, index) {
            const deadline = Date.now() + 60000;

            while (Date.now() < deadline) {
                if (session.state().status === "active") {
                    return;
                }

                await new Promise((resolve) => setTimeout(resolve, 10));
            }

            throw new Error(
                `Browser participant ${index} did not receive its initial snapshot.`
            );
        };

        for (let index = 0; index < participantCount; index += 1) {
            const transport = await transportModule.createLiveScriptTransport();
            let session = null;
            let receiveQueue = Promise.resolve();
            const started = performance.now();

            transport.onFrame((event) => {
                receiveQueue = receiveQueue.then(async () => {
                    if (!session) {
                        return;
                    }

                    if (event.frame.type === "snapshot") {
                        const entry = participants.find((candidate) => {
                            return candidate.transport === transport;
                        });

                        if (entry) {
                            entry.snapshotCount += 1;
                        }
                    }

                    await sendOutboundFrames(
                        transport,
                        session.receive(event.frame, event.remoteEndpointId)
                    );
                }).catch((error) => {
                    errors.push(String(error?.message || error));
                });
            });
            await transport.join(sessionTicket);
            session = participantModule.createLiveScriptParticipantSession({
                endpointId: transport.endpointId,
                ticket: sessionTicket
            });
            await sendOutboundFrames(transport, [session.join()]);
            await waitUntilActive(session, index);
            participants.push({
                transport,
                session,
                initialSyncMs: performance.now() - started,
                snapshotCount: 1
            });
        }

        window.__dialogForgeMixedClassroom = {
            participants,
            errors,
            ticket: sessionTicket
        };

        return participants.map((entry) => entry.initialSyncMs);
    }, {
        sessionTicket: ticket,
        participantCount: count
    });
};


const shutdownBrowserParticipants = function(page) {
    return page.evaluate(async () => {
        const classroom = window.__dialogForgeMixedClassroom;

        if (!classroom) {
            return;
        }

        await Promise.all(classroom.participants.map((entry) => {
            return entry.transport.shutdown();
        }));
    }).catch(() => {});
};


const reconnectBrowserParticipants = function(page) {
    return page.evaluate(async () => {
        const classroom = window.__dialogForgeMixedClassroom;

        return Promise.all(classroom.participants.map(async (entry, index) => {
            const snapshotCount = entry.snapshotCount;
            const revision = entry.session.state().revision;
            const started = performance.now();

            await new Promise((resolve) => {
                setTimeout(resolve, Math.floor(Math.random() * 250));
            });
            await entry.transport.closeSession(classroom.ticket.sessionId);
            await entry.transport.join(classroom.ticket);
            const outbound = entry.session.reconnect(entry.transport.endpointId);
            await entry.transport.send(
                outbound.frame,
                outbound.recipientEndpointId
            );

            const deadline = Date.now() + 90000;

            while (Date.now() < deadline) {
                if (entry.session.state().status === "active"
                    && entry.snapshotCount === snapshotCount + 1) {
                    break;
                }

                await new Promise((resolve) => setTimeout(resolve, 10));
            }

            if (entry.session.state().status !== "active") {
                throw new Error(`Browser participant ${index} did not reconnect.`);
            }

            if (entry.session.state().revision !== revision) {
                throw new Error(
                    `Browser participant ${index} changed revision during reconnect.`
                );
            }

            return {
                reconnectMs: performance.now() - started,
                snapshots: entry.snapshotCount - snapshotCount,
                revision: entry.session.state().revision
            };
        }));
    });
};


const run = async function() {
    const sessionId = crypto.randomBytes(18).toString("base64url");
    const capability = crypto.randomBytes(32).toString("base64url");
    const hostPeer = createPeer("host", {
        DIALOGFORGE_MIXED_CLASSROOM_SESSION_ID: sessionId,
        DIALOGFORGE_MIXED_CLASSROOM_CAPABILITY: capability,
        DIALOGFORGE_MIXED_CLASSROOM_EXPECTED_PARTICIPANTS:
            String(scenario.participants)
    });
    let participantPeer = null;
    let browser = null;
    let browserPage = null;

    try {
        const hostReady = await hostPeer.waitFor((message) => {
            return message?.type === "ready";
        });
        participantPeer = createPeer("participants", {
            DIALOGFORGE_MIXED_CLASSROOM_PARTICIPANTS:
                String(nativeParticipantCount),
            DIALOGFORGE_MIXED_CLASSROOM_TICKET:
                JSON.stringify(hostReady.ticket)
        });
        const nativeReady = await participantPeer.waitFor((message) => {
            return message?.type === "ready";
        });

        browser = await chromium.launch({ headless: true });
        browserPage = await browser.newPage();
        const browserErrors = [];
        browserPage.on("pageerror", (error) => {
            browserErrors.push(error.message);
        });
        await browserPage.goto(webUrl, { waitUntil: "domcontentloaded" });
        const browserInitialSyncMs = await installBrowserParticipants(
            browserPage,
            hostReady.ticket,
            browserParticipantCount
        );

        hostPeer.child.send({ type: "wait-participants" });
        await hostPeer.waitFor((message) => {
            return message?.type === "participants-ready"
                && message.count === scenario.participants;
        });

        const editLatenciesMs = [];

        for (let revision = 1; revision <= targets.editCount; revision += 1) {
            const started = process.hrtime.bigint();
            hostPeer.child.send({
                type: "edit",
                text: `# mixed edit ${revision - 1}\n`
            });
            await hostPeer.waitFor((message) => {
                return message?.type === "revision-complete"
                    && message.revision === revision;
            });
            editLatenciesMs.push(
                Number(process.hrtime.bigint() - started) / 1_000_000
            );
        }

        participantPeer.child.send({ type: "reconnect" });
        const browserReconnectPromise = reconnectBrowserParticipants(browserPage);
        const nativeReconnect = await participantPeer.waitFor((message) => {
            return message?.type === "reconnected";
        });
        const browserReconnect = await browserReconnectPromise;
        const reconnectResults = [
            ...nativeReconnect.results,
            ...browserReconnect
        ];
        const recoveryRevision = targets.editCount + 1;
        const recoveryStarted = process.hrtime.bigint();
        hostPeer.child.send({
            type: "edit",
            text: "# post-reconnect confirmation\n"
        });
        await hostPeer.waitFor((message) => {
            return message?.type === "revision-complete"
                && message.revision === recoveryRevision;
        });
        const recoveryEditMs = Number(
            process.hrtime.bigint() - recoveryStarted
        ) / 1_000_000;

        hostPeer.child.send({ type: "metrics" });
        participantPeer.child.send({ type: "metrics" });
        const hostMetrics = await hostPeer.waitFor((message) => {
            return message?.type === "metrics" && message.role === "host";
        });
        const participantMetrics = await participantPeer.waitFor((message) => {
            return message?.type === "metrics"
                && message.role === "participants";
        });
        const browserState = await browserPage.evaluate(() => {
            const classroom = window.__dialogForgeMixedClassroom;

            return {
                revisions: classroom.participants.map((entry) => {
                    return entry.session.state().revision;
                }),
                errors: classroom.errors,
                memory: performance.memory
                    ? {
                        usedJSHeapSize: performance.memory.usedJSHeapSize,
                        totalJSHeapSize: performance.memory.totalJSHeapSize
                    }
                    : null
            };
        });
        const initialSyncValues = [
            ...nativeReady.initialSyncMs,
            ...browserInitialSyncMs
        ];
        const result = {
            scenario: scenarioName,
            participants: scenario.participants,
            nativeParticipants: nativeParticipantCount,
            browserParticipants: browserParticipantCount,
            initialBytes: actualInitialBytes,
            edits: targets.editCount,
            initialSyncMs: {
                p50: percentile(initialSyncValues, 0.50),
                p95: percentile(initialSyncValues, 0.95),
                maximum: Math.max(...initialSyncValues)
            },
            editLatencyMs: {
                p50: percentile(editLatenciesMs, 0.50),
                p95: percentile(editLatenciesMs, 0.95),
                p99: percentile(editLatenciesMs, 0.99),
                maximum: Math.max(...editLatenciesMs)
            },
            reconnectMs: {
                p50: percentile(
                    reconnectResults.map((entry) => entry.reconnectMs),
                    0.50
                ),
                p95: percentile(
                    reconnectResults.map((entry) => entry.reconnectMs),
                    0.95
                ),
                maximum: Math.max(...reconnectResults.map((entry) => {
                    return entry.reconnectMs;
                }))
            },
            reconnectSnapshots: reconnectResults.map((entry) => {
                return entry.snapshots;
            }),
            recoveryEditMs,
            hostOutboundFrames: hostMetrics.outbound.frames,
            hostOutboundMiB: toMiB(hostMetrics.outbound.bytes),
            presenterHeapDeltaMiB: toMiB(hostMetrics.memory.heapDelta),
            presenterRssDeltaMiB: toMiB(hostMetrics.memory.rssDelta),
            installedParticipantClusterRssDeltaMiB:
                toMiB(participantMetrics.memory.rssDelta),
            browserMemory: browserState.memory,
            errors: [...browserErrors, ...browserState.errors]
        };

        assert.equal(
            participantMetrics.revisions.every((revision) => {
                return revision === recoveryRevision;
            }),
            true,
            "Installed participants did not reach the final revision."
        );
        assert.equal(
            browserState.revisions.every((revision) => {
                return revision === recoveryRevision;
            }),
            true,
            "Browser participants did not reach the final revision."
        );
        assert.equal(result.errors.length, 0, result.errors.join("\n"));
        assert.equal(
            result.reconnectSnapshots.every((count) => count === 1),
            true,
            "Reconnect did not deliver exactly one authoritative snapshot."
        );
        assert.ok(
            result.initialSyncMs.p95 <= scenario.initialSyncMs,
            `Initial sync p95 exceeded ${scenario.initialSyncMs} ms.`
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
            result.reconnectMs.p95 <= scenario.reconnectP95Ms,
            `Reconnect p95 exceeded ${scenario.reconnectP95Ms} ms.`
        );
        assert.ok(
            result.reconnectMs.maximum <= scenario.reconnectMaximumMs,
            `Reconnect maximum exceeded ${scenario.reconnectMaximumMs} ms.`
        );
        assert.ok(
            result.presenterRssDeltaMiB <= scenario.presenterIncrementalRssMiB,
            `Presenter RSS exceeded ${scenario.presenterIncrementalRssMiB} MiB.`
        );

        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
    finally {
        if (browserPage) {
            await shutdownBrowserParticipants(browserPage);
        }

        if (browser) {
            await browser.close();
        }

        await stopPeer(participantPeer);
        await stopPeer(hostPeer);
    }
};


run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
