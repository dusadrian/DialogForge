"use strict";

const assert = require("node:assert/strict");
const { createVariableMetadataLoader } = require("../dist/src/dataset-editor/state/variableMetadataLoader");
const { createVariableMetadataLoadState } = require("../dist/src/dataset-editor/state/variableMetadataLoadState");


const main = async function() {
    const previousWindow = global.window;
    let timerSequence = 0;
    const timers = new Map();
    global.window = {
        setTimeout(callback) { const id = ++timerSequence; timers.set(id, callback); return id; },
        clearTimeout(id) { timers.delete(id); }
    };
    try {
        const state = createVariableMetadataLoadState();
        state.schedule(() => assert.fail("Retired timer must not run"), 10);
        const oldCallback = timers.get(timerSequence);
        state.reset();
        state.schedule(() => {}, 10);
        const currentTimer = timerSequence;
        oldCallback();
        assert.ok(timers.has(currentTimer));
        state.cancelScheduled();
        assert.equal(timers.size, 0, "Old timer must not erase cancellation handle for replacement timer");

        for (const transition of ["reset", "dataset", "set-items-reset", "render-reset", "none"]) {
            let datasetName = "data";
            let items = [];
            let release;
            const held = new Promise(resolve => { release = resolve; });
            const effects = [];
            let loader;
            loader = createVariableMetadataLoader({
                batchSize: 1, activeDelay: 10, idleDelay: 20,
                getDatasetName: () => datasetName,
                getItems: () => items,
                setItems: value => {
                    items = value;
                    effects.push("items");
                    if (transition === "set-items-reset") {
                        loader.reset();
                    }
                },
                fetchBatch: () => held,
                isVariableViewActive: () => true,
                shouldPause: () => false,
                renderItems: () => {
                    effects.push("render");
                    if (transition === "render-reset") {
                        loader.reset();
                    }
                },
                renderEmpty: () => effects.push("empty"),
                renderFailure: () => effects.push("failure")
            });
            const pending = loader.loadNext(false);
            if (transition === "reset") {
                loader.reset();
            } else if (transition === "dataset") {
                datasetName = "replacement";
            }
            release({ total: 2, items: [{ name: "x" }] });
            await pending;
            if (transition === "reset" || transition === "dataset") {
                assert.deepEqual(effects, []);
            } else if (transition === "set-items-reset") {
                assert.deepEqual(effects, ["items"]);
            } else {
                assert.deepEqual(effects, ["items", "render"]);
            }
            assert.equal(timers.size, transition === "none" ? 1 : 0);
            loader.reset();
        }

        let release;
        const held = new Promise(resolve => { release = resolve; });
        const background = createVariableMetadataLoader({
            batchSize: 1, activeDelay: 10, idleDelay: 20,
            getDatasetName: () => "data", getItems: () => [],
            setItems: () => assert.fail("Retired background must not publish"),
            fetchBatch: () => held,
            isVariableViewActive: () => false, shouldPause: () => false,
            renderItems: () => {}, renderEmpty: () => {}, renderFailure: () => {}
        });
        background.startBackground();
        background.reset();
        release({ total: 2, items: [{ name: "x" }] });
        for (let step = 0; step < 8; step += 1) {
            await Promise.resolve();
        }
        assert.equal(timers.size, 0, "Old background finally must not schedule after reset");

        for (const method of ["loadNext", "loadAll", "loadUntil", "ensureLoaded"]) {
            const failure = new Error(`Failed ${method}`);
            const effects = [];
            const loader = createVariableMetadataLoader({
                batchSize: 1, activeDelay: 10, idleDelay: 20,
                getDatasetName: () => "data", getItems: () => [],
                setItems: () => effects.push("items"),
                fetchBatch: async () => { throw failure; },
                isVariableViewActive: () => true, shouldPause: () => false,
                renderItems: () => effects.push("render"),
                renderEmpty: () => effects.push("empty"),
                renderFailure: () => effects.push("failure")
            });
            const pending = method === "loadUntil"
                ? loader.loadUntil(1, false)
                : loader[method](false);
            await assert.rejects(pending, error => error === failure);
            assert.equal(loader.snapshot.batchInFlight, false);
            assert.equal(loader.snapshot.loading, false);
            assert.deepEqual(effects, ["items", "failure"]);
            assert.equal(timers.size, 0);
            loader.reset();
        }

        for (const batch of [
            { total: 3, items: [] },
            { total: -1, items: [] },
            { total: NaN, items: [] },
            { total: Infinity, items: [] },
            { total: "1", items: [{ name: "x" }] },
            { total: 0, items: [{ name: "x" }] },
            { total: 2, items: [{ name: "x" }, { name: "y" }] }
        ]) {
            let reads = 0;
            const effects = [];
            const loader = createVariableMetadataLoader({
                batchSize: 1, activeDelay: 10, idleDelay: 20,
                getDatasetName: () => "data", getItems: () => [],
                setItems: () => {},
                fetchBatch: async () => {
                    reads += 1;
                    assert.equal(reads, 1, "Invalid/no-progress batch must not loop");
                    return batch;
                },
                isVariableViewActive: () => true, shouldPause: () => false,
                renderItems: () => effects.push("items"),
                renderEmpty: () => effects.push("empty"),
                renderFailure: () => effects.push("failure")
            });
            await loader.loadAll(false);
            assert.equal(reads, 1);
            assert.equal(loader.snapshot.failed, true);
            assert.equal(loader.snapshot.batchInFlight, false);
            assert.deepEqual(effects, ["failure"]);
            assert.equal(timers.size, 0);
            loader.reset();
        }

        const previousConsoleError = console.error;
        const reported = [];
        console.error = (...args) => reported.push(args);
        try {
            for (const mode of ["start", "timer", "retired"]) {
                const failure = new Error(`Background ${mode}`);
                let rejectRead;
                const read = new Promise((_resolve, reject) => { rejectRead = reject; });
                const effects = [];
                const loader = createVariableMetadataLoader({
                    batchSize: 1, activeDelay: 10, idleDelay: 20,
                    getDatasetName: () => "data", getItems: () => [],
                    setItems: () => effects.push("items"),
                    fetchBatch: () => read,
                    isVariableViewActive: () => true, shouldPause: () => false,
                    renderItems: () => effects.push("render"),
                    renderEmpty: () => effects.push("empty"),
                    renderFailure: () => effects.push("failure")
                });
                if (mode === "timer") {
                    loader.scheduleBackground();
                    const callback = timers.get(timerSequence);
                    timers.delete(timerSequence);
                    callback();
                } else {
                    loader.startBackground();
                }
                if (mode === "retired") {
                    loader.reset();
                }
                const reportCount = reported.length;
                rejectRead(failure);
                for (let step = 0; step < 12; step += 1) {
                    await Promise.resolve();
                }
                assert.equal(loader.snapshot.batchInFlight, false);
                assert.equal(loader.snapshot.loading, false);
                assert.equal(timers.size, 0);
                assert.deepEqual(effects, mode === "retired" ? [] : ["items", "failure"]);
                assert.equal(reported.length, reportCount + (mode === "retired" ? 0 : 1));
                if (mode !== "retired") {
                    assert.equal(reported.at(-1)[1], failure);
                }
                loader.reset();
            }
        } finally {
            console.error = previousConsoleError;
        }
        console.log("Shared variable loader retirement cases passed (controlled timers, not real Variables acceptance).");
    } finally {
        if (previousWindow === undefined) {
            delete global.window;
        } else {
            global.window = previousWindow;
        }
    }
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
