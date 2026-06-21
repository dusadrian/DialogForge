"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createFeatureEntrypointActivation } = require("../../shared/base-app/features/featureEntrypointCommands");
const verifyReadyFeatureEntrypoint = function () {
    const result = createFeatureEntrypointActivation({
        type: "feature",
        feature: "dataset-editor.grid",
        enabled: true,
        target: {
            domTarget: "datasetPreviewPanel",
            targetHome: "shared/dataset-editor/view",
            status: "implemented",
            replacement: "Rebuild as a shared dataset editor."
        }
    });
    assert.strictEqual(result.status, "implemented");
    assert.strictEqual(result.feature, "dataset-editor.grid");
    assert.strictEqual(result.domTarget, "datasetPreviewPanel");
    assert.strictEqual(result.targetHome, "shared/dataset-editor/view");
};
const verifyDisabledFeatureEntrypoint = function () {
    const result = createFeatureEntrypointActivation({
        type: "feature",
        feature: "dataset-editor.variable-view",
        enabled: false,
        reason: "Runtime capability is not available.",
        target: {
            targetHome: "shared/dataset-editor/variable-grid"
        }
    });
    assert.strictEqual(result.status, "disabled");
    assert.strictEqual(result.message, "Runtime capability is not available.");
};
const verifyNonFeatureCommand = function () {
    const result = createFeatureEntrypointActivation({
        type: "shell-command",
        command: "workspace.refresh",
        enabled: true
    });
    assert.strictEqual(result.status, "unavailable");
};
verifyReadyFeatureEntrypoint();
verifyDisabledFeatureEntrypoint();
verifyNonFeatureCommand();
console.log("Feature entrypoint command contract verified.");
