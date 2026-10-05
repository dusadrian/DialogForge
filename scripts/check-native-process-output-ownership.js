"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const childProcess = require("node:child_process");
const hostModule = require("../dist/src/runtime/providers/r/session/runtimeProcessHost");
const executorModule = require("../dist/src/runtime/providers/r/controllers/rVisibleCommandExecutor");
const controllerSetModule = require("../dist/src/runtime/providers/r/controllers/rRuntimeControllerSet");
const controlModule = require("../dist/src/runtime/providers/r/protocol/runtimeControlClient");
const processTreeModule = require("../dist/src/runtime/session/processTree");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");

const main = async function() {
    const originalHost = hostModule.createRRuntimeProcessHost;
    const originalExecutor = executorModule.createRVisibleCommandExecutor;
    const originalControllerSet = controllerSetModule.createRRuntimeControllerSet;
    const originalImmediate = global.setImmediate;
    const originalClearImmediate = global.clearImmediate;
    let hostOptions;
    let executorOptions;
    let gracePeriods = 0;
    try {
        hostModule.createRRuntimeProcessHost = (options) => {
            hostOptions = options;
            return { start: async (snapshot) => snapshot, stop: async (snapshot) => snapshot, interrupt: () => null };
        };
        executorModule.createRVisibleCommandExecutor = (options) => {
            executorOptions = options;
            return { executeVisibleCommand: async () => ({ transcriptEvents: [], workspaceUpdate: null }) };
        };
        controllerSetModule.createRRuntimeControllerSet = () => ({});
        global.setImmediate = () => { gracePeriods += 1; return {}; };
        global.clearImmediate = () => {};
        const { createRRuntimeProcessController } = require("../dist/src/runtime/providers/r/session/runtimeProcessController");
        const events = [];
        createRRuntimeProcessController({
            createLaunchPlan: () => ({}), onTranscriptEvents: (incoming) => events.push(...incoming)
        });
        const attach = (sessionId) => hostOptions.onClientChanged({}, {
            plan: { env: { DM_ORDERED_OUTPUT_ENABLED: "1", DM_ORDERED_OUTPUT_SESSION: sessionId, DM_ORDERED_OUTPUT_DIR: "unused" } },
            meta: { orderedOutputEncoding: "utf8", orderedOutputSession: sessionId }
        });
        const request = createVisibleCommandRequest({ text: "probe()", source: "command-fixture" });
        attach("session-one");
        hostOptions.onProcessOutput({ streamName: "stdout", text: "between commands" });
        executorOptions.onExecutionStarted(request, "first-command");
        hostOptions.onProcessOutput({ streamName: "stderr", text: "outside R sinks" });
        executorOptions.onExecutionFinished("first-command");
        hostOptions.onProcessOutput({ streamName: "stdout", text: "late arrival" });
        executorOptions.onExecutionStarted(request, "second-command");
        hostOptions.onProcessOutput({ streamName: "stderr", text: "another arrival" });
        executorOptions.onExecutionFinished("second-command");
        assert.equal(gracePeriods, 0, "Ordered capture cannot use a timing grace period for process attribution");
        assert.equal(events.length, 4, "Unowned output remains visible between and during commands");
        for (const event of events) {
            assert.equal(event.type, "output");
            assert.equal(event.commandKind, "runtime.process");
            assert.equal(event.text, "");
            assert.equal(event.parentId, event.id);
            assert.notEqual(event.parentId, "first-command");
            assert.notEqual(event.parentId, "second-command");
        }
        assert.equal(new Set(events.map((event) => event.parentId)).size, 4,
            "Distinct arrivals cannot be regrouped into an earlier command/activity");
        const firstSessionId = events[0].id;
        hostOptions.onClientChanged(null);
        attach("session-two");
        hostOptions.onProcessOutput({ streamName: "stdout", text: "new session" });
        assert.notEqual(events.at(-1).id, firstSessionId);

        hostOptions.onClientChanged(null);
        const retiredEvents = events.length;
        hostOptions.onProcessOutput({ streamName: "stdout", text: "retired process" });
        assert.equal(events.length, retiredEvents, "Detached process output must not publish.");
        hostOptions.onClientChanged({});
        hostOptions.onProcessOutput({ streamName: "stdout", text: "default between commands" });
        executorOptions.onExecutionStarted(request, "legacy-command");
        hostOptions.onProcessOutput({ streamName: "stdout", text: "legacy output" });
        executorOptions.onExecutionFinished("legacy-command");
        hostOptions.onProcessOutput({ streamName: "stdout", text: "default late arrival" });
        executorOptions.onExecutionStarted(request, "next-default-command");
        hostOptions.onProcessOutput({ streamName: "stderr", text: "default next arrival" });
        executorOptions.onExecutionFinished("next-default-command");
        assert.equal(events.length, retiredEvents + 4);
        for (const event of events.slice(retiredEvents)) {
            assert.equal(event.commandKind, "runtime.process");
            assert.equal(event.parentId, event.id);
            assert.ok(event.id.startsWith("process-output:"));
            assert.notEqual(event.parentId, "legacy-command");
            assert.notEqual(event.parentId, "next-default-command");
        }
        assert.equal(gracePeriods, 0, "Neither capture mode may guess pipe ownership with a timing grace period");
    } finally {
        hostModule.createRRuntimeProcessHost = originalHost;
        executorModule.createRVisibleCommandExecutor = originalExecutor;
        controllerSetModule.createRRuntimeControllerSet = originalControllerSet;
        global.setImmediate = originalImmediate;
        global.clearImmediate = originalClearImmediate;
    }

    const originalSpawn = childProcess.spawn;
    const originalMeta = controlModule.readRuntimeControlMeta;
    const originalClient = controlModule.createRuntimeControlClient;
    const originalTerminate = processTreeModule.terminateProcessTree;
    const originalEmergency = processTreeModule.registerEmergencyProcessTreeTermination;
    const children = [];
    const forwarded = [];
    const unexpectedExits = [];
    let host;
    const snapshot = { providerId: "r", status: "stopped" };
    let boundedStartup = false;
    let startupMeta = { ok: true, port: 1 };
    let emitExitOnKill = false;
    let rejectProcessOutput = false;
    let detachedClients = 0;
    try {
        childProcess.spawn = () => {
            const child = new EventEmitter();
            Object.assign(child, {
                stdout: new PassThrough(), stderr: new PassThrough(),
                exitCode: null, signalCode: null, killed: false,
                kill: () => {
                    child.killed = true;
                    if (emitExitOnKill) {
                        child.emit("exit", null, "SIGTERM");
                    }
                    return true;
                }
            });
            children.push(child);
            return child;
        };
        controlModule.readRuntimeControlMeta = async () => startupMeta;
        controlModule.createRuntimeControlClient = () => ({ detach: () => { detachedClients++; } });
        processTreeModule.terminateProcessTree = async () => {};
        processTreeModule.registerEmergencyProcessTreeTermination = () => () => {};
        host = originalHost({
            createLaunchPlan: () => ({
                command: "unused", args: [],
                env: boundedStartup ? { DM_BOUNDED_INPUT_ENABLED: "1", DM_RUNTIME_CONTROL_MAX_PAYLOAD: "512" } : {},
                metaPath: "unused", tempDir: ""
            }),
            startupTimeoutMs: 500, onClientChanged: () => {}, onRuntimeEvent: () => {},
            onProcessOutput: (output) => {
                if (rejectProcessOutput) {
                    throw Error("Scoped physical pipe consumer failure");
                }
                forwarded.push(output.text);
            },
            onUnexpectedExit: (details) => unexpectedExits.push(details)
        });
        await host.start(snapshot);
        assert.equal(children[0].stdout.readableEncoding, "utf8");
        assert.equal(children[0].stderr.readableEncoding, "utf8");
        for (const [stream, text] of [["stdout", "😀"], ["stderr", "é"]]) {
            const bytes = Buffer.from(text);
            for (let index = 0; index < bytes.length; index++) {
                children[0][stream].write(bytes.subarray(index, index + 1));
            }
        }
        children[0].stdout.emit("data", Buffer.from("current-one"));
        await host.stop(snapshot);
        await host.start(snapshot);
        children[0].stdout.emit("data", Buffer.from("retired-stdout"));
        children[0].stderr.emit("data", Buffer.from("retired-stderr"));
        children[1].stdout.emit("data", Buffer.from("current-two"));
        assert.deepEqual(forwarded, ["😀", "é", "current-one", "current-two"],
            "Retired process callbacks cannot publish into the replacement session");
        rejectProcessOutput = true;
        const beforeFailure = detachedClients;
        assert.doesNotThrow(() => children[1].stdout.emit("data", "consumer failure"));
        assert.equal(detachedClients, beforeFailure + 1, "Only the callback's captured client is retired.");
        rejectProcessOutput = false;
        await host.stop(snapshot);
        await host.start(snapshot);
        const afterReplacement = detachedClients;
        rejectProcessOutput = true;
        children[1].stderr.emit("data", "retired callback");
        assert.equal(detachedClients, afterReplacement, "Old callbacks cannot retire the fresh client.");
        rejectProcessOutput = false;
        boundedStartup = true;
        for (const confirmation of ["missing", "mismatch", "valid"]) {
            await host.stop(snapshot);
            startupMeta = {
                ok: true, port: 1,
                ...(confirmation === "missing" ? {} : {
                    boundedInput: "native-v1", maxRequestBytes: confirmation === "valid" ? 512 : 1024
                })
            };
            const started = await host.start(snapshot);
            assert.equal(started.status, confirmation === "valid" ? "ready" : "failed");
            if (confirmation !== "valid") {
                assert.match(started.message, /bounded input startup did not confirm/);
            }
        }

        emitExitOnKill = true;
        for (const failure of ["meta", "bounded-confirmation"]) {
            await host.stop(snapshot);
            boundedStartup = failure === "bounded-confirmation";
            startupMeta = boundedStartup
                ? { ok: true, port: 1, boundedInput: "native-v1", maxRequestBytes: 1024 }
                : { ok: false, error: "synthetic-startup-timeout" };
            const started = await host.start(snapshot);
            assert.equal(started.status, "failed");
            assert.deepEqual(unexpectedExits, [],
                "Deliberate cleanup of an unaccepted startup must not open crash recovery.");
        }

        boundedStartup = false;
        startupMeta = { ok: true, port: 1 };
        assert.equal((await host.start(snapshot)).status, "ready");
        if (process.platform !== "win32") {
            const originalSignal = process.kill;
            const child = children.at(-1);
            const signals = [];
            child.pid = 4242;
            try {
                process.kill = (pid, signal) => { signals.push({ pid, signal }); };
                assert.equal(host.interrupt(), true);
                assert.deepEqual(signals, [{ pid: -4242, signal: "SIGINT" }],
                    "Only the task-owned detached group receives the Unix interrupt.");
                process.kill = () => { throw Error("scoped signal failure"); };
                assert.equal(host.interrupt(), false,
                    "A failed physical group signal cannot be reported as accepted.");
            } finally {
                process.kill = originalSignal;
                delete child.pid;
            }
        }
        children.at(-1).emit("exit", 9, null);
        assert.equal(unexpectedExits.length, 1,
            "An unexpected exit after accepted startup must still reach crash recovery.");
        assert.equal(unexpectedExits[0].code, 9);
        assert.equal(host.interrupt(), null, "An exited process cannot receive Interrupt.");
    } finally {
        await host?.stop(snapshot);
        childProcess.spawn = originalSpawn;
        controlModule.readRuntimeControlMeta = originalMeta;
        controlModule.createRuntimeControlClient = originalClient;
        processTreeModule.terminateProcessTree = originalTerminate;
        processTreeModule.registerEmergencyProcessTreeTermination = originalEmergency;
    }
    console.log("Process output ownership cases passed; real native pipes/rendered acceptance remains separate.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
