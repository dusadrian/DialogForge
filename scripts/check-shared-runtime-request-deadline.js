"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { executeRuntimeControlRequestWithDeadline } = require("../dist/src/runtime/providers/r/protocol/runtimeControlRequestDeadline");
const { createRuntimeControlRequestAdmission } = require("../dist/src/runtime/providers/r/protocol/runtimeControlRequestAdmission");
const { createRuntimeOperationQueue } = require("../dist/src/runtime/session/runtimeOperationQueue");
const { createWebRPromptTransport } = require("../dist/src/runtime/providers/webr/webRPromptTransport");

const main = async function() {
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const timers = new Map();
    let nextTimer = 0;
    global.setTimeout = function(callback, delay) {
        const id = ++nextTimer;
        timers.set(id, { callback, delay });
        return id;
    };
    global.clearTimeout = function(id) { timers.delete(id); };
    const expireDeadline = function(expectedDelay) {
        assert.equal(timers.size, 1);
        const [id, timer] = timers.entries().next().value;
        assert.equal(timer.delay, expectedDelay);
        timers.delete(id);
        timer.callback();
    };

    try {
        for (const host of ["r", "webr"]) {
            const request = { id: `${host}-query`, method: "workspace.snapshot" };
            let dispatch;
            let finish;
            let entered = false;
            const physical = new Promise((resolve) => { finish = resolve; });
            const outcome = executeRuntimeControlRequestWithDeadline(request, (options) => {
                entered = true;
                dispatch = options;
                return physical;
            }, undefined, () => { throw new Error("diagnostic failure"); });
            assert.equal(entered, true, "Admission must occur synchronously.");
            assert.equal(timers.size, 0, "Queued work has no running deadline.");
            dispatch.onDispatched();
            dispatch.onDispatched();
            request.id = "caller-mutated";
            expireDeadline(2620);
            assert.deepEqual(await outcome, {
                id: `${host}-query`, method: "workspace.snapshot", ok: false,
                error: "runtime-session-timeout"
            });
            finish({ id: `${host}-query`, method: "workspace.snapshot", ok: true });
            await physical;

            for (const method of ["execute_input", "reply_prompt"]) {
                let complete;
                const pending = new Promise((resolve) => { complete = resolve; });
                const response = executeRuntimeControlRequestWithDeadline({ id: method, method }, (options) => {
                    options.onDispatched();
                    return pending;
                });
                assert.equal(timers.size, method === "execute_input" ? 0 : 1);
                complete({ id: method, method, ok: true });
                assert.equal((await response).ok, true);
                assert.equal(timers.size, 0, "A physical response cancels its deadline.");
            }

            for (const [requested, delay] of [[1, 370], [500, 620], [Number.MAX_VALUE, 2147483647]]) {
                let complete;
                const physicalResponse = new Promise((resolve) => { complete = resolve; });
                const response = executeRuntimeControlRequestWithDeadline({
                    id: "explicit", method: "execute_input", params: { timeoutMs: requested }
                }, (options) => {
                    options.onDispatched();
                    return physicalResponse;
                });
                expireDeadline(delay);
                assert.equal((await response).error, "runtime-session-timeout");
                complete({ id: "explicit", method: "execute_input", ok: true });
                await physicalResponse;
            }

            await assert.rejects(executeRuntimeControlRequestWithDeadline({
                id: "throw", method: "workspace.snapshot"
            }, (options) => {
                options.onDispatched();
                throw new Error("dispatch failed");
            }), /dispatch failed/);
            assert.equal(timers.size, 0, "Synchronous dispatch failure must cancel its timer.");

            const admission = createRuntimeControlRequestAdmission(2);
            const queue = createRuntimeOperationQueue();
            const active = { id: "active", method: "workspace.snapshot" };
            assert.equal(admission.admit(active), null);
            let releasePhysical;
            let started;
            const began = new Promise((resolve) => { started = resolve; });
            const physicalResponse = new Promise((resolve) => { releasePhysical = resolve; });
            const first = queue.run(() => executeRuntimeControlRequestWithDeadline(active, (options) => {
                options.onDispatched();
                started();
                return physicalResponse;
            }), () => admission.waitForRelease(active.id));
            let nextStarted = false;
            const next = queue.run(async () => { nextStarted = true; });
            await began;
            expireDeadline(2620);
            assert.equal((await first).error, "runtime-session-timeout");
            assert.equal(nextStarted, false, "Timeout must not dispatch the next physical operation.");
            releasePhysical({ id: "active", method: "workspace.snapshot", ok: true });
            await physicalResponse;
            assert.equal(nextStarted, false, "Late receipt alone is not admission release.");
            admission.release(active.id);
            await next;
            assert.equal(nextStarted, true);

            for (const dispatched of [false, true]) {
                const retirement = createRuntimeControlRequestAdmission();
                const retainedEvents = [{ type: "stream", text: "accepted before retirement" }];
                let complete;
                let lateDispatch;
                let notified = 0;
                const reasons = [];
                retirement.subscribeRetirement(error => reasons.push(error));
                const physical = new Promise(resolve => { complete = resolve; });
                const retired = executeRuntimeControlRequestWithDeadline({
                    id: host + "-retirement", method: "evaluate_code"
                }, options => {
                    lateDispatch = options;
                    if (dispatched) {
                        options.onDispatched();
                    }
                    return physical;
                }, { onDispatched: () => { notified++; } }, undefined, {
                    subscribe: retirement.subscribeRetirement,
                    readEvents: () => retainedEvents.slice()
                });
                retirement.retire("fixture-owner-retired");
                retirement.retire("must-not-replace-reason");
                assert.deepEqual(await retired, {
                    id: host + "-retirement", method: "evaluate_code", ok: false,
                    transportFailure: true, error: "fixture-owner-retired", events: retainedEvents
                });
                assert.equal(timers.size, 0, "Retirement removes a dispatched deadline.");
                assert.deepEqual(reasons, ["fixture-owner-retired"]);
                lateDispatch.onDispatched();
                assert.equal(notified, dispatched ? 1 : 0,
                    "A late physical callback cannot republish retired activity.");
                complete({ id: "late", method: "evaluate_code", ok: true });
                await physical;
                assert.equal((await retired).ok, false, "Late physical success cannot replace retirement.");
                let entered = false;
                const alreadyRetired = await executeRuntimeControlRequestWithDeadline({
                    id: "new", method: "evaluate_code"
                }, async () => { entered = true; return { ok: true }; }, undefined, undefined, {
                    subscribe: retirement.subscribeRetirement
                });
                assert.equal(alreadyRetired.transportFailure, true);
                assert.equal(alreadyRetired.error, "runtime-session-detached",
                    "A new request sees a detached owner, not an earlier request's failure.");
                assert.equal(entered, false, "A retired owner cannot start another physical operation.");
            }

            for (const disposition of ["timeout", "retired", "delivery-failed"]) {
                const admission = createRuntimeControlRequestAdmission();
                const request = { id: `${host}-received-${disposition}`, method: "evaluate_code" };
                let dispatch;
                let finish;
                const physical = new Promise(resolve => { finish = resolve; });
                const response = executeRuntimeControlRequestWithDeadline(request, options => {
                    dispatch = options;
                    options.onDispatched();
                    return physical;
                }, undefined, undefined, {
                    subscribe: admission.subscribeRetirement,
                    readEvents: () => [{ type: "stream", text: "live-only fallback" }]
                });
                const events = [{ type: "completion", evaluationOutcome: "success" }];
                dispatch.onResponseReceived({ ...request, ok: true, events });
                events.push({ type: "stream", text: "later array mutation" });
                dispatch.onResponseReceived({ id: "foreign", method: request.method,
                    ok: true, events: [] });
                if (disposition === "timeout") {
                    expireDeadline(2620);
                } else if (disposition === "retired") {
                    admission.retire("fixture-delivery-retired");
                } else {
                    finish({ ...request, ok: false, error: "fixture-delivery-failed" });
                }
                const result = await response;
                assert.equal(result.ok, false, "Known evaluation never implies accepted output delivery.");
                const expectedErrors = {
                    timeout: "runtime-session-timeout",
                    retired: "fixture-delivery-retired",
                    "delivery-failed": "fixture-delivery-failed"
                };
                assert.equal(result.error, expectedErrors[disposition]);
                assert.deepEqual(result.events, [{ type: "completion", evaluationOutcome: "success" }],
                    "Retain captured validated receipts, not only the live event fallback.");
                dispatch.onResponseReceived({ ...request, ok: true, events: [] });
                finish({ ...request, ok: true });
                await physical;
                assert.deepEqual((await response).events, result.events,
                    "Late receipt cannot replace the settled delivery failure.");
                assert.equal(timers.size, 0);
            }

            const requestWithFailureEvents = {
                id: `${host}-delivery-events`, method: "evaluate_code"
            };
            const failureEvents = [{ type: "stream", text: "delivery owner events" }];
            const failureWithEvents = await executeRuntimeControlRequestWithDeadline(
                requestWithFailureEvents, async options => {
                    options.onResponseReceived({ ...requestWithFailureEvents, ok: true,
                        events: [{ type: "completion", evaluationOutcome: "success" }] });
                    return { ...requestWithFailureEvents, ok: false,
                        error: "fixture-delivery-failed", events: failureEvents };
                }
            );
            assert.equal(failureWithEvents.events, failureEvents,
                "Do not replace events explicitly supplied by the delivery owner.");
        }
        const prompt = createWebRPromptTransport({ writeConsole: () => {} });
        prompt.receivePrompt("DIALOGFORGE_PROMPT1:" + JSON.stringify({
            type: "prompt", id: "prompt", parent_id: "activity", prompt: "Answer:", password: false
        }));
        const reply = prompt.send({
            id: "large-timeout-reply", method: "reply_prompt",
            params: { parentId: "activity", timeoutMs: Number.MAX_VALUE }
        });
        assert.equal(timers.size, 1);
        assert.equal(timers.values().next().value.delay, 2147483527,
            "A large explicit reply timeout must not overflow into immediate transport retirement.");
        prompt.receive({ id: "large-timeout-reply", method: "reply_prompt", ok: true });
        assert.equal((await reply).ok, true);
        assert.equal(timers.size, 0);
        prompt.retire();
    } finally {
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
    }

    for (const relativePath of [
        "src/runtime/providers/r/protocol/runtimeControlClient.ts",
        "src/runtime/providers/webr/webRSharedRuntimeControl.ts"
    ]) {
        const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
        assert.ok(source.includes("executeRuntimeControlRequestWithDeadline("));
        assert.ok(source.includes("onResponseReceived?.(response)"),
            "Both adapters notify the SAME helper after validating a response.");
    }
    console.log("Shared deadline cases passed; actual host timeout/drain acceptance remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
