"use strict";

const assert = require("node:assert/strict");
const { createDatasetVariableMetadataLookupController } = require("../dist/src/dataset-editor/renderer/datasetVariableMetadataLookupController");


const main = async function() {
    for (const operation of ["getForColumn", "refresh"]) {
        for (const outcome of ["ordinary", "empty", "failed", "retained-failed", "reset", "name", "throw"]) {
            let datasetName = "data";
            let sequence = 0;
            let loaded = false;
            let failed = false;
            let variables = [];
            let release;
            let rejectRead;
            const held = new Promise((resolve, reject) => {
                release = resolve;
                rejectRead = reject;
            });
            const effects = [];
            const controller = createDatasetVariableMetadataLookupController({
                getDatasetName: () => datasetName,
                getVariables: () => variables,
                isLoaded: () => loaded,
                isFailed: () => failed,
                getLoadSequence: () => sequence,
                reset: () => { sequence += 1; variables = []; loaded = false; failed = false; },
                loadAll: () => held,
                renderVariables: () => effects.push("items"),
                renderEmpty: () => effects.push("empty"),
                renderFailure: () => effects.push("failure")
            });
            const pending = operation === "refresh" ? controller.refresh() : controller.getForColumn("x");
            if (outcome === "reset") {
                sequence += 1;
            } else if (outcome === "name") {
                datasetName = "replacement";
            }
            failed = outcome === "failed" || outcome === "retained-failed";
            loaded = true;
            variables = outcome === "empty" || outcome === "failed" ? [] : [{ name: "x", label: "current" }];
            const failure = new Error("Metadata lookup failed");
            if (outcome === "throw") {
                rejectRead(failure);
                await assert.rejects(pending, error => error === failure);
                assert.deepEqual(effects, []);
                continue;
            }
            release();
            const result = await pending;
            if (operation === "getForColumn") {
                assert.equal(result, outcome === "ordinary" ? variables[0] : null);
                assert.deepEqual(effects, []);
            } else if (outcome === "reset" || outcome === "name") {
                assert.deepEqual(effects, []);
            } else {
                assert.deepEqual(effects, [outcome === "empty" ? "empty" : (outcome === "failed" ? "failure" : "items")]);
            }
        }
    }
    console.log("Shared metadata lookup cases passed (controlled reads, not rendered clipboard acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
