"use strict";

const assert = require("node:assert/strict");
const { createDatasetVariableRowRefreshController } = require(
    "../dist/src/dataset-editor/renderer/datasetVariableRowRefreshController"
);


const createFixture = function() {
    const state = {
        name: "data",
        columns: [{ name: "x" }, { name: "y" }, { name: "z" }],
        variables: ["old-x", "old-y", "old-z"],
        active: true,
        requests: [],
        effects: [],
        retireOnWrite: false
    };
    let controller;
    controller = createDatasetVariableRowRefreshController({
        getDatasetName: () => state.name,
        getSchemaColumns: () => state.columns,
        getVariables: () => state.variables,
        setVariables: (items) => {
            state.variables = items;
            state.effects.push("write");
            if (state.retireOnWrite) {
                controller.invalidate();
            }
        },
        fetchBatch: (name, start, count) => {
            return new Promise((resolve, reject) => {
                state.requests.push({ name, start, count, resolve, reject });
            });
        },
        isVariablesActive: () => state.active,
        renderVariables: () => state.effects.push("render")
    });
    return { state, controller };
};


const checkRetirement = async function(retire) {
    const { state, controller } = createFixture();
    const pending = controller.refresh(["x"]);
    retire(state, controller);
    state.requests[0].resolve({ items: ["late-x"] });
    await pending;
    assert.deepEqual(state.effects, []);
    assert.deepEqual(state.variables, ["old-x", "old-y", "old-z"]);
};


const checkConcurrentRows = async function() {
    const { state, controller } = createFixture();
    const older = controller.refresh(["x", "z"]);
    const newer = controller.refresh(["y"]);
    state.requests[1].resolve({ items: ["new-y"] });
    await newer;
    state.requests[0].resolve({ items: ["new-x", "stale-y", "new-z", "extra"] });
    await older;
    assert.deepEqual(state.variables, ["new-x", "new-y", "new-z"]);
    assert.deepEqual(state.effects, ["write", "render", "write", "render"]);

    const oldestX = controller.refresh(["x"]);
    const latestX = controller.refresh(["x"]);
    state.requests[3].resolve({ items: ["latest-x"] });
    await latestX;
    const effects = state.effects.slice();
    state.requests[2].resolve({ items: ["superseded-x"] });
    await oldestX;
    assert.equal(state.variables[0], "latest-x");
    assert.deepEqual(state.effects, effects);

    const disjointX = controller.refresh(["x"]);
    const disjointZ = controller.refresh(["z"]);
    state.requests[5].resolve({ items: ["latest-z"] });
    await disjointZ;
    state.requests[4].resolve({ items: ["disjoint-x"] });
    await disjointX;
    assert.deepEqual(state.variables, ["disjoint-x", "new-y", "latest-z"]);
};


const main = async function() {
    for (const retire of [
        (_state, controller) => controller.invalidate(),
        (state) => { state.name = "other"; },
        (state, controller) => {
            state.name = "other";
            controller.invalidate();
            state.name = "data";
        },
        (state) => { state.columns[0].name = "renamed"; },
        (state) => { state.columns.reverse(); },
        (state) => { state.columns.push({ name: "added" }); }
    ]) {
        await checkRetirement(retire);
    }
    await checkConcurrentRows();

    for (const outcome of [null, { items: [] }, { items: null }]) {
        const { state, controller } = createFixture();
        const pending = controller.refresh(["x"]);
        state.requests[0].resolve(outcome);
        await pending;
        assert.deepEqual(state.effects, []);
    }

    const failure = createFixture();
    const rejected = failure.controller.refresh(["x"]);
    failure.state.requests[0].reject(new Error("metadata unavailable"));
    await assert.rejects(rejected, /metadata unavailable/);
    assert.deepEqual(failure.state.effects, []);

    const prefix = createFixture();
    prefix.state.variables = ["old-x"];
    const outside = prefix.controller.refresh(["z"]);
    prefix.state.requests[0].resolve({ items: ["new-z"] });
    await outside;
    assert.deepEqual(prefix.state.variables, ["old-x"]);
    assert.deepEqual(prefix.state.effects, []);
    const spanning = prefix.controller.refresh(["x", "z"]);
    prefix.state.requests[1].resolve({ items: ["new-x", "new-y", "new-z"] });
    await spanning;
    assert.deepEqual(prefix.state.variables, ["new-x"], "Do not grow the background loader's prefix");

    for (const retireOnWrite of [false, true]) {
        const { state, controller } = createFixture();
        state.retireOnWrite = retireOnWrite;
        state.active = retireOnWrite;
        const pending = controller.refresh([" x "]);
        assert.deepEqual(
            state.requests.map(({ name, start, count }) => ({ name, start, count })),
            [{ name: "data", start: 1, count: 1 }]
        );
        state.requests[0].resolve({ items: ["current-x"] });
        await pending;
        assert.equal(state.variables[0], "current-x");
        assert.deepEqual(state.effects, ["write"], "Hidden or retired view must not render");
    }

    const empty = createFixture();
    await empty.controller.refresh(["", "unknown"]);
    empty.state.variables = [];
    await empty.controller.refresh(["x"]);
    empty.state.variables = null;
    await empty.controller.refresh(["x"]);
    empty.state.variables = ["old-x"];
    empty.state.name = "";
    await empty.controller.refresh(["x"]);
    assert.deepEqual(empty.state.requests, []);

    console.log("Shared targeted Variables retirement/row ordering cases passed (controlled controller, not host acceptance).");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
