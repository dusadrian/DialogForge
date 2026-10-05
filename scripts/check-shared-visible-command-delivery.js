"use strict";

const assert = require("node:assert/strict");
const { createRuntimeVisibleCommandDelivery } = require("../dist/src/runtime/commands/runtimeVisibleCommandDelivery");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");
const { createRuntimeSessionManager } = require("../dist/src/runtime/session/runtimeSessionManager");
const { createRuntimeRestartController } = require("../dist/src/runtime/session/runtimeRestartController");
const { createRRuntimeControllerSet } = require("../dist/src/runtime/providers/r/controllers/rRuntimeControllerSet");
const { createRVisibleCommandExecutor } = require("../dist/src/runtime/providers/r/controllers/rVisibleCommandExecutor");
const { implementedRRuntimeCapabilities } = require("../dist/src/runtime/providers/r/rRuntimeCapabilities");
const { createBrowserWebRSession } = require("../dist/src/runtime/providers/webr/webRBrowserSession");
const { createWebRRuntimeRestartAdapter } = require("../dist/src/runtime/providers/webr/webRRuntimeRestartAdapter");
const { createRuntimeEventDelivery } = require("../dist/src/runtime/events/runtimeEventDelivery");

const update = {
    added: ["fixture"], updated: [], removed: [],
    datasets: { added: [], removed: [], changed: [], copied: [] }
};
const result = {
    executionDisposition: "completed",
    transcriptEvents: [{ type: "output", text: "fixture output" }],
    workspaceUpdate: update
};

const fixture = function(eventDelivery = {}) {
    const calls = [];
    let generation = 1;
    let current = true;
    let status = "ready";
    let complete;
    let workspaceResult = true;
    let duringTranscript = () => {};
    let duringWorkspace = async () => {};
    const snapshot = { providerId: "r", objects: [] };
    const runtime = {
        getSnapshot: () => ({ providerId: "r", status, lifecycleGeneration: generation }),
        getWorkspaceSnapshot: () => snapshot,
        executeVisibleCommandWithEffects: () => new Promise(resolve => { complete = resolve; })
    };
    const deliver = createRuntimeVisibleCommandDelivery({
        runtime,
        isCurrentRuntime: () => current,
        refreshRuntimeEvents: eventDelivery.refresh,
        reportRuntimeEventError: eventDelivery.reportError,
        publishTranscript(events) { calls.push(["transcript", events]); duringTranscript(); },
        async publishWorkspace(value, workspace) {
            calls.push(["workspace", value, workspace]);
            await duringWorkspace();
            return workspaceResult;
        }
    });
    return {
        calls, snapshot, deliver,
        finish: (value = result) => complete(value),
        retire: () => { current = false; },
        restart: () => { generation += 1; },
        failSession: () => { status = "failed"; },
        rejectWorkspace: () => { workspaceResult = false; },
        onTranscript: (action) => { duringTranscript = action; },
        onWorkspace: (action) => { duringWorkspace = action; }
    };
};

