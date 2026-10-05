"use strict";

const assert = require("node:assert/strict");
const { createVariableMetadataController } = require("../dist/src/dataset-editor/renderer/variableMetadataController");


const main = async function() {
    const previousWindow = global.window;
    let timerSequence = 0;
    const timers = new Map();
    global.window = {
        setTimeout(callback) {
            const id = ++timerSequence;
            timers.set(id, callback);
            return id;
        },
        clearTimeout(id) { timers.delete(id); }
    };
    try {
        for (const scenario of [
            "reset", "name", "render-reset", "priority-change",
            "unavailable", "retained-unavailable", "empty", "ordinary", "throw", "retired-throw"
        ]) {
            let datasetName = "data";
            let items = scenario === "retained-unavailable" ? [{ name: "retained" }] : [];
            let resolveRead;
            let rejectRead;
            const read = new Promise((resolve, reject) => {
                resolveRead = resolve;
                rejectRead = reject;
            });
            const effects = [];
            let controller;
            controller = createVariableMetadataController({
                batchSize: 1, activeDelay: 10, idleDelay: 20,
                getDatasetName: () => datasetName,
                getItems: () => items,
                setItems: value => { items = value; effects.push("items"); },
                fetchBatch: () => read,
                isVariableViewActive: () => true, shouldPause: () => false,
                getVariableHost: () => null, getMinimumVisibleRows: () => 1,
                renderItems: () => {
                    effects.push("render");
                    if (scenario === "render-reset") {
                        controller.reset();
                    } else if (scenario === "priority-change") {
                        controller.prioritizeRow(8);
                    }
                },
                renderEmpty: () => effects.push("empty"),
                renderFailure: () => effects.push("failure"),
                scrollRowIntoView: row => effects.push(`scroll:${row}`)
            });
            controller.prioritizeRow(0);
            const pending = controller.activate();
            if (scenario === "reset" || scenario === "retired-throw") {
                controller.reset();
            } else if (scenario === "name") {
                datasetName = "replacement";
            }
            const failure = new Error("Variable read failed");
            if (scenario === "throw" || scenario === "retired-throw") {
                rejectRead(failure);
            } else {
                resolveRead(scenario.endsWith("unavailable") ? null : {
                    total: scenario === "empty" ? 0 : 1,
                    items: scenario === "empty" ? [] : [{ name: "x" }]
                });
            }
            if (scenario === "throw") {
                await assert.rejects(pending, error => error === failure);
            } else {
                await pending;
            }
            if (["reset", "name", "retired-throw"].includes(scenario)) {
                assert.deepEqual(effects, []);
            } else if (scenario === "render-reset") {
                assert.deepEqual(effects, ["items", "render"]);
            } else if (scenario.endsWith("unavailable") || scenario === "throw") {
                assert.ok(effects.includes(scenario === "retained-unavailable" ? "render" : "failure"));
                assert.ok(!effects.includes("empty"));
                assert.ok(!effects.some(effect => effect.startsWith("scroll:")));
                assert.equal(controller.snapshot.failed, true);
                assert.equal(controller.snapshot.batchInFlight, false);
            } else if (scenario === "priority-change") {
                assert.ok(!effects.some(effect => effect.startsWith("scroll:")));
            } else {
                assert.equal(controller.snapshot.failed, false);
                assert.ok(effects.includes(scenario === "empty" ? "empty" : "render"));
                assert.ok(effects.includes("scroll:0"));
            }
            assert.equal(timers.size, 0);
            controller.reset();
            assert.equal(controller.snapshot.failed, false);
        }
        console.log("Shared Variables activation cases passed (controlled reads, not rendered host acceptance).");
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
