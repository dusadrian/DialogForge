"use strict";

const assert = require("node:assert/strict");
const { createRuntimeSessionManager } = require("../dist/src/runtime/session/runtimeSessionManager");
const { createRuntimeExtensionMethodRequest } = require("../dist/src/runtime/extensions/runtimeExtensionProtocol");
const { applyRuntimeDatasetVariablePatch } = require("../dist/src/runtime/tabular-data/runtimeDatasetVariablePatch");
const { createWorkspaceObject } = require("../dist/src/runtime/workspace/workspaceProtocol");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");

const checkMutationBaseline = async function(options = {}) {
    const table = createWorkspaceObject({
        name: "probe", kind: "table", capabilities: ["tabular.read"]
    });
    let storedType = "integer";
    let baselineType = "integer";
    let commits = 0;
    let writes = 0;
    let snapshotReads = 0;
    let revisionSequence = 1;
    let release;
    const delta = function(sequence) {
        return {
            added: [], updated: [table], removed: [], objectCount: 1,
            workspaceRevision: { session: "extension-mutation", sequence },
            datasets: {
                added: [], removed: [], copied: [],
                changed: [{ name: "probe", kind: "dataset_variable_meta_changed", columns: ["value"] }]
            }
        };
    };
    const manager = createRuntimeSessionManager({
        manifest: { id: "extension-mutation", capabilities: ["tabular.read", "commands.visible"] },
        createSession: () => ({ providerId: "extension-mutation", status: "not-started" }),
        workspaceController: {
            readWorkspaceSnapshot: async function() {
                snapshotReads += 1;
                return {
                    status: "ready", objects: [table],
                    workspaceRevision: { session: "extension-mutation", sequence: revisionSequence }
                };
            },
            commitWorkspaceMutation: async function() {
                commits += 1;
                if (options.commitFails) {
                    throw Error("Scoped commit failure after the write");
                }
                baselineType = storedType;
                revisionSequence = 2;
                return delta(2);
            }
        },
        commandController: {
            executeVisibleCommand: async function() {
                revisionSequence = 3;
                return {
                    transcriptEvents: [],
                    workspaceReconciliation: "unchanged",
                    workspaceUpdate: {
                        ...delta(3), updated: [],
                        datasets: { added: [], removed: [], copied: [], changed: [] }
                    }
                };
            }
        },
        extensionController: {
            executeRuntimeMethod: async function(request) {
                if (request.method !== "workspace.dataset_update_variable") {
                    return { status: "ready", value: "read only" };
                }
                assert.equal(request.workspaceEffect, "mutation");
                writes += 1;
                storedType = request.params.type;
                const result = { status: "ready", value: { name: "value", type: storedType } };
                if (options.delayed) {
                    return new Promise(resolve => { release = () => resolve(result); });
                }
                if (options.hasReceipt) {
                    baselineType = storedType;
                    revisionSequence = 2;
                    return { ...result, workspaceUpdate: delta(2) };
                }
                if (options.failedReceipt) {
                    return { ...result, workspaceReconciliation: "failed" };
                }
                return result;
            }
        }
    });
    await manager.start();
    await manager.listWorkspaceObjects();
    await manager.executeRuntimeMethod(createRuntimeExtensionMethodRequest({ method: "read" }));
    assert.equal(commits, 0, "Read-only extensions must not acquire mutation commits");
    const patch = applyRuntimeDatasetVariablePatch(manager, {
        name: "probe", variableName: "value", type: "character"
    });
    if (options.delayed) {
        assert.equal(manager.getWorkspaceSnapshot().freshness, "pending");
        await manager.stop();
        await manager.start();
        release();
    }
    const result = await patch;
    assert.equal(result.value.type, "character", "Keep the already-executed mutation result");
    assert.equal(writes, 1, "A missing or failed commit must never repeat the write");
    assert.equal(commits, options.delayed || options.hasReceipt || options.failedReceipt ? 0 : 1);
    if (options.commitFails || options.failedReceipt) {
        assert.equal(manager.getWorkspaceSnapshot().freshness, "stale");
        assert.equal(baselineType, "integer");
        storedType = "integer";
        const recovered = await manager.executeVisibleCommandWithEffects(
            createVisibleCommandRequest({ text: "restore-original-type", source: "extension-mutation" })
        );
        assert.equal(snapshotReads, 2, "Failed mutation commits require a full recovery snapshot");
        assert.equal(recovered.workspaceUpdate.datasets.changed[0].kind, "dataset_structure_changed",
            "An empty later delta must still invalidate the intervening warm metadata patch");
        assert.equal(manager.getWorkspaceSnapshot().freshness, "fresh");
        assert.equal(writes, 1, "Recovery must never replay the completed write");
    }
    else if (!options.delayed) {
        assert.equal(baselineType, "character", "Commit the GUI type before returning its patch");
        assert.equal(manager.getWorkspaceSnapshot().freshness, "fresh");
        storedType = "integer";
        assert.notEqual(storedType, baselineType, "Restoring the original type must remain detectable");
    }
    await manager.stop();
};

const main = async function() {
    await checkMutationBaseline();
    await checkMutationBaseline({ hasReceipt: true });
    await checkMutationBaseline({ commitFails: true });
    await checkMutationBaseline({ failedReceipt: true });
    await checkMutationBaseline({ delayed: true });
    console.log("Shared extension mutation baseline: commit, receipt, failed refresh/recovery and retirement cases passed.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
