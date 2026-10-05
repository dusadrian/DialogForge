"use strict";

const assert = require("node:assert/strict");
const { createDatasetChangeController } = require(
    "../dist/src/dataset-editor/renderer/datasetChangeController"
);


const createFixture = function(heldStage, retireOnCallback) {
    let release;
    let markStarted;
    const held = new Promise((resolve) => { release = resolve; });
    const started = new Promise((resolve) => { markStarted = resolve; });
    const state = { name: "data", effects: [] };
    let controller;
    const record = function(stage) {
        state.effects.push(stage);
        if (stage === retireOnCallback) {
            controller.invalidate();
        }
    };
    const wait = async function(stage) {
        record(stage);
        if (stage === heldStage) {
            markStarted();
            await held;
        }
    };
    controller = createDatasetChangeController({
        getDatasetName: () => state.name,
        removeDataset: () => wait("remove"),
        applyColumnRenames: () => record("renames"),
        applyColumnRemovals: () => record("removals"),
        refreshSchema: () => wait("schema"),
        refreshRowSchema: async (isCurrent) => {
            await wait("row-schema");
            if (isCurrent()) {
                record("apply-row-schema");
            }
        },
        refreshViewport: () => wait("viewport"),
        refreshVariables: (names) => {
            assert.deepEqual(names, ["x"]);
            return wait("variables");
        }
    });
    return { state, controller, release, started };
};


const change = function(kind) {
    return { name: "data", kind, columns: ["x"] };
};


const checkRetiredAwait = async function(stage, changes, expected) {
    for (const retirement of ["same-name", "different-name", "return-to-same-name"]) {
        const fixture = createFixture(stage);
        const pending = fixture.controller.apply(changes);
        await fixture.started;
        if (retirement === "different-name") {
            fixture.state.name = "replacement";
        } else if (retirement === "return-to-same-name") {
            fixture.state.name = "replacement";
            fixture.controller.invalidate();
            fixture.state.name = "data";
        } else {
            fixture.controller.invalidate();
        }
        fixture.release();
        await pending;
        assert.deepEqual(fixture.state.effects, expected, retirement);
    }
};


const main = async function() {
    const rows = change("dataset_rows_changed");
    const cells = change("dataset_cells_changed");
    const variables = change("dataset_variable_meta_changed");
    await checkRetiredAwait("row-schema", [rows, variables], ["renames", "removals", "row-schema"]);
    await checkRetiredAwait("viewport", [rows, variables], [
        "renames", "removals", "row-schema", "apply-row-schema", "viewport"
    ]);
    await checkRetiredAwait("viewport", [cells, variables], ["renames", "removals", "viewport"]);
    await checkRetiredAwait("variables", [variables], ["renames", "removals", "variables"]);

    for (const [callback, expected] of [
        ["renames", ["renames"]],
        ["removals", ["renames", "removals"]],
        ["apply-row-schema", ["renames", "removals", "row-schema", "apply-row-schema"]]
    ]) {
        const fixture = createFixture(null, callback);
        await fixture.controller.apply([rows, cells, variables]);
        assert.deepEqual(fixture.state.effects, expected);
    }

    const current = createFixture();
    await current.controller.apply([rows, cells, variables]);
    assert.deepEqual(current.state.effects, [
        "renames", "removals", "row-schema", "apply-row-schema",
        "viewport", "viewport", "variables", "viewport"
    ]);

    for (const [kind, expected] of [
        ["dataset_removed", ["remove"]],
        ["dataset_columns_changed", ["renames", "removals", "schema"]],
        ["dataset_changed_unknown", ["renames", "removals", "schema"]]
    ]) {
        const fixture = createFixture();
        await fixture.controller.apply([change(kind), variables]);
        assert.deepEqual(fixture.state.effects, expected);
    }

    const unnamed = createFixture();
    unnamed.state.name = "";
    await unnamed.controller.apply([variables]);
    assert.deepEqual(unnamed.state.effects, []);

    console.log("Shared dataset-change retirement cases passed (controlled controller, not host acceptance).");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
