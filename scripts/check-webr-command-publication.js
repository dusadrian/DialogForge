"use strict";

const assert = require("node:assert/strict");
const { createBrowserWebRSession } = require("../dist/src/runtime/providers/webr/webRBrowserSession");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");

const fixture = function() {
    const calls = [];
    const transcript = [];
    const effects = [];
    let current = true;
    const session = createBrowserWebRSession({
        isCurrentSession: () => current,
        runtimeControlClient: {
            execute: (request, options) => {
                assert.equal(request.method, "execute_input", "Unexpected recovery query");
                options?.onDispatched?.();
                return new Promise((resolve) => calls.push({ request, resolve }));
            },
            detach() {}
        },
        visibleCommands: {
            readConsoleOutputWidth: () => 80,
            recordTranscriptEvents: (events) => transcript.push(...events)
        },
        runtimeMethods: {
            checkCodeFragmentComplete: async () => "complete",
            setRuntimeStatus() {}, setRuntimeBusy() {}, renderToolbar() {},
            getRuntime: () => null
        },
        workspaceChanged: async (update) => effects.push(update)
    });
    const finish = function(index) {
        const { request, resolve } = calls[index];
        const parent = request.params.parentId;
        resolve({
            ok: true,
            events: [
                { type: "input", parent_id: parent, code: request.params.code },
                { type: "stream", parent_id: parent, text: "output" },
                { type: "completion", parent_id: parent, state: "idle", workspaceReconciliation: "unchanged" }
            ]
        });
    };
    return { session, calls, transcript, effects, finish, retire: () => { current = false; } };
};

const until = async function(condition) {
    for (let count = 0; count < 30 && !condition(); count += 1) {
        await Promise.resolve();
    }
    assert.ok(condition());
};

const main = async function() {
    assert.equal(createVisibleCommandRequest({ text: "1", activityId: "owned" }).activityId, "owned");
    const normal = fixture();
    const first = normal.session.executeVisibleCommand("1", { activityId: "one" });
    const second = normal.session.executeVisibleCommand("2", { activityId: "two" });
    assert.equal(normal.calls.length, 1);
    assert.equal(normal.calls[0].request.params.parentId, "one", "Queue copying must preserve console activity");
    normal.finish(0);
    assert.equal((await first).ok, true);
    assert.ok(normal.transcript.some((event) => {
        return event.type === "submitted" && event.parentId === "one";
    }), "Accepted input must reach the shared transcript router.");
    await until(() => normal.calls.length === 2);
    assert.equal(normal.calls[1].request.params.parentId, "two");
    normal.finish(1);
    assert.equal((await second).ok, true);
    assert.ok(normal.transcript.some((event) => event.parentId === "two"));

    const replaced = fixture();
    const oldResult = replaced.session.executeVisibleCommand("1", { activityId: "old" });
    replaced.retire();
    const beforeRetiredResult = replaced.transcript.slice();
    replaced.finish(0);
    assert.equal((await oldResult).ok, false);
    assert.deepEqual(replaced.transcript, beforeRetiredResult);
    assert.deepEqual(replaced.effects, []);

    const stopped = fixture();
    const running = stopped.session.executeVisibleCommand("1", { activityId: "running" });
    const queued = stopped.session.executeVisibleCommand("2", { activityId: "queued" });
    await stopped.session.runtimeSessionManager.stop();
    const beforeStoppedResult = stopped.transcript.slice();
    stopped.finish(0);
    assert.equal((await running).ok, false);
    assert.equal((await queued).ok, false);
    assert.equal(stopped.calls.length, 1);
    assert.deepEqual(stopped.transcript, beforeStoppedResult);
    assert.deepEqual(stopped.effects, []);
    console.log("WebR publication: copied activity identity, FIFO and retired-session isolation.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
