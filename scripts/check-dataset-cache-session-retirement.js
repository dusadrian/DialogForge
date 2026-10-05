"use strict";

const assert = require("node:assert/strict");
const { createDatasetEditorWarmCache } = require("../dist/src/dataset-editor/datasetEditorWarmCache");


const main = async function() {
    const page = {
        name: "data", total: 1, start: 1, count: 1,
        items: [{ name: "x", type: "numeric", role: "", label: "X" }]
    };
    for (const mode of ["direct", "warm"]) {
        for (const transition of ["message", "connection", "generation", "provider", "status", "mutated-snapshot", "drop"]) {
            let release;
            const held = new Promise(resolve => { release = resolve; });
            let calls = 0;
            const cache = createDatasetEditorWarmCache({
                executeRuntimeMethod: () => {
                    calls += 1;
                    return calls === 1 ? held : Promise.resolve({ status: "ready", value: page });
                },
                readVariableMetadata: () => assert.fail("Retired request must not fall back into new session")
            });
            const snapshot = { providerId: "fixture", lifecycleGeneration: 1, status: "ready", message: "ready" };
            cache.updateRuntimeSession(snapshot);
            if (mode === "warm") {
                cache.warmVariableMetadata("data");
            }
            const pending = cache.readVariableMetadata("data", 1, 16);
            if (transition === "drop") {
                cache.invalidate();
            } else if (transition === "mutated-snapshot") {
                snapshot.lifecycleGeneration = 2;
                cache.updateRuntimeSession(snapshot);
            } else {
                const next = { ...snapshot };
                if (transition === "message") next.message = "details changed";
                if (transition === "connection") next.connection = { phase: "connected" };
                if (transition === "generation") next.lifecycleGeneration = 2;
                if (transition === "provider") next.providerId = "replacement";
                if (transition === "status") next.status = "stopped";
                cache.updateRuntimeSession(next);
            }
            release({ status: "ready", value: page });
            const received = await pending;
            const retired = transition !== "message" && transition !== "connection";
            assert.deepEqual(received, retired ? null : page);
            assert.equal(calls, 1);
            if (retired) {
                cache.updateRuntimeSession({ providerId: "fixture", lifecycleGeneration: 3, status: "ready" });
                assert.deepEqual(await cache.readVariableMetadata("data", 1, 16), page);
                assert.equal(calls, 2, "Fresh session must not reuse old cache");
            }
        }
    }
    console.log("Shared dataset cache session retirement cases passed (controlled snapshots, not real process/worker teardown).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
