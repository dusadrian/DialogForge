"use strict";

const assert = require("node:assert/strict");
const { createRuntimeWorkspaceState } = require("../dist/src/runtime/session/runtimeWorkspaceState");
const { createRuntimeSessionManager } = require("../dist/src/runtime/session/runtimeSessionManager");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");

const ready = { providerId: "fixture", status: "ready", connection: "fixture", message: "Ready." };
const object = { name: "probe", kind: "number", detail: "1", capabilities: [] };

const checkWorkspaceState = function() {
    const state = createRuntimeWorkspaceState("fixture");
    assert.equal(state.createSnapshot(ready).freshness, "unread");
    state.remember([object], { session: "first", sequence: 1 });
    assert.equal(state.createSnapshot(ready).freshness, "fresh");

    const first = state.beginCommandReconciliation();
    const second = state.beginCommandReconciliation();
    assert.equal(state.createSnapshot(ready).freshness, "pending");
    assert.equal(state.getObjects(), null);
    assert.equal(state.createSnapshot(ready).objects[0].name, "probe");
    state.endCommandReconciliation(first);
    assert.equal(state.createSnapshot(ready).freshness, "pending");
    state.markStale();
    state.endCommandReconciliation(second);
    assert.equal(state.createSnapshot(ready).freshness, "stale");

    state.invalidate();
    const replacement = state.beginCommandReconciliation();
    state.endCommandReconciliation(second);
    assert.equal(state.createSnapshot(ready).freshness, "pending",
        "A retired command cannot release its successor's pending state");
    state.remember([object], { session: "second", sequence: 1 });
    state.endCommandReconciliation(replacement);
    assert.equal(state.createSnapshot(ready).freshness, "fresh");
    assert.equal(state.createSnapshot({ ...ready, status: "stopped" }).freshness, "unavailable");
};

const checkCommandFailure = async function() {
    let rejectCommand;
    const manager = createRuntimeSessionManager({
        manifest: { id: "fixture", capabilities: ["commands.visible"] },
        createSession: () => ({ ...ready, status: "not-started" }),
        workspaceController: {
            listWorkspaceObjects: async () => [object]
        },
        commandController: {
            executeVisibleCommand: () => new Promise((_resolve, reject) => {
                rejectCommand = reject;
            })
        }
    });

    await manager.start();
    await manager.listWorkspaceObjects();
    const command = manager.executeVisibleCommandWithEffects(
        createVisibleCommandRequest({ text: "probe <- 2", source: "freshness-fixture" })
    );
    assert.equal(manager.getSnapshot().status, "ready");
    assert.equal(manager.getWorkspaceSnapshot().freshness, "pending");
    rejectCommand(new Error("Lost response"));
    await assert.rejects(command, /Lost response/);
    assert.equal(manager.getSnapshot().status, "ready");
    assert.equal(manager.getWorkspaceSnapshot().freshness, "stale");
    assert.equal(manager.getWorkspaceSnapshot().objects[0].name, "probe");
};

const main = async function() {
    checkWorkspaceState();
    await checkCommandFailure();
    console.log("Workspace freshness: pending ownership, retained baseline, failure and lifecycle retirement.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
