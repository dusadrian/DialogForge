"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const electronPath = require("electron");
const {
    createNativeIrohLiveScriptTransport
} = require("../../dist/src/shell-electron/collaboration/nativeIrohLiveScriptTransport");


const createPeer = function(role, userDataPath, ticket) {
    const child = childProcess.spawn(
        electronPath,
        [path.join(__dirname, "native-iroh-peer.js")],
        {
            env: {
                ...process.env,
                ELECTRON_RUN_AS_NODE: "1",
                DIALOGFORGE_NATIVE_IROH_ROLE: role,
                DIALOGFORGE_NATIVE_IROH_USER_DATA: userDataPath,
                ...(ticket
                    ? { DIALOGFORGE_NATIVE_IROH_TICKET: JSON.stringify(ticket) }
                    : {})
            },
            stdio: ["ignore", "pipe", "pipe", "ipc"]
        }
    );
    const messages = [];
    const waiters = [];
    let stderr = "";

    child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
    });
    child.on("message", (message) => {
        messages.push(message);

        for (const waiter of waiters.splice(0)) {
            waiter();
        }
    });

    const waitFor = async function(predicate, timeoutMs = 60000) {
        const started = Date.now();

        while (Date.now() - started < timeoutMs) {
            const failure = messages.find((message) => message?.type === "failure");

            if (failure) {
                throw new Error(`${failure.message}\n${stderr}`);
            }

            const match = messages.find(predicate);

            if (match) {
                return match;
            }

            await new Promise((resolve, reject) => {
                const remaining = Math.max(1, timeoutMs - (Date.now() - started));
                const timer = setTimeout(() => {
                    reject(new Error(`Timed out waiting for ${role} peer.\n${stderr}`));
                }, remaining);

                waiters.push(() => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        }

        throw new Error(`Timed out waiting for ${role} peer.\n${stderr}`);
    };

    return { child, waitFor };
};


const stopPeer = async function(peer) {
    if (!peer || peer.child.exitCode !== null) {
        return;
    }

    peer.child.kill("SIGTERM");
    await new Promise((resolve) => {
        peer.child.once("exit", resolve);
        setTimeout(resolve, 2000);
    });
};


const verifyUnavailableCapability = async function(userDataPath) {
    let loadAttempts = 0;
    const unavailable = createNativeIrohLiveScriptTransport({
        userDataPath,
        loadModule: async function() {
            loadAttempts += 1;
            throw new Error("native addon missing for test");
        }
    });

    assert.strictEqual(loadAttempts, 0, "native addon loading must stay lazy");
    const capability = await unavailable.capability();

    assert.strictEqual(capability.available, false);
    assert.strictEqual(loadAttempts, 1);
    assert.match(capability.message, /native addon missing for test/);
    await assert.rejects(
        unavailable.host("session_unavailable_1234567890"),
        /native addon missing for test/
    );
    await unavailable.shutdown();
};


const run = async function() {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-iroh-phase2-"));
    const hostUserData = path.join(temporaryRoot, "host");
    const participantUserData = path.join(temporaryRoot, "participant");
    let hostPeer;
    let participantPeer;

    try {
        await verifyUnavailableCapability(path.join(temporaryRoot, "unavailable"));

        hostPeer = createPeer("host", hostUserData);
        const ready = await hostPeer.waitFor((message) => message?.type === "ready");
        participantPeer = createPeer("participant", participantUserData, ready.ticket);
        const initial = await participantPeer.waitFor((message) => {
            return message?.type === "participant-state" && message.revision === 0;
        });

        assert.strictEqual(initial.content, "x <- 1\n");
        assert.notStrictEqual(initial.endpointId, ready.endpointId);

        const editLatenciesMs = [];
        const firstEditStarted = process.hrtime.bigint();
        hostPeer.child.send({ type: "edit", text: "# first frame\n" });
        const firstEdit = await participantPeer.waitFor((message) => {
            return message?.type === "participant-state" && message.revision === 1;
        });
        editLatenciesMs.push(
            Number(process.hrtime.bigint() - firstEditStarted) / 1_000_000
        );
        assert.strictEqual(firstEdit.content, "x <- 1\n# first frame\n");

        const secondEditStarted = process.hrtime.bigint();
        hostPeer.child.send({ type: "edit", text: "# second frame\n" });
        const secondEdit = await participantPeer.waitFor((message) => {
            return message?.type === "participant-state" && message.revision === 2;
        });
        editLatenciesMs.push(
            Number(process.hrtime.bigint() - secondEditStarted) / 1_000_000
        );
        assert.strictEqual(
            secondEdit.content,
            "x <- 1\n# first frame\n# second frame\n"
        );

        participantPeer.child.send({ type: "reconnect" });
        const reconnected = await participantPeer.waitFor((message) => {
            return message?.type === "participant-reconnected";
        });
        assert.strictEqual(reconnected.revision, 2);
        assert.strictEqual(reconnected.content, secondEdit.content);
        assert.strictEqual(
            reconnected.snapshotCount,
            2,
            "native reconnect must add exactly one authoritative snapshot"
        );

        hostPeer.child.send({ type: "metrics" });
        participantPeer.child.send({ type: "metrics" });
        const hostMetrics = await hostPeer.waitFor((message) => {
            return message?.type === "metrics" && message.role === "host";
        });
        const participantMetrics = await participantPeer.waitFor((message) => {
            return message?.type === "metrics" && message.role === "participant";
        });
        process.stdout.write(
            `native iroh local edit latency ms: ${editLatenciesMs
                .map((value) => value.toFixed(2)).join(", ")}\n`
        );
        process.stdout.write(
            `native iroh peer RSS MiB: host=${(hostMetrics.memory.rss / 1048576)
                .toFixed(1)}, participant=${(participantMetrics.memory.rss / 1048576)
                .toFixed(1)}\n`
        );

        hostPeer.child.send({ type: "end" });
        await participantPeer.waitFor((message) => message?.type === "participant-ended");

        hostPeer.child.send({ type: "verify-ephemeral-identity" });
        const restarted = await hostPeer.waitFor((message) => {
            return message?.type === "restarted";
        });
        assert.strictEqual(restarted.available, true);
        assert.notStrictEqual(restarted.endpointId, ready.endpointId);

        participantPeer.child.send({ type: "shutdown" });
        await participantPeer.waitFor((message) => message?.type === "shutdown");

        process.stdout.write("OK native iroh two-instance live-script transport\n");
    }
    finally {
        await stopPeer(participantPeer);
        await stopPeer(hostPeer);
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
};


run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