// Both compositions execute the real shared R controllers/session/restart owners.
// The physical response is held deliberately so an obsolete response can arrive
// after a replacement command starts. This is controlled coverage, not a claim
// that a real process or worker has stopped and drained its output.
const restartPublicationFixture = function(host) {
    const calls = [];
    const transcript = [];
    const workspaceEffects = [];
    const restartEffects = [];
    const eventPublications = [];
    let rSession = "before-restart";
    let requestSequence = 0;

    const createRequestId = function(prefix) {
        requestSequence += 1;
        return `${prefix}-${requestSequence}`;
    };
    const client = {
        execute(request, options) {
            if (request.method === "workspace.snapshot") {
                return Promise.resolve({
                    ok: true,
                    result: {
                        variables: [], dataframe: {}, objectCount: 0,
                        workspaceRevision: { session: rSession, sequence: 1 }
                    }
                });
            }
            assert.equal(request.method, "execute_input",
                "Checked command receipts must not trigger a recovery evaluation.");
            options?.onDispatched?.();
            return new Promise((resolve, reject) => {
                calls.push({ request, rSession, resolve, reject });
            });
        },
        detach() {}
    };
    const recordTranscriptEvents = function(events) {
        transcript.push(...events);
    };
    const workspaceChanged = async function(value, snapshot) {
        workspaceEffects.push({ value, snapshot });
        return true;
    };
    let manager;
    let execute;
    const eventDelivery = createRuntimeEventDelivery({
        getRuntime: () => manager,
        publish(snapshot) { eventPublications.push(snapshot); }
    });

    if (host === "webr") {
        const session = createBrowserWebRSession({
            runtimeControlClient: client,
            visibleCommands: {
                readConsoleOutputWidth: () => 80,
                recordTranscriptEvents
            },
            workspaceChanged,
            refreshRuntimeEvents: (runtime) => {
                return eventDelivery.refresh({ expectedRuntime: runtime });
            }
        });
        manager = session.runtimeSessionManager;
        execute = (text) => session.executeVisibleCommand(text, {
            activityId: text, source: "restart-publication-fixture"
        });
    }
    else {
        const commandController = createRVisibleCommandExecutor({
            getClient: () => client,
            createRequestId,
            resolveParentId: (request) => request.activityId,
            onTranscriptEvents: recordTranscriptEvents
        });
        const controllers = createRRuntimeControllerSet({
            getClient: () => client,
            createRequestId,
            interrupt: () => false,
            executeVisibleCommand: (text, source, snapshot) => {
                return commandController.executeVisibleCommand(
                    createVisibleCommandRequest({ text, source }), snapshot
                );
            }
        });
        manager = createRuntimeSessionManager({
            manifest: { id: "r", capabilities: implementedRRuntimeCapabilities },
            createSession: () => ({
                providerId: "r", status: "ready", connection: "connected"
            }),
            commandController,
            ...controllers
        });
        const deliver = createRuntimeVisibleCommandDelivery({
            runtime: manager,
            publishTranscript: recordTranscriptEvents,
            publishWorkspace: workspaceChanged,
            refreshRuntimeEvents: () => eventDelivery.refresh({ expectedRuntime: manager })
        });
        execute = async function(text) {
            const receipt = await deliver(createVisibleCommandRequest({
                text, activityId: text, source: "restart-publication-fixture"
            }));
            return { ok: receipt.accepted };
        };
    }

    const stopRuntime = async function() {
        const snapshot = await manager.stop();
        rSession = "after-restart";
        return snapshot;
    };
    const callbacks = {
        invalidateDatasetPreview() { restartEffects.push("invalidate"); },
        setRuntimeSession() { restartEffects.push("set-session"); },
        sendRuntimeSession() { restartEffects.push("send-session"); },
        async refreshWorkspace() {
            restartEffects.push("refresh");
            await manager.listWorkspaceObjects();
        },
        async captureWorkspaceBaseline() { restartEffects.push("baseline"); }
    };
    const restart = host === "webr"
        ? createWebRRuntimeRestartAdapter({
            ...callbacks,
            getRuntime: () => null,
            getRuntimeSessionManager: () => manager,
            readRuntimeSnapshot: manager.getSnapshot,
            stopRuntime,
            startRuntime: manager.start
        })
        : createRuntimeRestartController({
            ...callbacks,
            runtimeSessionManager: {
                getSnapshot: manager.getSnapshot,
                executeRuntimeMethod: manager.executeRuntimeMethod,
                stop: stopRuntime,
                start: manager.start
            },
            createWorkspacePath: () => "/fixture-clean-restart.RData",
            removeWorkspaceFile() {}
        });

    const finish = function(index, objectName, sequence) {
        const call = calls[index];
        const parentId = call.request.params.parentId;
        const revision = { session: call.rSession, sequence };
        call.resolve({
            ok: true,
            events: [
                { type: "input", parent_id: parentId, code: call.request.params.code },
                { type: "stream", parent_id: parentId, text: `${objectName} output` },
                {
                    type: "workspace_update", parent_id: parentId,
                    update: {
                        added: [{ name: objectName, kind: "table", hasViewer: true }],
                        updated: [], removed: [], objectCount: sequence - 1,
                        workspaceRevision: revision,
                        datasets: { added: [objectName], removed: [], changed: [], copied: [] }
                    }
                },
                {
                    type: "completion", parent_id: parentId, state: "idle",
                    workspaceReconciliation: "changed", workspaceRevision: revision
                }
            ]
        });
    };

    return {
        manager, execute, restart, calls, transcript, workspaceEffects, restartEffects,
        eventPublications,
        finish,
        fail(index) { calls[index].reject(new Error("Retired physical command failed.")); }
    };
};

const waitForCommandCount = async function(test, expected) {
    for (let attempt = 0; attempt < 40 && test.calls.length < expected; attempt += 1) {
        await Promise.resolve();
    }
    assert.equal(test.calls.length, expected, "The expected command must actually dispatch.");
};

