"use strict";

const assert = require("node:assert/strict");
const {
    applyWorkspaceDatasetCacheEffects,
    readWorkspaceDatasetWarmup,
    warmWorkspaceDatasetCacheEffects
} = require("../dist/src/runtime/workspace/workspaceUpdateEffects");

const effect = function(name, fields) {
    return {
        name, preview: false, variableMetadata: false,
        variableMetadataStructure: false, variableNames: [],
        removed: false, copiedFrom: "", ...fields
    };
};
const effects = [
    effect("copy", { copiedFrom: "source" }),
    effect("cells", { preview: true }),
    effect("metadata", { variableMetadata: true, variableNames: ["x"] }),
    effect("structure", { preview: true, variableMetadata: true, variableMetadataStructure: true }),
    effect("removed", { preview: true, variableMetadata: true, variableMetadataStructure: true, removed: true })
];

const main = async function() {
    for (const host of ["r", "webr"]) {
        for (const [name, expected] of [
            ["cells", { preview: true, variableMetadata: false }],
            ["metadata", { preview: false, variableMetadata: false }],
            ["structure", { preview: true, variableMetadata: true }],
            ["removed", { preview: false, variableMetadata: false }],
            ["copy", { preview: false, variableMetadata: false }],
            ["missing", { preview: false, variableMetadata: false }],
            ["", { preview: false, variableMetadata: false }]
        ]) {
            assert.deepEqual(readWorkspaceDatasetWarmup(effects, name), expected, host);
            const warmed = [];
            warmWorkspaceDatasetCacheEffects(effects, name, {
                warmPreview: (objectName) => warmed.push(["preview", objectName]),
                warmVariableMetadata: (objectName) => warmed.push(["metadata", objectName])
            });
            assert.deepEqual(warmed, [
                ...(expected.preview ? [["preview", name]] : []),
                ...(expected.variableMetadata ? [["metadata", name]] : [])
            ], host);
        }
        assert.deepEqual(readWorkspaceDatasetWarmup([
            effect("all_metadata", { variableMetadata: true })
        ], "all_metadata"), { preview: false, variableMetadata: true }, host);

        const calls = [];
        const cache = {
            copy: (source, target) => calls.push(["copy", source, target]),
            invalidatePreview: (name) => calls.push(["preview", name]),
            invalidateVariableMetadata: (name) => calls.push(["metadata", name]),
            refreshVariableMetadata: async (name, columns) => { calls.push(["refresh", name, columns]); }
        };
        const pending = applyWorkspaceDatasetCacheEffects(effects, cache);
        assert.equal(pending.length, 1, host);
        await Promise.all(pending);
        assert.deepEqual(calls, [
            ["copy", "source", "copy"], ["preview", "cells"],
            ["refresh", "metadata", ["x"]],
            ["preview", "structure"], ["metadata", "structure"],
            ["preview", "removed"], ["metadata", "removed"]
        ]);
    }
    const invalidated = [];
    assert.deepEqual(applyWorkspaceDatasetCacheEffects(effects, null,
        (name) => invalidated.push(name)), []);
    assert.deepEqual(invalidated, effects.map((item) => item.name));
    console.log("Shared workspace cache effect cases passed.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
