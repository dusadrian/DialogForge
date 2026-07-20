"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const path = require("node:path");


const electronPath = require("electron");
const presenterPath = path.join(__dirname, "mixed-classroom-native-peer.js");
const participantPath = path.join(
    __dirname,
    "geographic-browser-live-participant.js"
);
const remoteHost = String(
    process.env.DIALOGFORGE_LIVE_SCRIPT_REMOTE_HOST || "adrian@49.13.88.42"
);
const remoteRepository = String(
    process.env.DIALOGFORGE_LIVE_SCRIPT_REMOTE_REPOSITORY
        || "/home/adrian/DialogForge-phase5-test"
);
const localWebPort = String(
    process.env.DIALOGFORGE_LIVE_SCRIPT_LOCAL_WEB_PORT || "5173"
);
const remoteWebPort = String(
    process.env.DIALOGFORGE_LIVE_SCRIPT_REMOTE_WEB_PORT || "15173"
);
const webUrl = String(
    process.env.DIALOGFORGE_LIVE_SCRIPT_REMOTE_WEB_URL
        || `http://127.0.0.1:${remoteWebPort}/`
);
const sessionId = "session_browser_geo_1234567890abcdef";
const capability = "capability_browser_geo_1234567890abcdefghijklmnop";


const createMessageProcess = function(child, label) {
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

    const waitFor = async function(predicate, timeoutMs = 90000) {
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
                    reject(new Error(`Timed out waiting for ${label}.\n${stderr}`));
                }, Math.max(1, deadline - Date.now()));

                waiters.push(() => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        }

        throw new Error(`Timed out waiting for ${label}.\n${stderr}`);
    };

    return { child, waitFor };
};


const createRemoteProcess = function(child) {
    const messages = [];
    const waiters = [];
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        const lines = stdout.split("\n");
        stdout = lines.pop() || "";

        for (const line of lines) {
            if (line.trim()) {
                messages.push(JSON.parse(line));
            }
        }

        for (const wake of waiters.splice(0)) {
            wake();
        }
    });
    child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
    });
    child.on("exit", () => {
        for (const wake of waiters.splice(0)) {
            wake();
        }
    });

    const waitFor = async function(predicate, timeoutMs = 90000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const failure = messages.find((message) => {
                return message?.type === "failure";
            });

            if (failure) {
                throw new Error(`${failure.message}\n${stderr}`);
            }

            if (child.exitCode !== null) {
                throw new Error(
                    `Hetzner browser participant exited with code `
                    + `${child.exitCode}.\n${stderr}`
                );
            }

            const match = messages.find(predicate);

            if (match) {
                return match;
            }

            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error(
                        `Timed out waiting for Hetzner browser participant.\n${stderr}`
                        + `Remote messages: ${JSON.stringify(messages)}\n`
                    ));
                }, Math.max(1, deadline - Date.now()));

                waiters.push(() => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        }

        throw new Error(`Timed out waiting for Hetzner browser participant.\n${stderr}`);
    };

    return { child, waitFor };
};


const stopProcess = async function(process) {
    if (!process || process.child.exitCode !== null) {
        return;
    }

    process.child.kill("SIGTERM");
    await new Promise((resolve) => {
        process.child.once("exit", resolve);
        setTimeout(resolve, 2000);
    });
};