const checkRestartPublication = async function(host, oldResponse) {
    const test = restartPublicationFixture(host);
    await test.manager.listWorkspaceObjects();
    const generation = test.manager.getSnapshot().lifecycleGeneration;
    const oldCommand = test.execute("retired-running");
    const oldFailure = oldResponse === "failure"
        ? assert.rejects(oldCommand, /Retired physical command failed/)
        : null;
    await waitForCommandCount(test, 1);
    const retiredQueued = test.execute("retired-queued");

    const restarted = await test.restart.restart("clean", "restart-publication-fixture");
    assert.equal(restarted.status, "ready", host);
    assert.equal(restarted.lifecycleGeneration, generation + 2, host);
    assert.equal((await retiredQueued).ok, false,
        "A queued old command is rejected, not evaluated after restart.");
    assert.deepEqual(test.restartEffects, [
        "invalidate", "set-session", "send-session", "refresh", "baseline"
    ]);
    assert.deepEqual(test.manager.getWorkspaceSnapshot().objects, []);

    const replacement = test.execute("replacement-running");
    await waitForCommandCount(test, 2);
    const replacementQueued = test.execute("replacement-queued");
    const beforeLateResponse = test.transcript.slice();

    if (oldResponse === "failure") {
        test.fail(0);
        await oldFailure;
    }
    else {
        test.finish(0, "retired-object", 99);
        assert.equal((await oldCommand).ok, false);
    }
    assert.deepEqual(test.transcript, beforeLateResponse,
        "The old completion cannot publish into the replacement transcript.");
    assert.deepEqual(test.workspaceEffects, [],
        "The old completion cannot invalidate or publish replacement caches/workspace.");
    assert.deepEqual(test.eventPublications, [],
        "An obsolete caller must not refresh replacement events, even on the SAME manager.");
    assert.deepEqual(test.manager.getWorkspaceSnapshot().objects, []);
    assert.equal(test.manager.getWorkspaceSnapshot().workspaceRevision.session, "after-restart");
    assert.equal(test.calls.length, 2,
        "The old response cannot release the replacement command's queue owner.");
    const beforeCurrentCompletion = await test.manager.listRuntimeEvents();
    assert.equal(beforeCurrentCompletion.events.some((event) => {
        return event.type === "workspace.update";
    }), false, "The retired response must not add workspace effects to event history.");

    test.finish(1, "replacement-object", 2);
    assert.equal((await replacement).ok, true);
    await waitForCommandCount(test, 3);
    assert.equal(test.calls[2].request.params.code, "replacement-queued");
    test.finish(2, "replacement-next", 3);
    assert.equal((await replacementQueued).ok, true);
    assert.equal(test.eventPublications.length, 2,
        "Both accepted commands complete the SAME event-delivery barrier.");
    assert.deepEqual(test.workspaceEffects.map((effect) => {
        return effect.value.added.map((object) => object.name);
    }), [["replacement-object"], ["replacement-next"]]);
    assert.deepEqual(test.manager.getWorkspaceSnapshot().objects.map((object) => object.name), [
        "replacement-next", "replacement-object"
    ]);
    assert.equal(test.manager.getWorkspaceSnapshot().freshness, "fresh");
    assert.equal(test.manager.getActiveDataset().objectName, "replacement-object");
    const currentEvents = await test.manager.listRuntimeEvents();
    assert.deepEqual(currentEvents.events.filter((event) => {
        return event.type === "workspace.update";
    }).map((event) => event.payload.added.map((object) => object.name)), [
        ["replacement-next"], ["replacement-object"]
    ], "Event history is newest first; delivery effects above remain chronological.");
    await test.manager.stop();
};

const waitForEventRefresh = async function(readCompletion) {
    for (let attempt = 0; attempt < 40 && !readCompletion(); attempt += 1) {
        await Promise.resolve();
    }
    assert.equal(typeof readCompletion(), "function", "The event refresh must actually start.");
};

