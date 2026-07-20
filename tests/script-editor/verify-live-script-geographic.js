"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const path = require("node:path");


const electronPath = require("electron");
const localPeerPath = path.join(__dirname, "native-iroh-peer.js");
const packagedParticipantPath = path.join(
    __dirname,
    "packaged-native-live-participant.js"
);
const remoteHost = String(
    process.env.DIALOGFORGE_LIVE_SCRIPT_REMOTE_HOST || "adrian@49.13.88.42"
);
const configuredRemoteApplicationRoot = String(
    process.env.DIALOGFORGE_LIVE_SCRIPT_REMOTE_APP_ROOT || ""
);
const remoteAppImage = String(
    process.env.DIALOGFORGE_LIVE_SCRIPT_REMOTE_APPIMAGE
        || "/home/adrian/DialogR_intel.AppImage"
);


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
                    reject(new Error(
                        `Timed out waiting for Hetzner participant.\n${stderr}`
                    ));
                }, Math.max(1, deadline - Date.now()));

                waiters.push(() => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        }

        throw new Error(`Timed out waiting for Hetzner participant.\n${stderr}`);
    };

    return { child, waitFor };
};


const stopChild = async function(process) {
    if (!process || process.child.exitCode !== null) {
        return;
    }

    process.child.kill("SIGTERM");
    await new Promise((resolve) => {
        process.child.once("exit", resolve);
        setTimeout(resolve, 2000);
    });
};


const prepareRemoteApplication = function() {
    if (configuredRemoteApplicationRoot) {
        return {
            applicationRoot: configuredRemoteApplicationRoot,
            cleanupRoot: ""
        };
    }

    const extraction = childProcess.spawnSync("ssh", [
        remoteHost,
        "set -e; "
            + "dialogforge_test_root=$(mktemp -d "
            + "/home/adrian/dialogr-live-geo-XXXXXX); "
            + "cd \"$dialogforge_test_root\"; "
            + `${remoteAppImage} --appimage-extract >/dev/null; `
            + "printf '%s\\n' \"$dialogforge_test_root\""
    ], { encoding: "utf8" });

    if (extraction.status !== 0) {
        throw new Error(
            extraction.stderr || "Could not extract the remote AppImage."
        );
    }

    const cleanupRoot = extraction.stdout.trim();

    if (!/^\/home\/adrian\/dialogr-live-geo-[A-Za-z0-9]+$/.test(cleanupRoot)) {
        throw new Error("Remote AppImage extraction returned an unsafe path.");
    }

    return {
        applicationRoot: `${cleanupRoot}/squashfs-root`,
        cleanupRoot
    };
};


const cleanupRemoteApplication = function(cleanupRoot) {
    if (!cleanupRoot
        || !/^\/home\/adrian\/dialogr-live-geo-[A-Za-z0-9]+$/.test(cleanupRoot)) {
        return;
    }

    childProcess.spawnSync(
        "ssh",
        [remoteHost, "rm", "-rf", "--", cleanupRoot],
        { encoding: "utf8" }
    );
};


const run = async function() {
    let hostProcess = null;
    let remoteProcess = null;
    let remoteCleanupRoot = "";

    try {
        const remoteApplication = prepareRemoteApplication();
        const remoteApplicationRoot = remoteApplication.applicationRoot;
        remoteCleanupRoot = remoteApplication.cleanupRoot;
        const remoteScriptPath = path.posix.join(
            path.posix.dirname(remoteApplicationRoot),
            "packaged-native-live-participant.js"
        );
        const copy = childProcess.spawnSync(
            "scp",
            [packagedParticipantPath, `${remoteHost}:${remoteScriptPath}`],
            { encoding: "utf8" }
        );

        if (copy.status !== 0) {
            throw new Error(copy.stderr || "Could not copy geographic diagnostic.");
        }

        hostProcess = createMessageProcess(childProcess.spawn(
            electronPath,
            [localPeerPath],
            {
                env: {
                    ...process.env,
                    ELECTRON_RUN_AS_NODE: "1",
                    DIALOGFORGE_NATIVE_IROH_ROLE: "host",
                    DIALOGFORGE_NATIVE_IROH_USER_DATA: "/tmp/dialogforge-geo-host"
                },
                stdio: ["ignore", "pipe", "pipe", "ipc"]
            }
        ), "local presenter");
        const ready = await hostProcess.waitFor((message) => {
            return message?.type === "ready";
        });
        const ticketBase64 = Buffer.from(JSON.stringify(ready.ticket))
            .toString("base64");
        const initialStarted = performance.now();
        const remoteChild = childProcess.spawn("ssh", [
            remoteHost,
            `DIALOGFORGE_PACKAGED_APP_ROOT=${remoteApplicationRoot}`,
            `DIALOGFORGE_LIVE_SCRIPT_TICKET_BASE64=${ticketBase64}`,
            "ELECTRON_RUN_AS_NODE=1",
            `${remoteApplicationRoot}/dialogr`,
            remoteScriptPath
        ], {
            stdio: ["pipe", "pipe", "pipe"]
        });
        remoteProcess = createRemoteProcess(remoteChild);
        const initial = await remoteProcess.waitFor((message) => {
            return message?.type === "state" && message.revision === 0;
        });
        const initialSyncMs = performance.now() - initialStarted;
        assert.equal(initial.content, "x <- 1\n");

        const firstEditStarted = performance.now();
        hostProcess.child.send({ type: "edit", text: "# geographic edit\n" });
        const firstEdit = await remoteProcess.waitFor((message) => {
            return message?.type === "state" && message.revision === 1;
        });
        const firstEditMs = performance.now() - firstEditStarted;
        assert.match(firstEdit.content, /geographic edit/);

        const reconnectStarted = performance.now();
        remoteProcess.child.stdin.write(`${JSON.stringify({
            type: "reconnect"
        })}\n`);
        const reconnected = await remoteProcess.waitFor((message) => {
            return message?.type === "reconnected";
        });
        const reconnectMs = performance.now() - reconnectStarted;
        assert.equal(reconnected.revision, 1);
        assert.equal(reconnected.snapshotCount, 2);

        const recoveryStarted = performance.now();
        hostProcess.child.send({ type: "edit", text: "# recovered edit\n" });
        await remoteProcess.waitFor((message) => {
            return message?.type === "state" && message.revision === 2;
        });
        const recoveryEditMs = performance.now() - recoveryStarted;

        hostProcess.child.send({ type: "end" });
        await remoteProcess.waitFor((message) => message?.type === "ended");
        remoteProcess.child.stdin.write(`${JSON.stringify({
            type: "shutdown"
        })}\n`);
        await remoteProcess.waitFor((message) => message?.type === "shutdown");
        const address = JSON.parse(ready.ticket.transportAddress);
        process.stdout.write(`${JSON.stringify({
            route: "Bucharest presenter to Hetzner installed participant",
            relayUrl: address.relayUrl || null,
            directAddresses: address.addresses || [],
            initialSyncMs,
            firstEditMs,
            reconnectMs,
            reconnectSnapshots: reconnected.snapshotCount - 1,
            recoveryEditMs
        }, null, 2)}\n`);
    }
    finally {
        await stopChild(remoteProcess);
        await stopChild(hostProcess);
        cleanupRemoteApplication(remoteCleanupRoot);
    }
};


run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
