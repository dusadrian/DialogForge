"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
    createConsoleRuntimeSessionController
} = require("../../dist/src/console/renderer/consoleRuntimeSessionController");
const {
    createMainStartupController
} = require("../../dist/src/base-app/features/main-window/mainStartupController");
const {
    findConfiguredRBinary
} = require("../../dist/src/runtime/providers/r/session/rBinaryDiscovery");


const checkRuntimeRecovery = async function() {
    let session = {
        providerId: "r", status: "starting", connection: "runtime-control",
        lifecycleGeneration: 1
    };
    let finishStartup;
    let rejectStartup;
    let startupTasks = 0;
    const applied = [];
    const controller = createConsoleRuntimeSessionController({
        startupTimeoutMs: 20,
        getSession: () => session,
        startRuntime: () => new Promise((resolve, reject) => {
            finishStartup = resolve;
            rejectStartup = reject;
        }),
        stopRuntime: async () => ({
            ...session, status: "stopped",
            lifecycleGeneration: session.lifecycleGeneration + 1
        }),
        applySession: value => { session = value; applied.push(value); },
        renderStatus: () => {},
        refreshRuntimeEvents: () => {},
        refreshPrompts: () => {},
        runStartupTasks: async () => { startupTasks += 1; }
    });

    const first = controller.start();
    assert.equal(controller.start(), first, "Concurrent starts must share one attempt.");
    const failed = await first;
    assert.equal(failed.status, "failed");
    assert.match(failed.message, /Restart Clean/);
    assert.equal(startupTasks, 0, "Failed startup must not run product tasks.");

    session = { ...session, status: "ready", lifecycleGeneration: 3 };
    const replacement = session;
    finishStartup({ ...failed, status: "ready" });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(session, replacement, "Late timed-out completion must not replace a new session.");

    session = { ...session, status: "starting", lifecycleGeneration: 4 };
    const rejected = controller.start();
    await Promise.resolve();
    rejectStartup(new Error("Startup transport closed."));
    assert.equal((await rejected).message, "Startup transport closed.");
    assert.equal(session.status, "failed", "Rejected startup must leave the starting cover.");

    session = { ...session, status: "starting", lifecycleGeneration: 5 };
    const stoppedAttempt = controller.start();
    await Promise.resolve();
    await controller.stop();
    const stopped = session;
    assert.equal(stopped.status, "stopped");
    rejectStartup(new Error("Retired startup failed."));
    await stoppedAttempt;
    assert.equal(session, stopped, "A stopped attempt must not publish its later rejection.");

    session = { ...session, status: "starting", lifecycleGeneration: 6 };
    const replacedAttempt = controller.start();
    await Promise.resolve();
    session = { ...session, status: "starting", lifecycleGeneration: 8 };
    const newerStartup = session;
    rejectStartup(new Error("Old startup failed after clean restart."));
    await replacedAttempt;
    assert.equal(session, newerStartup, "Old failure must not mark a replacement startup failed.");

    session = { ...session, status: "starting", lifecycleGeneration: 9 };
    const eventReadyAttempt = controller.start();
    await Promise.resolve();
    session = { ...session, status: "ready" };
    const eventReady = session;
    assert.equal(await eventReadyAttempt, eventReady, "Accepted ready event survives a missing IPC response.");
    assert.equal(startupTasks, 1);
    assert.equal(applied.filter(value => value.message === "Retired startup failed.").length, 0);
};


const checkBootRetirement = async function() {
    let releaseComposition;
    let controlsBound = false;
    let compositionApplied = false;
    const controller = createMainStartupController({
        startupTimeoutMs: 20,
        bindMainUi: () => { controlsBound = true; },
        setBootStage: () => {},
        getComposition: () => new Promise(resolve => { releaseComposition = resolve; }),
        applyComposition: async () => { compositionApplied = true; }
    });

    const started = controller.start();
    assert.equal(controlsBound, true, "Recovery controls must bind before startup IPC.");
    await assert.rejects(started, /composition:request.*Restart Clean/);
    releaseComposition({});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(compositionApplied, false, "Retired boot must not resume initialization on a late reply.");
};


const checkDiscoveryDeadline = async function() {
    if (process.platform === "win32") {
        return;
    }

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dialogforge-discovery-deadline-"));
    const executable = path.join(directory, "R");

    try {
        // exec makes the blocked probe itself own sleep; no child is left behind.
        await fs.writeFile(executable, "#!/bin/sh\nexec /bin/sleep 60\n", { mode: 0o700 });
        const started = Date.now();
        assert.equal(await findConfiguredRBinary("R", executable), executable);
        const elapsed = Date.now() - started;

        assert.ok(elapsed >= 2000 && elapsed < 10000, `Version probe took ${elapsed}ms.`);
    }
    finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
};


const main = async function() {
    await checkRuntimeRecovery();
    await checkBootRetirement();
    await checkDiscoveryDeadline();
    console.log("Startup failure, deadlines, recovery binding and retirement cases passed.");
};

void main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
