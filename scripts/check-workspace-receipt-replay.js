"use strict";

const assert = require("node:assert/strict");
const { createRuntimeWorkspaceState } = require("../dist/src/runtime/session/runtimeWorkspaceState");
const { createWorkspaceObject } = require("../dist/src/runtime/workspace/workspaceProtocol");
const { createWorkspaceRecoveryUpdate } = require("../dist/src/runtime/workspace/workspaceUpdate");

const state = createRuntimeWorkspaceState("r");
const session = { status: "ready", providerId: "r" };
const receipt = (sequence, session = "first") => ({ session, sequence });
const object = (detail) => createWorkspaceObject({ name: "probe", kind: "number", detail });
const update = (detail, sequence, session = "first") => ({
    added: [], updated: [object(detail)], removed: [],
    workspaceRevision: receipt(sequence, session)
});
const currentValue = () => state.createSnapshot(session).objects[0]?.detail;

const recoveredUpdate = createWorkspaceRecoveryUpdate({ objects: [
    object("old"), createWorkspaceObject({ name: "old_table", kind: "table" })
] }, { objects: [createWorkspaceObject({ name: "new_table", kind: "table" })],
    workspaceRevision: receipt(3) });
assert.deepEqual(recoveredUpdate.removed, ["probe", "old_table"]);
assert.deepEqual(recoveredUpdate.datasets.removed, ["old_table"]);
assert.equal(recoveredUpdate.datasets.changed[0].name, "new_table");
assert.equal(recoveredUpdate.datasets.changed[0].schemaChanged, true);
assert.deepEqual(recoveredUpdate.workspaceRevision, receipt(3));

state.remember([object("one")], receipt(1));
state.applyUpdate(update("two", 2));
state.applyUpdate(update("replayed", 2));
assert.equal(currentValue(), "two", "duplicate delta must not overwrite current objects");
state.applyUpdate(update("older", 1));
state.remember([object("old snapshot")], receipt(1));
assert.equal(currentValue(), "two", "older delta and snapshot must be ignored");
state.applyUpdate(update("foreign", 999, "foreign"));
state.remember([object("foreign snapshot")], receipt(999, "foreign"));
assert.equal(currentValue(), "two", "foreign session must require lifecycle invalidation");

state.markStale();
state.applyUpdate(update("duplicate after failure", 2));
assert.equal(state.getObjects(), null, "duplicate delta must not make a failed workspace fresh");
state.remember([object("two")], receipt(2));
assert.equal(state.getObjects(), null, "same-revision snapshot must not clear a later failed check");
state.remember([object("recovered")], receipt(3));
assert.equal(currentValue(), "recovered");
assert.equal(state.createSnapshot(session).status, "ready");

const generation = state.getGeneration();
state.invalidate();
assert.equal(state.getGeneration(), generation + 1);
state.applyUpdate(update("retired before new snapshot", 100));
assert.equal(state.getObjects(), null, "retired session must not populate a restarted workspace");
state.remember([object("new session")], receipt(1, "second"));
state.applyUpdate(update("retired after new snapshot", 101));
state.remember([object("retired snapshot")], receipt(102));
assert.equal(currentValue(), "new session");

const legacy = createRuntimeWorkspaceState("legacy");
legacy.remember([object("legacy")]);
legacy.markStale();
legacy.remember([object("legacy recovered")]);
assert.equal(legacy.getObjects()[0].detail, "legacy recovered");
const { createRuntimeWorkspaceOperationController } = require("../dist/src/runtime/workspace/runtimeWorkspaceOperationController");
const { createRuntimeActiveDatasetController } = require("../dist/src/runtime/session/runtimeActiveDatasetController");

