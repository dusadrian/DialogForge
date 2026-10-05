"use strict";

const assert = require("node:assert/strict");
const { createDatasetOpeningController } = require(
    "../dist/src/dataset-editor/renderer/datasetOpeningController"
);
const { createDatasetOpeningCoordinator } = require(
    "../dist/src/dataset-editor/state/datasetOpeningCoordinator"
);


const checkFallback = async function(retireAt) {
    let release;
    let fallbackStarted;
    const held = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { fallbackStarted = resolve; });
    const effects = [];
    let controller;
    const record = function(name) {
        effects.push(name);
        if (name === retireAt) {
            controller.invalidate();
        }
    };
    controller = createDatasetOpeningController({
        initialRowCount: 40,
        normalizeDatasetName: value => String(value || "").trim(),
        prepareDataset: () => record("prepare"),
        showEmptyDataset: () => record("empty"),
        showInitialLoading: () => record("initial-loading"),
        showContentLoading: () => record("content-loading"),
        hideLoading: () => record("hide"),
        fetchInitialPage: async () => null,
        fetchSchema: async () => ({ rowCount: 100, columnCount: 2 }),
        applyInitialPage: () => assert.fail("Fixture has no initial page"),
        applySchema: () => record("schema"),
        loadFallbackPage: () => { record("fallback"); fallbackStarted(); return held; },
        showSchemaFailure: () => record("failure"),
        startVariableWarmup: () => record("warm"),
        queueViewportRefresh: () => record("refresh")
    });
    const pending = controller.open("data");
    if (retireAt === "during-fallback" || !retireAt) {
        await started;
        if (retireAt) {
            controller.invalidate();
        }
    }
    release();
    await pending;
    const normal = ["prepare", "initial-loading", "schema", "content-loading", "fallback", "warm", "refresh", "hide"];
    const expected = !retireAt ? normal
        : retireAt === "during-fallback" ? normal.slice(0, 5)
        : normal.slice(0, normal.indexOf(retireAt) + 1);
    assert.deepEqual(effects, expected);
};


const createOpeningReplay = function(fetchSchema, showSchemaFailure = () => {}) {
    let reads = 0;
    const applied = [];
    const controller = createDatasetOpeningController({
        initialRowCount: 40,
        normalizeDatasetName: value => String(value || "").trim(),
        prepareDataset() {}, showEmptyDataset() {}, showInitialLoading() {},
        showContentLoading() {}, hideLoading() {},
        fetchInitialPage: async () => null,
        fetchSchema: async name => { reads += 1; return fetchSchema(name, reads); },
        applyInitialPage() {},
        applySchema: name => applied.push(name),
        loadFallbackPage: async () => {},
        showSchemaFailure,
        startVariableWarmup() {}, queueViewportRefresh() {}
    });
    return { controller, applied, reads: () => reads };
};


const checkWorkspaceRecovery = async function() {
    const schema = { rowCount: 3, columnCount: 1 };
    const normal = createOpeningReplay(async () => schema);
    await normal.controller.open("current");
    await normal.controller.retryAfterWorkspaceUpdate(["current"]);
    assert.equal(normal.reads(), 1, "Healthy first paint must not reload on workspace publication");

    const failed = createOpeningReplay(async (_name, reads) => reads === 1 ? null : schema);
    await failed.controller.open("current");
    await failed.controller.retryAfterWorkspaceUpdate(["other"]);
    assert.equal(failed.reads(), 1, "A missing dataset must not be retried from an unrelated list");
    await failed.controller.retryAfterWorkspaceUpdate(["current", "other"]);
    assert.deepEqual(failed.applied, ["current"]);
    assert.equal(failed.reads(), 2, "An authoritative workspace publication retries the failed opening once");
    await failed.controller.retryAfterWorkspaceUpdate(["current"]);
    assert.equal(failed.reads(), 2, "Recovered first paint must not be repeatedly refreshed");

    const retired = createOpeningReplay(async () => null);
    await retired.controller.open("old");
    retired.controller.invalidate();
    await retired.controller.retryAfterWorkspaceUpdate(["old"]);
    assert.equal(retired.reads(), 1, "Runtime retirement must discard the failed opening owner");

    const switched = createOpeningReplay(async name => name === "old" ? null : schema);
    await switched.controller.open("old");
    await switched.controller.open("new");
    await switched.controller.retryAfterWorkspaceUpdate(["old", "new"]);
    assert.deepEqual(switched.applied, ["new"]);
    assert.equal(switched.reads(), 2, "An old failed dataset must not take over a later selection");

    let release;
    let entered;
    const held = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const duringRead = createOpeningReplay(async (_name, reads) => {
        if (reads === 1) {
            entered();
            return held;
        }
        return schema;
    });
    const pending = duringRead.controller.open("current");
    await started;
    await duringRead.controller.retryAfterWorkspaceUpdate(["current"]);
    assert.equal(duringRead.reads(), 1, "Workspace publication must not duplicate a still-pending opening");
    release(null);
    await pending;
    assert.deepEqual(duringRead.applied, ["current"]);
    assert.equal(duringRead.reads(), 2, "A fresh publication during the rejected read must not be missed");

    let retireOnFailure;
    const reentrant = createOpeningReplay(async () => null, () => retireOnFailure());
    retireOnFailure = () => reentrant.controller.invalidate();
    await reentrant.controller.open("current");
    await reentrant.controller.retryAfterWorkspaceUpdate(["current"]);
    assert.equal(reentrant.reads(), 1, "Failure rendering may retire the opening before retry admission");
};


const main = async function() {
    for (const stage of ["schema", "content-loading", "during-fallback", "warm", null]) {
        await checkFallback(stage);
    }
    let reads = 0;
    let coordinator;
    coordinator = createDatasetOpeningCoordinator({
        fetchInitialPage: async () => ({ columns: [{ name: "x" }] }),
        fetchSchema: async () => { reads += 1; return {}; },
        canApplyInitialPage: () => true,
        applyInitialPage: () => coordinator.invalidate()
    });
    const result = await coordinator.open("data", 40);
    assert.equal(result.stale, true);
    assert.equal(reads, 0, "Retirement during first paint must prevent old schema dispatch");
    await checkWorkspaceRecovery();
    console.log("Shared opening retirement cases passed (controlled controller, not real first-paint acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
