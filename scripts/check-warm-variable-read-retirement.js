"use strict";

const assert = require("node:assert/strict");
const { createDatasetEditorWarmCache } = require("../dist/src/dataset-editor/datasetEditorWarmCache");


const main = async function() {
    const variable = { name: "x", type: "numeric", role: "", label: "X" };
    const page = { name: "data", total: 1, start: 1, count: 1, items: [variable] };
    for (const stage of ["request", "fallback"]) {
        for (const transition of ["normal", "target", "global", "other", "copy-target", "throw", "retired-throw", "retired-unavailable"]) {
            let release;
            let rejectRead;
            let markStarted;
            const held = new Promise((resolve, reject) => { release = resolve; rejectRead = reject; });
            const started = new Promise(resolve => { markStarted = resolve; });
            let fallbackReads = 0;
            const cache = createDatasetEditorWarmCache({
                executeRuntimeMethod: () => {
                    if (stage === "request") {
                        markStarted();
                        return held;
                    }
                    return Promise.resolve({ status: "unavailable" });
                },
                readVariableMetadata: () => {
                    fallbackReads += 1;
                    markStarted();
                    return held;
                }
            });
            const pending = cache.readVariableMetadata("data", 1, 16);
            await started;
            if (transition === "target" || transition.startsWith("retired-")) {
                cache.invalidateVariableMetadata("data");
            } else if (transition === "global") {
                cache.invalidateVariableMetadata();
            } else if (transition === "other") {
                cache.invalidateVariableMetadata("other");
            } else if (transition === "copy-target") {
                cache.copy("source", "data");
            }
            const failure = new Error("Direct Variables read failed");
            if (transition === "throw" || transition === "retired-throw") {
                rejectRead(failure);
            } else {
                release(stage === "request"
                    ? (transition === "retired-unavailable" ? { status: "unavailable" } : { status: "ready", value: page })
                    : { status: "ready", variables: [variable] });
            }
            if (transition === "throw") {
                await assert.rejects(pending, error => error === failure);
            } else {
                const received = await pending;
                assert.deepEqual(received, transition === "normal" || transition === "other" ? page : null);
            }
            assert.equal(fallbackReads, stage === "fallback" ? 1 : 0,
                "Retired batch result must not dispatch fallback against replacement state");
        }
    }

    let releaseWarm;
    let calls = 0;
    const held = new Promise(resolve => { releaseWarm = resolve; });
    const cache = createDatasetEditorWarmCache({
        executeRuntimeMethod: () => {
            calls += 1;
            return calls === 1 ? held : Promise.resolve({ status: "ready", value: page });
        }
    });
    cache.warmVariableMetadata("data");
    const reading = cache.readVariableMetadata("data", 1, 16);
    cache.invalidateVariableMetadata("data");
    assert.equal(await reading, null, "Warm-wait invalidation must retire original reader");
    assert.equal(calls, 1, "Old warm-wait reader must not request replacement metadata");
    releaseWarm({ status: "ready", value: page });
    assert.deepEqual(await cache.readVariableMetadata("data", 1, 16), page);
    assert.equal(calls, 2, "A fresh read must remain usable after retirement");
    console.log("Shared direct warm-cache read retirement cases passed (controlled runtime, not real host replacement acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
