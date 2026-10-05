"use strict";

const assert = require("node:assert/strict");
const { createDatasetEditorWarmCache } = require("../dist/src/dataset-editor/datasetEditorWarmCache");


const main = async function() {
    const preview = name => ({
        status: "ready", providerId: "fixture", objectName: name,
        columns: Array.from({ length: 32 }, (_, index) => ({ name: "x" + index })),
        rows: Array.from({ length: 40 }, () => ({ x0: "value" })),
        message: "", readAt: "fixture"
    });
    for (const mode of ["direct", "columns", "warm", "active"]) {
        let calls = 0;
        const cache = createDatasetEditorWarmCache({
            readTabularPreview() {
                calls += 1;
                return Promise.resolve(preview(calls === 1 ? "other" : "data"));
            },
            executeRuntimeMethod() { throw Error("Unexpected metadata read"); },
            readVariableMetadata() { throw Error("Unexpected metadata fallback"); }
        });
        cache.updateRuntimeSession({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" });
        if (mode === "warm") {
            cache.warmPreview("data");
        }
        const request = { objectName: mode === "active" ? "" : "data", rowCount: 1, columnCount: 1 };
        if (mode === "columns") {
            request.columns = ["x0"];
        }
        const first = await cache.readPreview(request);
        if (mode === "warm") {
            assert.equal(calls, 2, "Foreign warm preview was reused instead of reread");
            assert.equal(first.objectName, "data");
            assert.equal(first.status, "ready");
        }
        else if (mode === "active") {
            assert.equal(first.objectName, "other", "Active-target resolution was rejected");
            assert.equal(first.status, "ready");
        }
        else {
            assert.equal(first.status, "unavailable");
            assert.equal(first.providerId, "fixture");
            assert.equal(first.objectName, "data");
            assert.deepEqual(first.rows, []);
            assert.deepEqual(first.columns, []);
            assert.match(first.message, /does not match/);
        }
        const recovered = await cache.readPreview({ objectName: "data", rowCount: 1, columnCount: 1 });
        assert.equal(recovered.status, "ready");
        assert.equal(recovered.objectName, "data");
        cache.invalidate();
    }
    process.stdout.write("Warm/direct preview dataset identity cases passed.\n");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
