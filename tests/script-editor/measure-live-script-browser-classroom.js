"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const {
    parseLiveScriptJoinText
} = require("../../dist/src/script-editor/collaboration");


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
const initialLine = "value <- value + 1 # browser presenter analysis\n";
const initialContent = initialLine.repeat(Math.ceil(
    targets.initialScriptBytes / Buffer.byteLength(initialLine)
));


const percentile = function(values, fraction) {
    const ordered = values.slice().sort((left, right) => left - right);
    return ordered[Math.min(
        ordered.length - 1,
        Math.floor(ordered.length * fraction)
    )];
};


const createParticipantPeer = function(ticket) {
    const child = childProcess.spawn(electronPath, [peerPath], {
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1",
            DIALOGFORGE_MIXED_CLASSROOM_ROLE: "participants",
            DIALOGFORGE_MIXED_CLASSROOM_PARTICIPANTS:
                String(nativeParticipantCount),
            DIALOGFORGE_MIXED_CLASSROOM_TICKET: JSON.stringify(ticket)
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
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
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
                const timer = setTimeout(() => {
                    reject(new Error(
                        `Timed out waiting for installed cluster.\n${stderr}`
                    ));
                }, Math.max(1, deadline - Date.now()));

                waiters.push(() => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        }

        throw new Error(`Timed out waiting for installed cluster.\n${stderr}`);
    };

    return { child, waitFor };
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


const openScriptEditor = async function(page) {
    await page.locator("#webMenuBar").waitFor({ timeout: 30000 });
    await page.evaluate(() => {
        const normalize = function(value) {
            return String(value || "").replace(/>$/, "").trim();
        };
        const item = Array.from(
            document.querySelectorAll("#webMenuBar .web-menu-item")
        ).find((entry) => normalize(entry.textContent) === "Script editor");

        if (!item) {
            throw new Error("Script editor menu item not found.");
        }

        item.click();
    });
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

        const sendOutbound = async function(transport, frames) {
            for (const outbound of frames) {
                await transport.send(
                    outbound.frame,
                    outbound.recipientEndpointId
                );
            }
        };

        for (let index = 0; index < participantCount; index += 1) {
            const transport = await transportModule.createLiveScriptTransport();
            let session = null;
            let receiveQueue = Promise.resolve();
            const started = performance.now();
            const entry = {
                transport,
                session: null,
                initialSyncMs: 0,
                snapshotCount: 0
            };

            transport.onFrame((event) => {
                receiveQueue = receiveQueue.then(async () => {
                    if (!session) {
                        return;
                    }

                    if (event.frame.type === "snapshot") {
                        entry.snapshotCount += 1;
                    }

                    await sendOutbound(
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
            entry.session = session;
            await sendOutbound(transport, [session.join()]);

            const deadline = Date.now() + 60000;

            while (Date.now() < deadline && session.state().status !== "active") {
                await new Promise((resolve) => setTimeout(resolve, 10));
            }

            if (session.state().status !== "active") {
                throw new Error(`Browser participant ${index} did not join.`);
            }

            entry.initialSyncMs = performance.now() - started;
            participants.push(entry);
        }

        window.__dialogForgeBrowserPresenterClassroom = {
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


const waitBrowserRevision = function(page, revision) {
    return page.evaluate(async (expectedRevision) => {
        const classroom = window.__dialogForgeBrowserPresenterClassroom;
        const deadline = Date.now() + 60000;

        while (Date.now() < deadline) {
            if (classroom.participants.every((entry) => {
                return entry.session.state().revision >= expectedRevision;
            })) {
                return;
            }

            await new Promise((resolve) => setTimeout(resolve, 5));
        }

        throw new Error(
            `Browser participants did not reach revision ${expectedRevision}.`
        );
    }, revision);
};


const reconnectBrowserParticipants = function(page) {
    return page.evaluate(async () => {
        const classroom = window.__dialogForgeBrowserPresenterClassroom;

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

            return {
                reconnectMs: performance.now() - started,
                snapshots: entry.snapshotCount - snapshotCount,
                revision: entry.session.state().revision,
                expectedRevision: revision
            };
        }));
    });
};


const shutdownBrowserParticipants = function(page) {
    return page.evaluate(async () => {
        const classroom = window.__dialogForgeBrowserPresenterClassroom;

        if (classroom) {
            await Promise.all(classroom.participants.map((entry) => {
                return entry.transport.shutdown();
            }));
        }
    }).catch(() => {});
};


const appendPresenterEdit = function(frame, text) {
    return frame.evaluate((nextText) => {
        const editor = window.monaco?.editor?.getEditors?.()[0];
        const model = editor?.getModel();

        if (!editor || !model) {
            throw new Error("Script Editor Monaco instance is unavailable.");
        }

        const lineNumber = model.getLineCount();
        const column = model.getLineMaxColumn(lineNumber);
        editor.executeEdits("live-classroom", [{
            range: {
                startLineNumber: lineNumber,
                startColumn: column,
                endLineNumber: lineNumber,
                endColumn: column
            },
            text: nextText
        }]);
    }, text);
};


const run = async function() {
    let browser = null;
    let participantPeer = null;
    let participantPage = null;

    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            permissions: ["clipboard-read", "clipboard-write"],
            viewport: { width: 1440, height: 1000 }
        });
        const presenterPage = await context.newPage();
        participantPage = await context.newPage();
        const browserErrors = [];

        for (const page of [presenterPage, participantPage]) {
            page.on("pageerror", (error) => browserErrors.push(error.message));
            await page.goto(webUrl, { waitUntil: "domcontentloaded" });
        }

        await openScriptEditor(presenterPage);
        const presenterFrameLocator = presenterPage.frameLocator(
            ".dialogforge-web-script-editor-frame"
        );
        await presenterFrameLocator.locator(".monaco-editor").waitFor({
            state: "visible",
            timeout: 30000
        });
        const presenterFrame = presenterPage.frames().find((candidate) => {
            return candidate.url().includes("/src/base-app/pages/scriptEditor.html");
        });
        assert.ok(presenterFrame, "Shared Script Editor iframe must be attached.");
        await presenterFrame.evaluate((content) => {
            window.monaco.editor.getEditors()[0].setValue(content);
        }, initialContent);

        const shareButton = presenterFrameLocator.locator(
            ".dm-script-btn-share-live"
        );
        await shareButton.click();
        await presenterFrameLocator.locator(".dm-live-panel__qr").waitFor({
            state: "visible",
            timeout: 60000
        });
        await presenterFrameLocator.locator(".dm-live-panel__action", {
            hasText: "Copy link"
        }).click();
        const link = await presenterFrameLocator.locator("body").evaluate(() => {
            return navigator.clipboard.readText();
        });
        const parsed = parseLiveScriptJoinText(link);
        assert.equal(parsed.ok, true, parsed.message);

        participantPeer = createParticipantPeer(parsed.ticket);
        const nativeReadyPromise = participantPeer.waitFor((message) => {
            return message?.type === "ready";
        });
        const browserInitialSyncMs = await installBrowserParticipants(
            participantPage,
            parsed.ticket,
            browserParticipantCount
        );
        const nativeReady = await nativeReadyPromise;
        await presenterFrame.waitForFunction((participantCount) => {
            const rows = Array.from(document.querySelectorAll(
                ".dm-live-panel__row"
            ));
            return rows.some((row) => {
                return row.querySelector(".dm-live-panel__label")?.textContent
                    === "Participants"
                    && Number(row.querySelector(
                        ".dm-live-panel__value"
                    )?.textContent) === participantCount;
            });
        }, scenario.participants);
        await presenterFrameLocator.locator(".dm-live-panel__action", {
            hasText: "Close"
        }).click();

        const editLatenciesMs = [];

        for (let revision = 1; revision <= targets.editCount; revision += 1) {
            const started = performance.now();
            await appendPresenterEdit(
                presenterFrame,
                `# browser presenter edit ${revision}\n`
            );
            participantPeer.child.send({ type: "wait-revision", revision });
            await Promise.all([
                participantPeer.waitFor((message) => {
                    return message?.type === "revision-complete"
                        && message.revision === revision;
                }),
                waitBrowserRevision(participantPage, revision)
            ]);
            editLatenciesMs.push(performance.now() - started);
        }

        participantPeer.child.send({ type: "reconnect" });
        const browserReconnectPromise = reconnectBrowserParticipants(
            participantPage
        );
        const nativeReconnect = await participantPeer.waitFor((message) => {
            return message?.type === "reconnected";
        });
        const browserReconnect = await browserReconnectPromise;
        const reconnectResults = [
            ...nativeReconnect.results,
            ...browserReconnect
        ];
        const recoveryRevision = targets.editCount + 1;
        const recoveryStarted = performance.now();
        await appendPresenterEdit(
            presenterFrame,
            "# browser presenter recovery\n"
        );
        participantPeer.child.send({
            type: "wait-revision",
            revision: recoveryRevision
        });
        await Promise.all([
            participantPeer.waitFor((message) => {
                return message?.type === "revision-complete"
                    && message.revision === recoveryRevision;
            }),
            waitBrowserRevision(participantPage, recoveryRevision)
        ]);
        const recoveryEditMs = performance.now() - recoveryStarted;
        const initialSyncValues = [
            ...nativeReady.initialSyncMs,
            ...browserInitialSyncMs
        ];
        const browserState = await participantPage.evaluate(() => {
            const classroom = window.__dialogForgeBrowserPresenterClassroom;
            return {
                errors: classroom.errors,
                revisions: classroom.participants.map((entry) => {
                    return entry.session.state().revision;
                })
            };
        });
        const presenterMemory = await presenterPage.evaluate(() => {
            return performance.memory
                ? {
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize
                }
                : null;
        });
        const result = {
            scenario: scenarioName,
            participants: scenario.participants,
            nativeParticipants: nativeParticipantCount,
            browserParticipants: browserParticipantCount,
            initialBytes: Buffer.byteLength(initialContent),
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
                p50: percentile(reconnectResults.map((entry) => {
                    return entry.reconnectMs;
                }), 0.50),
                p95: percentile(reconnectResults.map((entry) => {
                    return entry.reconnectMs;
                }), 0.95),
                maximum: Math.max(...reconnectResults.map((entry) => {
                    return entry.reconnectMs;
                }))
            },
            reconnectSnapshots: reconnectResults.map((entry) => {
                return entry.snapshots;
            }),
            recoveryEditMs,
            presenterMemory,
            errors: [...browserErrors, ...browserState.errors]
        };

        assert.equal(result.errors.length, 0, result.errors.join("\n"));
        assert.equal(
            browserState.revisions.every((revision) => {
                return revision === recoveryRevision;
            }),
            true
        );
        assert.equal(
            result.reconnectSnapshots.every((count) => count === 1),
            true,
            "Reconnect did not deliver exactly one authoritative snapshot."
        );
        assert.ok(result.initialSyncMs.p95 <= scenario.initialSyncMs);
        assert.ok(result.editLatencyMs.p95 <= scenario.editP95Ms);
        assert.ok(result.editLatencyMs.maximum <= scenario.editMaximumMs);
        assert.ok(result.reconnectMs.p95 <= scenario.reconnectP95Ms);
        assert.ok(result.reconnectMs.maximum <= scenario.reconnectMaximumMs);
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

        await shareButton.click();
        await presenterFrameLocator.locator(".dm-live-panel__action", {
            hasText: "Stop sharing"
        }).click();
    }
    finally {
        if (participantPage) {
            await shutdownBrowserParticipants(participantPage);
        }

        await stopPeer(participantPeer);

        if (browser) {
            await browser.close();
        }
    }
};


run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
