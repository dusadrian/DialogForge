"use strict";

const assert = require("node:assert/strict");
const { createDatasetPreviewReadController } = require(
    "../dist/src/dataset-editor/renderer/datasetPreviewReadController"
);


const main = async function() {
    for (const transition of ["generation", "provider", "status", "dataset", "none"]) {
        let session = { providerId: "fixture", lifecycleGeneration: 1, status: "ready" };
        let objectName = "data";
        let release;
        const held = new Promise(resolve => { release = resolve; });
        const snapshot = { status: "ready", objectName: "data", rows: [[43]] };
        const rendered = [];
        const controller = createDatasetPreviewReadController({
            getRuntimeSnapshot: () => session,
            getObjectName: () => objectName,
            readPreview: value => { assert.equal(value, "data"); return held; },
            renderPreview: value => rendered.push(value)
        });
        const pending = controller.read("data");
        if (transition === "generation") {
            session = { ...session, lifecycleGeneration: 2 };
        } else if (transition === "provider") {
            session = { ...session, providerId: "replacement" };
        } else if (transition === "status") {
            session = { ...session, status: "stopped" };
        } else if (transition === "dataset") {
            objectName = "replacement";
        }
        release(snapshot);
        await pending;
        assert.deepEqual(rendered, transition === "none" ? [snapshot] : []);
        if (rendered.length) {
            assert.equal(rendered[0], snapshot);
        }
    }

    const held = [];
    const rendered = [];
    const controller = createDatasetPreviewReadController({
        getRuntimeSnapshot: () => ({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" }),
        getObjectName: () => "data",
        readPreview: () => new Promise(resolve => { held.push(resolve); }),
        renderPreview: value => rendered.push(value)
    });
    const first = controller.read("data");
    const second = controller.read("data");
    const current = { status: "ready", objectName: "data", rows: [[2]] };
    held[1](current);
    await second;
    held[0]({ status: "ready", objectName: "data", rows: [[1]] });
    await first;
    assert.deepEqual(rendered, [current], "Older reads must not overwrite newer preview");
    console.log("Shared preview consumer cases passed (controlled renderer, not real host acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
