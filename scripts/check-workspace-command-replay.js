"use strict";

const assert = require("node:assert/strict");
const { createRuntimeSessionManager } = require("../dist/src/runtime/session/runtimeSessionManager");
const { createVisibleCommandRequest, createTranscriptEvent } = require("../dist/src/runtime/commands/commandProtocol");
const { createWorkspaceObject } = require("../dist/src/runtime/workspace/workspaceProtocol");

const main = async function() {
    let session = "first";
    let nextUpdate;
    let release;
    const table = createWorkspaceObject({
        name: "probe", kind: "table", detail: "current", capabilities: ["tabular.read"]
    });
    const delta = function(sequence, sessionId = session, removed = false) {
        return {
            added: [], updated: removed ? [] : [table], removed: removed ? ["probe"] : [],
            workspaceRevision: { session: sessionId, sequence },
            datasets: { added: [], removed: removed ? ["probe"] : [], changed: [], copied: [] },
            objectCount: removed ? 0 : 1, updatedAt: Date.now()
        };
    };
    const manager = createRuntimeSessionManager({
        manifest: { id: "replay", label: "Replay fixture", capabilities: ["commands.visible"] },
        createSession: () => ({ providerId: "replay", status: "not-started" }),
        workspaceController: {
            listWorkspaceObjects: async () => [table],
            readWorkspaceSnapshot: async () => ({
                status: "ready", providerId: "replay", objects: [table],
                workspaceRevision: { session, sequence: 1 }
            })
        },
        commandController: {
            executeVisibleCommand: async function(request) {
                const update = request.text === "delayed"
                    ? await new Promise((resolve) => { release = resolve; })
                    : nextUpdate;
                return {
                    transcriptEvents: [createTranscriptEvent("completed", request)],
                    workspaceReconciliation: "updated",
                    workspaceUpdate: update
                };
            }
        }
    });
    const execute = (text) => manager.executeVisibleCommandWithEffects(
        createVisibleCommandRequest({ text, source: "command-replay-acceptance" })
    );
    const updateEvents = async () => (await manager.listRuntimeEvents()).events
        .filter((event) => event.type === "workspace.update");
    const assertRejected = async function(result, count) {
        assert.equal(result.workspaceUpdate, null, "Rejected deltas must not reach host cache/render effects");
        assert.equal(result.transcriptEvents[0].type, "completed", "Keep the command outcome");
        assert.equal((await updateEvents()).length, count, "Rejected deltas must not enter event history");
        assert.deepEqual(manager.getWorkspaceSnapshot().objects.map((entry) => entry.name), ["probe"]);
        assert.equal(manager.getActiveDataset().objectName, "probe");
    };

    await manager.start();
    await manager.listWorkspaceObjects();
    await manager.setActiveDataset("probe");
    const delayed = execute("delayed");
    nextUpdate = delta(3);
    const newer = execute("newer");
    const delayedUpdate = delta(2);
    release(delayedUpdate);
    assert.deepEqual((await delayed).workspaceUpdate, delayedUpdate);
    assert.deepEqual((await newer).workspaceUpdate, nextUpdate);
    let count = (await updateEvents()).length;
    assert.equal(count, 2, "Queued commands publish their accepted updates in order");

    for (const update of [delta(2, "first", true), delta(3, "first", true), delta(50, "foreign", true)]) {
        nextUpdate = update;
        await assertRejected(await execute("replayed"), count);
    }
    release = undefined;
    const retired = execute("delayed");
    for (let attempt = 0; attempt < 30 && !release; attempt += 1) {
        await Promise.resolve();
    }
    assert.equal(typeof release, "function", "The running command must start before retiring its session");
    await manager.stop();
    session = "second";
    await manager.start();
    await manager.listWorkspaceObjects();
    await manager.setActiveDataset("probe");
    count = (await updateEvents()).length;
    release(delta(99, "first", true));
    await assertRejected(await retired, count);
    nextUpdate = delta(100, "first", true);
    await assertRejected(await execute("retired receipt"), count);
    nextUpdate = delta(2);
    assert.deepEqual((await execute("current session")).workspaceUpdate, nextUpdate);
    assert.equal((await updateEvents()).length, count + 1);
    await manager.stop();
    console.log("Command replay: old, duplicate, foreign and retired deltas suppress host effects/events while preserving command outcomes and current selection.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
