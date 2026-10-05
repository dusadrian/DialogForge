"use strict";

const assert = require("node:assert/strict");
const { createValueLabelsEditorController } = require(
    "../dist/src/dataset-editor/renderer/valueLabelsEditorController"
);


const variable = function(name, categories = []) {
    return {
        name, categories, type: "integer", label: "", values: "", width: 4,
        decimals: 0, align: "right", measure: "nominal", missingRange: null
    };
};


const createFixture = function(categories = []) {
    const state = {
        name: "data", loadSequence: 1, variables: [variable("x", categories), variable("y")],
        requests: [], effects: [], changedLabel: "updated", onWrite: null, onRender: null
    };
    const labelField = {
        get value() { return state.changedLabel; },
        getAttribute: (name) => name === "data-value-label-label" ? "0" : null,
        hasAttribute: (name) => name === "data-value-label-label"
    };
    const body = {
        querySelectorAll: (selector) => selector.includes("value-label-label") ? [labelField] : [],
        querySelector: () => null
    };
    const request = function(kind, name, row) {
        return new Promise((resolve, reject) => {
            state.requests.push({ kind, name, row, resolve, reject });
        });
    };
    const controller = createValueLabelsEditorController({
        document: { getElementById: (id) => id === "datasetValueLabelsBody" ? body : null },
        getVariables: () => state.variables,
        getDatasetName: () => state.name,
        getLoadSequence: () => state.loadSequence,
        hydrateVariable: (name, row) => request("hydrate", name, row),
        replaceVariable: (row, entry) => {
            state.variables[row] = entry;
            state.effects.push("write");
            state.onWrite?.(controller);
        },
        translate: (key) => key,
        escapeHtml: (value) => String(value),
        plusIconPath: "plus.svg", deleteIconPath: "xcircle.svg",
        showCover: () => state.effects.push("show"),
        hideCover: () => state.effects.push("hide"),
        updateVariable: (name, entryName) => request("save", name, entryName),
        buildCommand: () => "committed values command",
        rememberCommand: () => state.effects.push("remember"),
        variablesTabActive: () => true,
        renderVariables: () => {
            state.effects.push("render");
            state.onRender?.(controller);
        },
        refreshDataset: async () => {},
        showNotice: (message) => state.effects.push(`notice:${message}`)
    });
    return { state, controller };
};


const main = async function() {
    for (const retire of [
        (state) => { state.name = "other"; },
        (state) => { state.loadSequence += 1; },
        (state) => {
            state.name = "other";
            state.loadSequence += 1;
            state.name = "data";
        },
        (state) => { state.variables.reverse(); },
        (state) => { state.variables[0] = variable("x"); },
        (state) => { state.variables = []; },
        (_state, controller) => controller.close()
    ]) {
        const { state, controller } = createFixture();
        const pending = controller.openHydrated(0);
        retire(state, controller);
        const effects = state.effects.slice();
        state.requests[0].resolve(variable("x"));
        await pending;
        assert.deepEqual(state.effects, effects, "Retired hydration must not write, render or open");
        assert.equal(controller.isOpen(), false);
    }

    for (const result of [variable("x"), null]) {
        const { state, controller } = createFixture();
        const pending = controller.openHydrated(0);
        state.requests[0].resolve(result);
        await pending;
        assert.equal(controller.isOpen(), true);
        assert.deepEqual(state.effects, result ? ["write", "render"] : []);
        assert.equal(state.variables.length, 2, "Hydration cannot grow the loaded prefix");
    }

    const wrongName = createFixture();
    const mismatched = wrongName.controller.openHydrated(0);
    wrongName.state.requests[0].resolve(variable("wrong"));
    await mismatched;
    assert.deepEqual(wrongName.state.effects, []);
    assert.equal(wrongName.controller.isOpen(), false);

    const concurrent = createFixture();
    const older = concurrent.controller.openHydrated(0);
    const newer = concurrent.controller.openHydrated(1);
    concurrent.state.requests[1].resolve(variable("y"));
    await newer;
    const newerEffects = concurrent.state.effects.slice();
    concurrent.state.requests[0].resolve(variable("x"));
    await older;
    assert.deepEqual(concurrent.state.effects, newerEffects);
    assert.equal(concurrent.controller.isOpen(), true);

    for (const callback of ["onWrite", "onRender"]) {
        const { state, controller } = createFixture();
        state[callback] = (owner) => owner.close();
        const pending = controller.openHydrated(0);
        state.requests[0].resolve(variable("x"));
        await pending;
        assert.equal(controller.isOpen(), false, "Hydration callbacks cannot resurrect a closed editor");
    }

    const failure = createFixture();
    const rejected = failure.controller.openHydrated(0);
    failure.state.requests[0].reject(new Error("read failed"));
    await assert.rejects(rejected, /read failed/);
    assert.deepEqual(failure.state.effects, []);

    const categories = [{ value: "1", label: "before", isMissing: false }];
    const cached = createFixture(categories);
    await cached.controller.openHydrated(0);
    assert.equal(cached.controller.isOpen(), true);
    assert.deepEqual(cached.state.requests, [], "Existing categories do not require another read");

    for (const retire of [
        (state) => { state.name = "other"; },
        (state) => { state.loadSequence += 1; },
        (state) => { state.variables.reverse(); },
        (_state, controller) => controller.close(),
        (_state, controller) => { controller.close(); controller.open(1); }
    ]) {
        const { state, controller } = createFixture(categories);
        controller.open(0);
        const pending = controller.save();
        retire(state, controller);
        const effects = state.effects.slice();
        const open = controller.isOpen();
        state.requests[0].resolve(variable("x", categories));
        await pending;
        assert.deepEqual(state.effects, effects, "Retired save cannot overwrite or close a replacement editor");
        assert.equal(controller.isOpen(), open);
    }

    for (const outcome of [null, variable("wrong"), variable("x", categories)]) {
        const { state, controller } = createFixture(categories);
        controller.open(0);
        const pending = controller.save();
        // The committed mutation's own metadata event may replace this entry.
        state.variables[0] = variable("x", categories);
        state.requests[0].resolve(outcome);
        await pending;
        if (!outcome || outcome.name === "wrong") {
            assert.deepEqual(state.effects, ["notice:Value labels update failed"]);
            assert.equal(controller.isOpen(), true);
        } else {
            assert.deepEqual(state.effects, ["write", "remember", "render", "hide", "notice:Value labels updated"]);
            assert.equal(controller.isOpen(), false);
        }
    }

    console.log("Shared Values hydration/save retirement cases passed; real paired-host acceptance remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
