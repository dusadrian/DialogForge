"use strict";

const assert = require("node:assert/strict");
const { createDatasetEditorWarmCache } = require("../dist/src/dataset-editor/datasetEditorWarmCache");


const main = async function() {
    const variable = { name: "x", type: "numeric", role: "", label: "X" };
    for (const status of ["failed", "not-ready", "ready"]) {
        let completeReads = 0;
        const runtime = {
            getSnapshot: () => ({ providerId: "r", status: "ready", lifecycleGeneration: 1 }),
            executeRuntimeMethod: async () => ({ status }),
            readVariableMetadata: async () => {
                completeReads += 1;
                return { status: "ready", variables: [variable] };
            }
        };
        const cache = createDatasetEditorWarmCache(runtime);
        assert.equal(await cache.readVariableMetadata("data", 1, 16), null);
        const { createDatasetViewerReadController } = require("../dist/src/runtime/tabular-data/datasetViewerReadController");
        const reads = createDatasetViewerReadController({ runtimeSessionManager: runtime });
        assert.equal(await reads.readVariableBatch({ name: "data", start: 1, count: 16 }), null);
        assert.equal(completeReads, 0, status + " bounded failure escalated to a complete metadata read");
    }
    for (const scenario of ["unavailable", "malformed", "foreign", "no-progress", "empty", "ordinary"]) {
        let calls = 0;
        const cache = createDatasetEditorWarmCache({
            executeRuntimeMethod: async () => {
                calls += 1;
                if (scenario === "unavailable") {
                    return { status: "unavailable" };
                }
                return {
                    status: "ready",
                    value: {
                        name: scenario === "foreign" ? "replacement" : "data",
                        total: scenario === "empty" ? 0 : 1,
                        start: 1,
                        count: scenario === "empty" || scenario === "no-progress" ? 0 : 1,
                        items: scenario === "malformed" ? null : (scenario === "empty" || scenario === "no-progress" ? [] : [variable])
                    }
                };
            },
            readVariableMetadata: async () => ({ status: "unavailable", variables: [] })
        });
        const batch = await cache.readVariableMetadata("data", 1, 16);
        if (scenario === "ordinary" || scenario === "empty") {
            assert.deepEqual(batch.items, scenario === "empty" ? [] : [variable]);
        } else {
            assert.equal(batch, null);
        }
        assert.equal(calls, 1);
        cache.warmVariableMetadata("data");
        for (let step = 0; step < 15; step += 1) {
            await Promise.resolve();
        }
        await cache.readVariableMetadata("data", 1, 16);
        assert.equal(calls, scenario === "ordinary" || scenario === "empty" ? 2 : 3,
            "Failed/malformed warmup must not publish a successful cache entry");
    }

    let unavailable = true;
    let calls = 0;
    const cache = createDatasetEditorWarmCache({
        executeRuntimeMethod: async () => {
            calls += 1;
            return unavailable ? { status: "unavailable" } : {
                status: "ready",
                value: { name: "data", total: 1, start: 1, count: 1, items: [variable] }
            };
        },
        readVariableMetadata: async () => ({ status: "unavailable", variables: [] })
    });
    cache.warmVariableMetadata("data");
    for (let step = 0; step < 15; step += 1) {
        await Promise.resolve();
    }
    unavailable = false;
    const recovered = await cache.readVariableMetadata("data", 1, 16);
    assert.equal(recovered.items[0].name, "x");
    assert.equal(calls, 2, "Failed warmup must not cache empty success");

    let releaseOld;
    let fallbackStarted;
    const old = new Promise(resolve => { releaseOld = resolve; });
    const started = new Promise(resolve => { fallbackStarted = resolve; });
    let replacement = false;
    const retiringCache = createDatasetEditorWarmCache({
        executeRuntimeMethod: async () => replacement ? {
            status: "ready",
            value: { name: "data", total: 1, start: 1, count: 1, items: [{ ...variable, label: "new" }] }
        } : { status: "unavailable" },
        readVariableMetadata: () => { fallbackStarted(); return old; }
    });
    retiringCache.warmVariableMetadata("data");
    await started;
    retiringCache.invalidateVariableMetadata("data");
    replacement = true;
    releaseOld({ status: "ready", variables: [{ ...variable, label: "old" }] });
    for (let step = 0; step < 15; step += 1) {
        await Promise.resolve();
    }
    const current = await retiringCache.readVariableMetadata("data", 1, 16);
    assert.equal(current.items[0].label, "new", "Retired full-metadata fallback must not populate replacement cache");
    console.log("Shared warm Variables failure cases passed (controlled runtime, not first-screen host acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
