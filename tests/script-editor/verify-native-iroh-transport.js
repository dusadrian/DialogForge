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

        hostPeer.child.send({ type: "edit", text: "# first frame\n" });
        const firstEdit = await participantPeer.waitFor((message) => {
            return message?.type === "participant-state" && message.revision === 1;
        });
        assert.strictEqual(firstEdit.content, "x <- 1\n# first frame\n");

        hostPeer.child.send({ type: "edit", text: "# second frame\n" });
        const secondEdit = await participantPeer.waitFor((message) => {
            return message?.type === "participant-state" && message.revision === 2;
        });
        assert.strictEqual(
            secondEdit.content,
            "x <- 1\n# first frame\n# second frame\n"
        );

        hostPeer.child.send({ type: "end" });
        await participantPeer.waitFor((message) => message?.type === "participant-ended");

        hostPeer.child.send({ type: "verify-persistence" });
        const persisted = await hostPeer.waitFor((message) => message?.type === "persisted");
        assert.strictEqual(persisted.available, true);
        assert.strictEqual(persisted.endpointId, ready.endpointId);

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