const waitForRemoteWeb = async function(tunnel) {
    const deadline = Date.now() + 15000;

    while (Date.now() < deadline) {
        if (tunnel.child.exitCode !== null) {
            throw new Error("The geographic browser SSH tunnel exited early.");
        }

        const request = childProcess.spawnSync("ssh", [
            remoteHost,
            "curl",
            "-fsS",
            "-o",
            "/dev/null",
            `${webUrl}vendor/dialogforge-iroh/0.1.0/index.mjs`
        ], { encoding: "utf8" });

        if (request.status === 0) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error("The current web build is not reachable from Hetzner.");
};


const prepareRemoteParticipant = function() {
    const result = childProcess.spawnSync("ssh", [
        remoteHost,
        "mktemp -d /home/adrian/dialogforge-browser-geo-XXXXXX"
    ], { encoding: "utf8" });

    if (result.status !== 0) {
        throw new Error(result.stderr || "Could not prepare the remote test.");
    }

    const remoteRoot = result.stdout.trim();

    if (!/^\/home\/adrian\/dialogforge-browser-geo-[A-Za-z0-9]+$/.test(
        remoteRoot
    )) {
        throw new Error("Remote browser test returned an unsafe path.");
    }

    const remotePath = `${remoteRoot}/geographic-browser-live-participant.js`;
    const copy = childProcess.spawnSync(
        "scp",
        [participantPath, `${remoteHost}:${remotePath}`],
        { encoding: "utf8" }
    );

    if (copy.status !== 0) {
        cleanupRemoteParticipant(remoteRoot);
        throw new Error(copy.stderr || "Could not copy the browser participant.");
    }

    const install = childProcess.spawnSync("ssh", [
        remoteHost,
        "cd",
        remoteRepository,
        "&&",
        `PLAYWRIGHT_BROWSERS_PATH=${remoteRoot}/browsers`,
        "npx",
        "playwright",
        "install",
        "chromium"
    ], {
        encoding: "utf8",
        timeout: 300000
    });

    if (install.status !== 0) {
        cleanupRemoteParticipant(remoteRoot);
        throw new Error(
            install.stderr || "Could not prepare the remote Chromium browser."
        );
    }

    return { remotePath, remoteRoot };
};


const cleanupRemoteParticipant = function(remoteRoot) {
    if (!remoteRoot
        || !/^\/home\/adrian\/dialogforge-browser-geo-[A-Za-z0-9]+$/.test(
            remoteRoot
        )) {
        return;
    }

    childProcess.spawnSync(
        "ssh",
        [remoteHost, "rm", "-rf", "--", remoteRoot],
        { encoding: "utf8" }
    );
};


const run = async function() {
    let presenter = null;
    let participant = null;
    let tunnel = null;
    let remoteRoot = "";

    try {
        tunnel = {
            child: childProcess.spawn("ssh", [
                "-N",
                "-o",
                "ExitOnForwardFailure=yes",
                "-R",
                `${remoteWebPort}:127.0.0.1:${localWebPort}`,
                remoteHost
            ], { stdio: ["ignore", "ignore", "pipe"] })
        };
        await waitForRemoteWeb(tunnel);
        const remote = prepareRemoteParticipant();
        remoteRoot = remote.remoteRoot;
        presenter = createMessageProcess(childProcess.spawn(
            electronPath,
            [presenterPath],
            {
                env: {
                    ...process.env,
                    ELECTRON_RUN_AS_NODE: "1",
                    DIALOGFORGE_MIXED_CLASSROOM_ROLE: "host",
                    DIALOGFORGE_MIXED_CLASSROOM_SESSION_ID: sessionId,
                    DIALOGFORGE_MIXED_CLASSROOM_CAPABILITY: capability,
                    DIALOGFORGE_MIXED_CLASSROOM_EXPECTED_PARTICIPANTS: "1",
                    DIALOGFORGE_MIXED_CLASSROOM_INITIAL_BYTES: "128"
                },
                stdio: ["ignore", "pipe", "pipe", "ipc"]
            }
        ), "local presenter");
        const ready = await presenter.waitFor((message) => {
            return message?.type === "ready";
        });
        const ticketBase64 = Buffer.from(JSON.stringify(ready.ticket))
            .toString("base64");
        participant = createRemoteProcess(childProcess.spawn("ssh", [
            remoteHost,
            "cd",
            remoteRepository,
            "&&",
            `DIALOGFORGE_LIVE_SCRIPT_WEB_URL=${webUrl}`,
            `DIALOGFORGE_LIVE_SCRIPT_TICKET_BASE64=${ticketBase64}`,
            `NODE_PATH=${remoteRepository}/node_modules`,
            `PLAYWRIGHT_BROWSERS_PATH=${remoteRoot}/browsers`,
            "node",
            remote.remotePath
        ], { stdio: ["pipe", "pipe", "pipe"] }));
        const initial = await participant.waitFor((message) => {
            return message?.type === "state" && message.revision === 0;
        });
        assert.match(initial.content, /mixed classroom analysis/);
        presenter.child.send({ type: "wait-participants" });
        await presenter.waitFor((message) => {
            return message?.type === "participants-ready" && message.count === 1;
        });

        presenter.child.send({ type: "edit", text: "# browser geographic edit\n" });
        await presenter.waitFor((message) => {
            return message?.type === "revision-complete" && message.revision === 1;
        });
        participant.child.stdin.write(`${JSON.stringify({
            type: "state",
            revision: 1
        })}\n`);
        const firstEdit = await participant.waitFor((message) => {
            return message?.type === "state" && message.revision === 1;
        });
        assert.match(firstEdit.content, /browser geographic edit/);

        participant.child.stdin.write(`${JSON.stringify({
            type: "reconnect"
        })}\n`);
        const reconnected = await participant.waitFor((message) => {
            return message?.type === "reconnected";
        });
        assert.equal(reconnected.snapshots, 1);
        assert.equal(reconnected.revision, reconnected.previousRevision);

        presenter.child.send({ type: "edit", text: "# browser recovered edit\n" });
        await presenter.waitFor((message) => {
            return message?.type === "revision-complete" && message.revision === 2;
        });
        participant.child.stdin.write(`${JSON.stringify({
            type: "state",
            revision: 2
        })}\n`);
        const recovery = await participant.waitFor((message) => {
            return message?.type === "state" && message.revision === 2;
        });

        presenter.child.send({ type: "shutdown" });
        participant.child.stdin.write(`${JSON.stringify({
            type: "ended"
        })}\n`);
        await participant.waitFor((message) => message?.type === "ended");
        await presenter.waitFor((message) => message?.type === "shutdown");
        participant.child.stdin.write(`${JSON.stringify({
            type: "shutdown"
        })}\n`);
        await participant.waitFor((message) => message?.type === "shutdown");

        process.stdout.write(`${JSON.stringify({
            route: "Bucharest native presenter to Hetzner browser participant",
            initialSyncMs: initial.elapsedMs,
            firstEditMs: firstEdit.elapsedMs,
            reconnectMs: reconnected.elapsedMs,
            reconnectSnapshots: reconnected.snapshots,
            recoveryEditMs: recovery.elapsedMs
        }, null, 2)}\n`);
    }
    finally {
        await stopProcess(participant);
        await stopProcess(presenter);
        await stopProcess(tunnel);
        cleanupRemoteParticipant(remoteRoot);
    }
};


run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
