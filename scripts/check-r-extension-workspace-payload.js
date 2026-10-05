"use strict";

const assert = require("node:assert/strict");
const { createRExtensionController } = require("../dist/src/runtime/providers/r/controllers/rExtensionController");
const { createRuntimeSessionManager } = require("../dist/src/runtime/session/runtimeSessionManager");
const { createWorkspaceObject } = require("../dist/src/runtime/workspace/workspaceProtocol");

const prepared = createWorkspaceObject({ name: "prepared", kind: "table", capabilities: ["tabular.read"] });
const revision = { session: "extension-fixture", sequence: 1 };
const empty = {
    added: [], updated: [], removed: [], objectCount: 1,
    datasets: { added: [], removed: [], changed: [], copied: [] },
    workspaceRevision: { ...revision, sequence: 2 }
};

const main = async function() {
    for (const host of ["r", "webr"]) {
        for (const field of ["workspaceUpdate", "workspace_update"]) {
            for (const update of [{ removed: ["prepared"] }, null, false, "not-json",
                { ...empty, workspaceRevision: undefined },
                { ...empty, removed: [null] }, { ...empty, datasets: {} },
                { ...empty, added: [{ name: " ", access_key: "prepared" }] },
                { ...empty, updated: [{ name: {}, access_key: "prepared" }] }]) {
                let calls = 0;
                let snapshotSequence = 1;
                let reply = { marker: "operation-completed", [field]: update };
                const client = { execute: async request => {
                    calls++;
                    return { id: request.id, method: request.method, ok: true, result: reply };
                } };
                const manager = createRuntimeSessionManager({
                    manifest: { id: host, capabilities: ["tabular.read"] },
                    createSession: () => ({ providerId: host, status: "not-started" }),
                    workspaceController: {
                        readWorkspaceSnapshot: async () => ({ status: "ready", providerId: host,
                            objects: [prepared], workspaceRevision: { ...revision, sequence: snapshotSequence } })
                    },
                    extensionController: createRExtensionController({ getClient: () => client,
                        createRequestId: () => "extension-fixture", interrupt: () => null })
                });
                await manager.start();
                await manager.listWorkspaceObjects();
                await manager.setActiveDataset("prepared");
                const result = await manager.executeRuntimeMethod({ method: "fixture", params: {} });
                assert.equal(result.status, "ready", "Keep the already-completed operation outcome.");
                assert.equal(result.value.marker, "operation-completed");
                assert.equal(result.workspaceUpdate, undefined,
                    host + ": malformed extension effects must not leave the shared R controller.");
                assert.equal(result.workspaceReconciliation, "failed");
                assert.equal(calls, 1, "Never replay an extension because its receipt failed.");
                const snapshot = manager.getWorkspaceSnapshot();
                assert.deepEqual(snapshot.objects.map(object => object.name), ["prepared"]);
                assert.equal(snapshot.freshness, "stale");
                assert.equal(manager.getActiveDataset().objectName, "prepared");
                reply = { marker: "no-effects" };
                const noEffects = await manager.executeRuntimeMethod({ method: "fixture", params: {} });
                assert.equal(noEffects.status, "ready");
                assert.equal(noEffects.workspaceReconciliation, undefined);
                snapshotSequence = 2;
                await manager.listWorkspaceObjects();
                assert.equal(manager.getWorkspaceSnapshot().freshness, "fresh");
                reply = { [field]: { ...empty, removed: ["prepared"], objectCount: 0,
                    workspaceRevision: { ...revision, sequence: 3 } } };
                const accepted = await manager.executeRuntimeMethod({ method: "fixture", params: {} });
                assert.equal(accepted.status, "ready");
                assert.deepEqual(manager.getWorkspaceSnapshot().objects, []);
                await manager.stop();
            }
        }
        let release;
        let snapshotSession = revision.session;
        const manager = createRuntimeSessionManager({
            manifest: { id: host, capabilities: ["tabular.read"] },
            createSession: () => ({ providerId: host, status: "not-started" }),
            workspaceController: {
                readWorkspaceSnapshot: async () => ({ status: "ready", providerId: host,
                    objects: [prepared], workspaceRevision: { ...revision, session: snapshotSession } })
            },
            extensionController: {
                executeRuntimeMethod: async () => new Promise(resolve => { release = resolve; })
            }
        });
        await manager.start();
        await manager.listWorkspaceObjects();
        const pending = manager.executeRuntimeMethod({ method: "fixture", params: {} });
        await manager.stop();
        snapshotSession = "replacement-fixture";
        await manager.start();
        await manager.listWorkspaceObjects();
        assert.equal(manager.getWorkspaceSnapshot().freshness, "fresh");
        release({ status: "ready", value: "old-operation-completed", workspaceReconciliation: "failed",
            workspaceUpdate: empty });
        const retired = await pending;
        assert.equal(retired.value, "old-operation-completed");
        assert.equal(retired.workspaceUpdate, undefined);
        assert.equal(retired.workspaceReconciliation, "not_checked");
        assert.equal(manager.getWorkspaceSnapshot().freshness, "fresh",
            "A retired receipt failure must not stale the replacement workspace.");
        await manager.stop();
    }
    console.log("SAME R extension receipt validation preserves operation outcomes, rejects malformed effects and recovers explicitly.");
};

main().catch(error => { console.error(error); process.exitCode = 1; });
