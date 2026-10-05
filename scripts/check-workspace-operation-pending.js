"use strict";

const assert = require("node:assert/strict");
const { createRuntimeSessionManager } = require("../dist/src/runtime/session/runtimeSessionManager");
const { createRuntimeWorkspaceState } = require("../dist/src/runtime/session/runtimeWorkspaceState");

const object = (name) => ({ name, kind: "table", detail: "fixture", capabilities: ["tabular.read"] });
const waitUntil = async function(condition) {
    for (let attempt = 0; attempt < 30 && !condition(); attempt += 1) {
        await Promise.resolve();
    }
    assert.ok(condition(), "Expected dispatch was not reached");
};

const main = async function() {
    const ready = { providerId: "fixture", status: "ready" };
    const state = createRuntimeWorkspaceState("fixture");
    state.remember([object("probe")]);
    const one = state.beginCommandReconciliation();
    assert.equal(state.createSnapshot(ready).freshness, "pending");
    assert.equal(state.createSnapshot(ready, one).freshness, "fresh");
    const two = state.beginCommandReconciliation();
    assert.equal(state.createSnapshot(ready, one).freshness, "pending", "Excluding one owner cannot hide another");
    state.invalidate();
    const replacement = state.beginCommandReconciliation();
    state.endCommandReconciliation(one);
    state.endCommandReconciliation(two);
    assert.equal(state.createSnapshot(ready, one).freshness, "pending");
    state.endCommandReconciliation(replacement);

    for (const operation of ["remove", "rename", "clear"]) {
        let objects = [object("probe")];
        const mutations = [];
        const mutate = () => new Promise((resolve, reject) => mutations.push({ resolve, reject }));
        const manager = createRuntimeSessionManager({
            manifest: { id: "fixture", capabilities: [] },
            createSession: () => ({ ...ready, status: "not-started", connection: "fixture" }),
            workspaceController: {
                listWorkspaceObjects: async () => objects,
                removeWorkspaceObjects: mutate,
                renameWorkspaceObject: mutate,
                clearWorkspace: mutate
            }
        });
        const invoke = () => operation === "remove"
            ? manager.removeWorkspaceObjects(["probe"])
            : operation === "rename"
                ? manager.renameWorkspaceObject({ oldName: "probe", newName: "renamed", source: "fixture" })
                : manager.clearWorkspace();
        await manager.start();
        await manager.listWorkspaceObjects();
        await manager.setActiveDataset("probe");
        const first = invoke();
        await waitUntil(() => mutations.length === 1);
        assert.equal(manager.getWorkspaceSnapshot().freshness, "pending");
        assert.equal((await manager.readTabularSchema("probe")).status, "unavailable");
        objects = operation === "rename" ? [object("renamed")] : [];
        mutations[0].resolve(objects);
        const result = await first;
        assert.equal(result.status, "ready");
        assert.equal(result.freshness, "fresh");
        assert.equal(manager.getWorkspaceSnapshot().freshness, "fresh");
        assert.equal(manager.getActiveDataset().objectName, operation === "rename" ? "renamed" : "");

        objects = [object("probe")];
        await manager.listWorkspaceObjects();
        const failing = invoke();
        await waitUntil(() => mutations.length === 2);
        mutations[1].reject(new Error("Lost mutation snapshot"));
        const uncertain = await failing;
        assert.equal(uncertain.status, "uncertain");
        assert.equal(uncertain.freshness, "stale");
        assert.equal(manager.getWorkspaceSnapshot().freshness, "stale");
        assert.equal(mutations.length, 2, "Uncertain mutations must not be replayed");

        await manager.stop();
        await manager.start();
        await manager.listWorkspaceObjects();
        const retiring = invoke();
        await waitUntil(() => mutations.length === 3);
        await manager.stop();
        await manager.start();
        await manager.listWorkspaceObjects();
        const current = invoke();
        await waitUntil(() => mutations.length === 4);
        mutations[2].resolve([]);
        assert.equal((await retiring).status, "unavailable");
        assert.equal(manager.getWorkspaceSnapshot().freshness, "pending");
        mutations[3].resolve(operation === "rename" ? [object("renamed")] : []);
        await current;
        assert.equal(manager.getWorkspaceSnapshot().freshness, "fresh");
    }
    console.log("Workspace operations: pending ownership, accepted active-dataset effects, uncertainty and retirement.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
