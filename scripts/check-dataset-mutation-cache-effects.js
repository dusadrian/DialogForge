"use strict";

const assert = require("node:assert/strict");
const { applyDatasetMutationCacheEffects, createDatasetMutationCacheEffect } = require(
    "../dist/src/dataset-editor/datasetMutationCacheEffects"
);

for (const change of [
    { kind: "dataset_cells_changed" },
    { kind: "dataset_rows_changed" },
    { kind: "dataset_rows_changed", schemaChanged: true },
    { kind: "dataset_columns_changed" },
    { kind: "dataset_column_renamed" },
    { kind: "dataset_variable_meta_changed" }
]) {
    for (const patched of [false, true]) {
        const effect = createDatasetMutationCacheEffect([change], patched);
        assert.equal(effect.previewChanged, true);
        assert.equal(effect.variableMetadataPatched, patched);
        assert.equal(effect.variableMetadataChanged, change.schemaChanged === true
            || !["dataset_cells_changed", "dataset_rows_changed"].includes(change.kind));
    }
}
assert.equal(createDatasetMutationCacheEffect([]).previewChanged, false);

for (const previewChanged of [false, true]) {
    for (const variableMetadataChanged of [false, true]) {
        for (const variableMetadataPatched of [false, true]) {
            for (const warmVariableMetadata of [false, true]) {
                const calls = [];
                const effect = {
                    previewChanged, variableMetadataChanged, variableMetadataPatched, warmVariableMetadata
                };
                applyDatasetMutationCacheEffects({
                    invalidatePreview: name => calls.push(["preview", name]),
                    invalidateVariableMetadata: name => calls.push(["metadata", name]),
                    warmVariableMetadata: name => calls.push(["warm", name])
                }, "data", effect);
                const clearsMetadata = variableMetadataChanged && !variableMetadataPatched;
                assert.deepEqual(calls, [
                    ...(previewChanged ? [["preview", "data"]] : []),
                    ...(clearsMetadata ? [["metadata", "data"]] : []),
                    ...(clearsMetadata && warmVariableMetadata ? [["warm", "data"]] : [])
                ]);
                assert.doesNotThrow(() => applyDatasetMutationCacheEffects(null, "data", effect));
            }
        }
    }
}

console.log("Shared cache execution cases passed; host action mapping and rendered acceptance remain open.");