const checkDelayedList = async function() {
    const workspaceState = createRuntimeWorkspaceState("r");
    workspaceState.remember([object("baseline")], receipt(1));
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const activeDatasetController = createRuntimeActiveDatasetController({
        workspaceState, getSnapshot: () => session, recordRuntimeEvent() {}
    });
    const controller = createRuntimeWorkspaceOperationController({
        workspaceListController: { list: () => pending },
        activeDatasetController,
        getSnapshot: () => session,
        getWorkspaceSnapshot: () => workspaceState.createSnapshot(session),
        getWorkspaceGeneration: workspaceState.getGeneration,
        recordRuntimeEvent() {}
    });
    const request = controller.listWorkspaceObjects();
    workspaceState.markStale();
    release({ status: "ready", providerId: "r", objects: [object("baseline")], workspaceRevision: receipt(1) });
    const result = await request;
    assert.equal(result.status, "unavailable", "delayed list must not report stale objects as ready");

    workspaceState.remember([object("newer")], receipt(3));
    const oldResult = await controller.listWorkspaceObjects();
    assert.equal(oldResult.objects[0].detail, "newer");
    assert.deepEqual(oldResult.workspaceRevision, receipt(3), "returned objects must carry their actual receipt");
};

const checkMutationReceipts = async function() {
    const workspaceState = createRuntimeWorkspaceState("r");
    workspaceState.remember([object("baseline")], receipt(1));
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    let renameCalls = 0;
    let clearCalls = 0;
    const activeDatasetController = createRuntimeActiveDatasetController({
        workspaceState, getSnapshot: () => session, recordRuntimeEvent() {}
    });
    const controller = createRuntimeWorkspaceOperationController({
        providerWorkspaceController: { removeWorkspaceObjects() {} },
        workspaceListController: {
            list: async () => ({
                status: "ready", providerId: "r",
                objects: [object("baseline")], workspaceRevision: receipt(1)
            })
        },
        workspaceMutationController: {
            remove: () => pending,
            rename: async () => { renameCalls += 1; return []; },
            clear: async () => { clearCalls += 1; return []; }
        },
        activeDatasetController,
        getSnapshot: () => session,
        getWorkspaceSnapshot: () => workspaceState.createSnapshot(session),
        getWorkspaceGeneration: workspaceState.getGeneration,
        recordRuntimeEvent() {}
    });

    const removal = controller.removeWorkspaceObjects(["probe"]);
    workspaceState.markStale();
    release({
        status: "ready", providerId: "r", objects: [],
        workspaceRevision: receipt(1)
    });
    assert.equal((await removal).status, "unavailable",
        "same-revision mutation result must not clear a newer stale flag");
    assert.equal(workspaceState.getObjects(), null);

    assert.equal((await controller.renameWorkspaceObject({
        oldName: "probe", newName: "renamed"
    })).status, "unavailable");
    assert.equal((await controller.clearWorkspace()).status, "unavailable");
    assert.equal(renameCalls, 0, "rename must stop after an unavailable preflight");
    assert.equal(clearCalls, 0, "clear must stop after an unavailable preflight");

    workspaceState.remember([object("newer")], receipt(3));
    const delayedRemoval = await controller.removeWorkspaceObjects(["probe"]);
    assert.equal(delayedRemoval.objects[0].detail, "newer");
    assert.deepEqual(delayedRemoval.workspaceRevision, receipt(3),
        "rejected mutation results must return the accepted state's receipt");
};

const { createRuntimeWorkspaceMutationController } = require("../dist/src/runtime/workspace/runtimeWorkspaceMutationController");

