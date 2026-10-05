"use strict";

const assert = require("node:assert/strict");
const { createRuntimeSessionManager } = require("../dist/src/runtime/session/runtimeSessionManager");
const { createWorkspaceObject } = require("../dist/src/runtime/workspace/workspaceProtocol");

const createFixture = async function(host) {
    const reads = [];
    const objects = ["first", "second"].map((name) => createWorkspaceObject({
        name, kind: "table", capabilities: ["tabular.read"]
    }));
    const manager = createRuntimeSessionManager({
        manifest: { id: host, capabilities: [] },
        createSession: () => ({
            providerId: host, status: "not-started", connection: "fixture", message: "Ready."
        }),
        workspaceController: {
            listWorkspaceObjects: async () => objects,
            readWorkspaceSnapshot: () => new Promise((resolve, reject) => {
                reads.push({ resolve, reject });
            })
        }
    });
    await manager.start();
    const reply = (sequence, session = "initial") => ({
        status: "ready", providerId: host, objects,
        workspaceRevision: sequence === undefined ? undefined : { session, sequence }
    });
    return { manager, reads, reply };
};

const main = async function() {
    for (const host of ["r", "webr"]) {
        const { manager, reads, reply } = await createFixture(host);
        const older = manager.setActiveDataset("first");
        const newer = manager.setActiveDataset("second");
        reads[1].resolve(reply(2));
        assert.equal((await newer).objectName, "second");
        const accepted = manager.getActiveDataset();
        reads[0].resolve(reply(1));
        assert.deepEqual(await older, accepted);
        assert.deepEqual(manager.getActiveDataset(), accepted,
            "A delayed older request must not change authoritative selection.");

        for (const sequence of [1, 2, undefined]) {
            const clearing = await createFixture(host);
            const beforeClear = clearing.manager.setActiveDataset("second");
            const clear = clearing.manager.setActiveDataset("");
            clearing.reads[1].resolve(clearing.reply(2));
            assert.equal((await clear).status, "none");
            const cleared = clearing.manager.getActiveDataset();
            clearing.reads[0].resolve(clearing.reply(sequence));
            assert.deepEqual(await beforeClear, cleared);
            assert.deepEqual(clearing.manager.getActiveDataset(), cleared,
                "Older, equal-revision and legacy replies cannot undo newer clear intent.");
        }

        const rejectedRead = await createFixture(host);
        const baseline = rejectedRead.manager.listWorkspaceObjects();
        rejectedRead.reads[0].resolve(rejectedRead.reply(2));
        await baseline;
        assert.equal(rejectedRead.manager.getActiveDataset().objectName, "first",
            "An accepted baseline retains the ordinary first-dataset fallback.");
        await rejectedRead.manager.setActiveDataset("");
        const clearBeforeRead = rejectedRead.manager.getActiveDataset();
        const obsolete = rejectedRead.manager.listWorkspaceObjects();
        rejectedRead.reads[1].resolve(rejectedRead.reply(1));
        const acceptedWorkspace = await obsolete;
        assert.equal(acceptedWorkspace.workspaceRevision.sequence, 2);
        assert.deepEqual(rejectedRead.manager.getActiveDataset(), clearBeforeRead,
            "A rejected read must not select a fallback even without an intervening selection.");
        const fresh = rejectedRead.manager.listWorkspaceObjects();
        rejectedRead.reads[2].resolve(rejectedRead.reply(3));
        await fresh;
        assert.equal(rejectedRead.manager.getActiveDataset().objectName, "first",
            "A later accepted refresh keeps the existing intentional fallback behavior.");

        const stopping = await createFixture(host);
        const beforeStop = stopping.manager.setActiveDataset("second");
        await stopping.manager.stop();
        const stoppedSelection = stopping.manager.getActiveDataset();
        stopping.reads[0].resolve(stopping.reply(1));
        assert.deepEqual(await beforeStop, stoppedSelection,
            "A retired request must not mutate selection during shutdown.");

        const restarting = await createFixture(host);
        const retired = restarting.manager.setActiveDataset("first");
        await restarting.manager.stop();
        await restarting.manager.start();
        const replacement = restarting.manager.setActiveDataset("second");
        restarting.reads[1].resolve(restarting.reply(1, "replacement"));
        await replacement;
        const replacementSelection = restarting.manager.getActiveDataset();
        restarting.reads[0].resolve(restarting.reply(10));
        assert.deepEqual(await retired, replacementSelection);
        assert.deepEqual(restarting.manager.getActiveDataset(), replacementSelection);

        const failing = await createFixture(host);
        const staleFailure = failing.manager.setActiveDataset("first");
        const succeeding = failing.manager.setActiveDataset("second");
        failing.reads[1].resolve(failing.reply(2));
        await succeeding;
        failing.reads[0].reject(new Error("Retired workspace read failed."));
        assert.deepEqual(await staleFailure, failing.manager.getActiveDataset());

        const unavailable = await createFixture(host);
        const requested = unavailable.manager.setActiveDataset("first");
        const before = unavailable.manager.getActiveDataset();
        unavailable.reads[0].resolve({
            status: "unavailable", providerId: host, objects: [], message: "Read failed."
        });
        assert.deepEqual(await requested, before,
            "An unavailable workspace must not authorize an unchecked selection.");

        const liveFailure = await createFixture(host);
        const live = liveFailure.manager.setActiveDataset("first");
        liveFailure.reads[0].reject(new Error("Current read failed."));
        await assert.rejects(live, /Current read failed/);
    }
    console.log("Shared selection request ordering cases passed; real host acceptance remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