const checkEventRefreshBarrier = async function() {
    const order = [];
    const accepted = fixture({
        refresh: async function() {
            assert.equal(accepted.calls.length, 2,
                "Transcript and workspace publication precede event refresh.");
            order.push("events");
        }
    });
    const acceptedDelivery = accepted.deliver({ text: "accepted" });
    accepted.finish();
    assert.equal((await acceptedDelivery).accepted, true);
    assert.deepEqual(order, ["events"]);

    for (const gate of ["retire", "restart", "workspace-rejected", "workspace-retired", "session-lost"]) {
        const skipped = fixture({ refresh: async () => { order.push(gate); } });
        if (gate === "workspace-rejected") {
            skipped.rejectWorkspace();
        }
        if (gate === "workspace-retired") {
            skipped.onWorkspace(async () => skipped.restart());
        }
        const delivery = skipped.deliver({ text: gate });
        if (gate === "retire" || gate === "restart") {
            skipped[gate]();
        }
        skipped.finish(gate === "session-lost"
            ? { ...result, executionDisposition: "session_lost" }
            : result);
        assert.equal((await delivery).accepted, false);
    }
    assert.deepEqual(order, ["events"], "Rejected publication must not query runtime events.");

    for (const retirement of [null, "retire", "restart", "failSession"]) {
        let finishEvents;
        let settled = false;
        const waiting = fixture({
            refresh: () => new Promise((resolve) => { finishEvents = resolve; })
        });
        const delivery = waiting.deliver({ text: "waiting-for-events" });
        void delivery.then(() => { settled = true; });
        waiting.finish();
        await waitForEventRefresh(() => finishEvents);
        assert.equal(settled, false, "Command publication retains ownership through event delivery.");
        if (retirement) {
            waiting[retirement]();
        }
        finishEvents();
        assert.equal((await delivery).accepted, retirement === null);
    }

    const errors = [];
    const currentFailure = new Error("Current event refresh failed.");
    const failed = fixture({
        refresh: async () => { throw currentFailure; },
        reportError: (error) => errors.push(error)
    });
    const failedDelivery = failed.deliver({ text: "current-event-error" });
    failed.finish();
    assert.equal((await failedDelivery).accepted, true,
        "An event-read failure is reported without changing an accepted command outcome.");
    assert.deepEqual(errors, [currentFailure]);

    const unreported = fixture({ refresh: async () => { throw currentFailure; } });
    const unreportedDelivery = unreported.deliver({ text: "no-error-adapter" });
    unreported.finish();
    await assert.rejects(unreportedDelivery, (error) => error === currentFailure,
        "A current failure cannot be silently discarded without a reporting adapter.");

    for (const retirement of ["retire", "restart", "failSession"]) {
        let failEvents;
        const obsolete = fixture({
            refresh: () => new Promise((_, reject) => { failEvents = reject; }),
            reportError: (error) => errors.push(error)
        });
        const obsoleteDelivery = obsolete.deliver({ text: "obsolete-event-error" });
        obsolete.finish();
        await waitForEventRefresh(() => failEvents);
        obsolete[retirement]();
        failEvents(new Error("Obsolete event refresh failed."));
        assert.equal((await obsoleteDelivery).accepted, false);
    }
    assert.deepEqual(errors, [currentFailure],
        "A late event-read failure cannot report into the replacement console.");
};

const main = async function() {
    for (const host of ["native", "webr"]) {
        const accepted = fixture();
        const first = accepted.deliver({ text: "fixture" });
        accepted.finish();
        assert.equal((await first).accepted, true, host);
        assert.deepEqual(accepted.calls, [
            ["transcript", result.transcriptEvents],
            ["workspace", update, accepted.snapshot]
        ]);

        for (const retire of ["retire", "restart"]) {
            const retired = fixture();
            const pending = retired.deliver({ text: "fixture" });
            retired[retire]();
            retired.finish();
            assert.equal((await pending).accepted, false);
            assert.deepEqual(retired.calls, []);
        }

        const rejected = fixture();
        rejected.rejectWorkspace();
        const pending = rejected.deliver({ text: "fixture" });
        rejected.finish();
        assert.equal((await pending).accepted, false);
        assert.equal(rejected.calls.length, 2, "Accepted transcript remains before rejected workspace.");

        const retiredByTranscript = fixture();
        retiredByTranscript.onTranscript(retiredByTranscript.restart);
        const during = retiredByTranscript.deliver({ text: "fixture" });
        retiredByTranscript.finish();
        assert.equal((await during).accepted, false);
        assert.equal(retiredByTranscript.calls.length, 1);

        const retiredByWorkspace = fixture();
        retiredByWorkspace.onWorkspace(async () => retiredByWorkspace.restart());
        const after = retiredByWorkspace.deliver({ text: "fixture" });
        retiredByWorkspace.finish();
        assert.equal((await after).accepted, false);

        const lost = fixture();
        const lostDelivery = lost.deliver({ text: "fixture" });
        lost.finish({ ...result, executionDisposition: "session_lost" });
        assert.equal((await lostDelivery).accepted, false);
        assert.deepEqual(lost.calls, []);

        const notStarted = fixture();
        const notStartedDelivery = notStarted.deliver({ text: "fixture" });
        notStarted.finish({ ...result, executionDisposition: "not_started", workspaceUpdate: null });
        assert.equal((await notStartedDelivery).accepted, true);
        assert.equal(notStarted.calls.length, 1, "A current rejection still displays its transcript.");

        const failed = fixture();
        failed.onWorkspace(async () => { throw new Error("workspace delivery failed"); });
        const failure = failed.deliver({ text: "fixture" });
        failed.finish();
        await assert.rejects(failure, /workspace delivery failed/);

        for (const oldResponse of ["success", "failure"]) {
            await checkRestartPublication(host, oldResponse);
        }
        await checkEventRefreshBarrier();
    }
    console.log("Shared visible command delivery and controlled restart-publication cases passed; real host drain acceptance remains open.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