const checkMutationExceptions = async function() {
    for (const operation of ["remove", "rename", "clear"]) {
        const workspaceState = createRuntimeWorkspaceState("r");
        workspaceState.remember([object("baseline")], receipt(1));
        const failure = new Error("Snapshot failed after mutation");
        let calls = 0;
        let rejectMutation;
        const providerMutation = () => {
            calls += 1;
            return new Promise((resolve, reject) => { rejectMutation = reject; });
        };
        const controller = createRuntimeWorkspaceMutationController({
            providerWorkspaceController: {
                removeWorkspaceObjects: providerMutation,
                renameWorkspaceObject: providerMutation,
                clearWorkspace: providerMutation
            },
            getSnapshot: () => session,
            getWorkspaceGeneration: workspaceState.getGeneration,
            markWorkspaceStale: workspaceState.markStale
        });
        const invoke = () => operation === "remove"
            ? controller.remove(["probe"])
            : operation === "rename"
            ? controller.rename({ oldName: "probe", newName: "renamed" })
            : controller.clear();

        const pending = invoke();
        const rejected = assert.rejects(pending, (error) => error === failure);
        rejectMutation(failure);
        await rejected;
        assert.equal(calls, 1, operation + " must not retry after an exception");
        assert.equal(workspaceState.getObjects(), null);
        workspaceState.remember([object("old")], receipt(1));
        assert.equal(workspaceState.getObjects(), null,
            "old snapshots must not recover a failed mutation");
        workspaceState.applyUpdate({
            added: [], updated: [], removed: [], workspaceRevision: receipt(2)
        });
        assert.equal(workspaceState.getObjects(), null,
            "an empty delta cannot repair a possibly missed mutation commit");
        workspaceState.remember([object("recovered")], receipt(2));
        assert.equal(workspaceState.getObjects()[0].detail, "recovered");

        const events = [];
        const operations = createRuntimeWorkspaceOperationController({
            providerWorkspaceController: {
                removeWorkspaceObjects() {}, renameWorkspaceObject() {}
            },
            workspaceListController: {
                list: async () => workspaceState.createSnapshot(session)
            },
            workspaceMutationController: controller,
            activeDatasetController: createRuntimeActiveDatasetController({
                workspaceState, getSnapshot: () => session, recordRuntimeEvent() {}
            }),
            getSnapshot: () => session,
            getWorkspaceSnapshot: () => workspaceState.createSnapshot(session),
            getWorkspaceGeneration: workspaceState.getGeneration,
            recordRuntimeEvent: (...args) => events.push(args)
        });
        const uncertain = operation === "remove"
            ? operations.removeWorkspaceObjects(["probe"])
            : operation === "rename"
            ? operations.renameWorkspaceObject({ oldName: "probe", newName: "renamed" })
            : operations.clearWorkspace();
        // Rename/clear first await the required workspace read.
        for (let turn = 0; turn < 10 && calls < 2; turn += 1) {
            await Promise.resolve();
        }
        assert.equal(calls, 2, "mutation must follow the ready preflight");
        rejectMutation(failure);
        const outcome = await uncertain;
        assert.equal(outcome.status, "uncertain");
        assert.equal(outcome.objects[0].detail, "recovered");
        assert.match(outcome.message, /may already have been applied/);
        assert.equal(events.length, 1);
        assert.equal(events[0][0], "workspace.mutation.uncertain");
        assert.equal(events[0][3].error, failure.message);
        assert.equal(workspaceState.getObjects(), null);
        assert.equal(calls, 2);

        const oldSessionMutation = invoke();
        const oldSessionRejected = assert.rejects(
            oldSessionMutation, (error) => error === failure
        );
        workspaceState.invalidate();
        workspaceState.remember([object("new session")], receipt(1, "second"));
        rejectMutation(failure);
        await oldSessionRejected;
        assert.equal(workspaceState.getObjects()[0].detail, "new session",
            "retired-session failures must not mark the new session stale");
        assert.equal(calls, 3);
    }

    const workspaceState = createRuntimeWorkspaceState("legacy");
    workspaceState.remember([object("baseline")]);
    const failure = new Error("Partial fallback removal");
    const removed = [];
    const fallback = createRuntimeWorkspaceMutationController({
        fallbackState: {
            remove(name) {
                if (name === "second") {
                    throw failure;
                }
                removed.push(name);
            }
        },
        getSnapshot: () => session,
        getWorkspaceGeneration: workspaceState.getGeneration,
        markWorkspaceStale: workspaceState.markStale
    });
    await assert.rejects(fallback.remove(["first", "second"]), (error) => error === failure);
    assert.deepEqual(removed, ["first"]);
    assert.equal(workspaceState.getObjects(), null);
};

checkDelayedList().then(checkMutationReceipts).then(checkMutationExceptions).then(() => {
    console.log("Workspace receipt replay, mutation exceptions, delayed results, stale recovery, session retirement and legacy compatibility passed.");
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
