"use strict";

const assert = require("node:assert/strict");
const { createDatasetRefreshController } = require(
    "../dist/src/dataset-editor/renderer/datasetRefreshController"
);


const checkRefresh = async function(retireAt, unavailable, callbackRetirement, metadataOutcome) {
    let release;
    let stageStarted;
    const held = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { stageStarted = resolve; });
    const effects = [];
    let controller;
    const record = function(name) {
        effects.push(name);
        if (name === callbackRetirement) {
            controller.invalidate();
        }
    };
    const waitStage = function(stage, value) {
        if (stage === retireAt) {
            stageStarted();
            return held;
        }
        return Promise.resolve(value);
    };
    controller = createDatasetRefreshController({
        batchSize: 16,
        normalizeDatasetName: value => value,
        getCurrentDatasetName: () => "data",
        getCurrentSchema: () => ({ columns: [{ name: "x" }] }),
        openDataset: async () => assert.fail("Fixture already has schema"),
        syncDatasetSelector: () => {}, hideHeaderMenu: () => {}, closeValueLabels: () => {},
        clearEditState: () => {}, invalidatePendingLoads: () => {}, markViewportActivity: () => {},
        isVariableViewActive: () => true,
        isVariableMetadataLoaded: () => true,
        isVariableMetadataFailed: () => metadataOutcome === "failed",
        resetVariableMetadata: () => {},
        fetchSchema: () => waitStage("schema", unavailable ? null : { marker: "schema" }),
        applySchema: () => record("schema"),
        showSchemaFailure: () => record("failure"),
        readViewport: () => ({ rowStart: 1, rowCount: 40, columnStart: 1, columnEnd: 2 }),
        resetLoadedWindow: () => record("reset-window"),
        loadWindow: () => { record("window"); return waitStage("window"); },
        getVariableHost: () => null,
        getMinimumVisibleVariableRows: () => 16,
        getMinimumScrolledVariableRows: () => 16,
        loadVariablesUntil: () => { record("variables"); return waitStage("variables"); },
        ensureVariablesLoaded: async () => {},
        getVariables: () => metadataOutcome ? [] : [{ name: "x" }],
        renderVariables: () => record("render-variables"),
        renderNoVariables: () => record("no-variables"),
        renderVariableFailure: () => record("variable-failure"),
        scheduleBackgroundVariableLoad: () => record("background"),
        queueViewportRefresh: () => record("refresh")
    });
    const pending = controller.refresh("data");
    if (retireAt) {
        await started;
        controller.invalidate();
    }
    release(unavailable ? null : { marker: "schema" });
    await pending;
    if (callbackRetirement === "schema") {
        assert.deepEqual(effects, ["schema"]);
    } else if (callbackRetirement === "reset-window") {
        assert.deepEqual(effects, ["schema", "reset-window"]);
    } else if (retireAt === "schema") {
        assert.deepEqual(effects, [], "Same-name retired null must not clear replacement UI");
    } else if (retireAt === "window") {
        assert.deepEqual(effects, ["schema", "reset-window", "window"]);
    } else if (retireAt === "variables") {
        assert.deepEqual(effects, ["schema", "reset-window", "window", "variables"]);
    } else if (unavailable) {
        assert.deepEqual(effects, ["failure"], "Current unavailable schema must remain truthful");
    } else if (callbackRetirement === "render-variables") {
        assert.deepEqual(effects, ["schema", "reset-window", "window", "variables", "render-variables"]);
    } else if (metadataOutcome) {
        const presentation = metadataOutcome === "failed" ? "variable-failure" : "no-variables";
        assert.deepEqual(effects, ["schema", "reset-window", "window", "variables", presentation, "refresh"]);
    } else {
        assert.deepEqual(effects, ["schema", "reset-window", "window", "variables", "render-variables", "refresh"]);
    }
};


const main = async function() {
    for (const stage of ["schema", "window", "variables", null]) {
        await checkRefresh(stage, false);
    }
    await checkRefresh("schema", true);
    await checkRefresh(null, true);
    await checkRefresh(null, false, "schema");
    await checkRefresh(null, false, "reset-window");
    await checkRefresh(null, false, "render-variables");
    await checkRefresh(null, false, null, "failed");
    await checkRefresh(null, false, null, "empty");
    console.log("Shared refresh invalidation cases passed (controlled controller, not rendered host acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
