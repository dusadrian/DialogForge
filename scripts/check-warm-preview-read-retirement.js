"use strict";

const assert = require("node:assert/strict");
const { createDatasetEditorWarmCache } = require("../dist/src/dataset-editor/datasetEditorWarmCache");


const main = async function() {
    const preview = {
        status: "ready", providerId: "fixture", objectName: "data",
        columns: [{ name: "x" }], rows: [{ x: { raw: "1" } }],
        message: "", readAt: "fixture"
    };
    for (const mode of ["direct", "columns", "warm"]) {
        for (const transition of ["normal", "target", "global", "other", "metadata", "copy-target", "session", "throw", "retired-throw"]) {
            let release;
            let rejectRead;
            const held = new Promise((resolve, reject) => { release = resolve; rejectRead = reject; });
            let calls = 0;
            let dispatched;
            const cache = createDatasetEditorWarmCache({
                readTabularPreview: request => {
                    calls += 1;
                    dispatched = request;
                    return calls === 1 ? held : Promise.resolve(preview);
                }
            });
            cache.updateRuntimeSession({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" });
            if (mode === "warm") {
                cache.warmPreview("data");
            }
            const request = { objectName: "data", rowCount: 1, columnCount: 1 };
            if (mode === "columns") request.columns = ["x"];
            const pending = cache.readPreview(request);
            if (mode === "columns") {
                request.columns[0] = "replacement";
                assert.deepEqual(dispatched.columns, ["x"], "Pending request must own its column list");
            }
            if (transition === "target" || transition === "retired-throw") cache.invalidatePreview("data");
            if (transition === "global") cache.invalidatePreview();
            if (transition === "other") cache.invalidatePreview("other");
            if (transition === "metadata") cache.invalidateVariableMetadata("data");
            if (transition === "copy-target") cache.copy("source", "data");
            if (transition === "session") cache.updateRuntimeSession({ providerId: "fixture", lifecycleGeneration: 2, status: "ready" });
            const failure = new Error("Preview failed");
            if (transition === "throw" || transition === "retired-throw") {
                rejectRead(failure);
            } else {
                release(preview);
            }
            if (transition === "throw" && mode !== "warm") {
                await assert.rejects(pending, error => error === failure);
            } else {
                const received = await pending;
                const retired = ["target", "global", "copy-target", "session", "retired-throw"].includes(transition);
                if (retired) {
                    assert.equal(received.status, "unavailable");
                    assert.equal(received.providerId, "fixture");
                    assert.equal(received.objectName, "data");
                    assert.deepEqual(received.rows, []);
                    assert.equal(calls, 1, "Retired reader must not dispatch replacement read");
                } else {
                    assert.equal(received, preview);
                }
            }
            cache.invalidate();
        }
    }
    console.log("Shared preview-cache retirement cases passed (controlled runtime, not real first-screen acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
