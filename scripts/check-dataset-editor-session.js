"use strict";

const assert = require("node:assert/strict");
const { createDatasetEditorSessionController } = require(
    "../dist/src/dataset-editor/renderer/datasetEditorSessionController"
);


const ready = { providerId: "fixture", lifecycleGeneration: 1, status: "ready",
    connection: "fixture", message: "Ready" };

const main = async function() {
    const effects = [];
    const controller = createDatasetEditorSessionController({
        invalidatePending: () => effects.push("invalidate"),
        getDatasetName: () => "data",
        refreshDataset: async name => effects.push(["refresh", name])
    });
    await controller.initialize(async () => ready);
    assert.deepEqual(effects, [], "Baseline read must not interrupt normal first paint");
    await controller.update({ ...ready, message: "Diagnostics changed" });
    assert.deepEqual(effects, []);
    await controller.update({ ...ready, lifecycleGeneration: 2, status: "starting" });
    assert.deepEqual(effects, ["invalidate"]);
    await controller.update({ ...ready, lifecycleGeneration: 2 });
    assert.deepEqual(effects, ["invalidate", ["refresh", "data"]]);
    await controller.update({ ...ready, lifecycleGeneration: 2 });
    assert.equal(effects.length, 2, "Duplicate ready must not cause another refresh");
    await controller.update({ ...ready, lifecycleGeneration: 2, status: "stopped" });
    assert.equal(effects.at(-1), "invalidate");
    await controller.update({ ...ready, providerId: "replacement", lifecycleGeneration: 2 });
    assert.deepEqual(effects.slice(-2), ["invalidate", ["refresh", "data"]]);

    let release;
    const held = new Promise(resolve => { release = resolve; });
    const raceEffects = [];
    const raced = createDatasetEditorSessionController({
        invalidatePending: () => raceEffects.push("invalidate"),
        getDatasetName: () => "data",
        refreshDataset: async () => raceEffects.push("refresh")
    });
    const baseline = raced.initialize(() => held);
    await raced.update({ ...ready, lifecycleGeneration: 2 });
    release(ready);
    await baseline;
    await raced.update({ ...ready, lifecycleGeneration: 2 });
    assert.deepEqual(raceEffects, ["invalidate", "refresh"], "Late initial read must not replace newer event identity");
    await raced.initialize(async () => assert.fail("Known event identity needs no initial read"));

    const empty = createDatasetEditorSessionController({
        invalidatePending: () => {},
        getDatasetName: () => "",
        refreshDataset: async () => assert.fail("No dataset must not start refresh")
    });
    await empty.update(ready);

    let reentrant;
    let retired = false;
    reentrant = createDatasetEditorSessionController({
        invalidatePending: () => {
            if (!retired) {
                retired = true;
                void reentrant.update({ ...ready, status: "stopped" });
            }
        },
        getDatasetName: () => "data",
        refreshDataset: async () => assert.fail("Retirement callback must prevent old ready refresh")
    });
    await reentrant.update(ready);
    console.log("Shared editor session cases passed (controlled lifecycle, not real restart acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
