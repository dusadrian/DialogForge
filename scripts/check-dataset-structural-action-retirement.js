"use strict";

const assert = require("node:assert/strict");
const { createDatasetStructuralActions } = require(
    "../dist/src/dataset-editor/renderer/datasetStructuralActions"
);
const { createDatasetEditorCover } = require(
    "../dist/src/dataset-editor/renderer/datasetEditorCover"
);

const holdReply = function() {
    let resolve;
    let reject;
    const promise = new Promise((accept, fail) => {
        resolve = accept;
        reject = fail;
    });
    return { promise, resolve, reject };
};

const methods = {
    sortRowsByColumn: ["value", false],
    insertColumn: ["value", "after"],
    removeColumn: ["value"],
    insertRow: [1, "after"],
    removeRow: [1]
};

const createFixture = function(retireAt) {
    let datasetName = "data";
    const requests = [];
    const effects = [];
    const label = { textContent: "", hidden: true };
    const cover = createDatasetEditorCover({
        getElementById: name => name === "datasetEditorCover"
            ? { classList: { toggle() {} } } : label
    }, text => text);
    let actions;
    const record = function(name) {
        effects.push(name);
        if (name === retireAt) {
            actions.invalidate();
        }
    };
    const dispatch = function(...args) {
        const reply = holdReply();
        requests.push({ args, reply });
        return reply.promise;
    };
    actions = createDatasetStructuralActions({
        client: {
            sortRows: dispatch, insertColumn: dispatch, removeColumn: dispatch,
            insertRow: dispatch, removeRow: dispatch
        },
        getDatasetName: () => datasetName,
        getSchema: () => ({ columns: [{ name: "value" }] }),
        getLoadedRowNames: () => ["1", "2"],
        translate: text => text,
        confirm: () => { record("confirm"); return retireAt !== "cancel"; },
        hideHeaderMenu: () => record("menu"),
        hideRowMenu: () => record("menu"),
        showLoading: message => {
            const release = cover.showOwnedLoadingCover(message);
            record("cover");
            return release;
        },
        showNotice: () => record("notice"),
        rememberCommand: () => record("command"),
        resetSelectionAfterSort: () => record("selection"),
        refreshDataset: async name => { assert.equal(name, "data"); record("refresh"); }
    });
    return {
        actions, effects, requests, cover, label,
        select: name => { datasetName = name; }
    };
};

const main = async function() {
    for (const [method, args] of Object.entries(methods)) {
        for (const transition of ["current", "dataset", "invalidate", "same-name-reopen"]) {
            for (const outcome of ["success", "null", "exception"]) {
                const fixture = createFixture();
                const pending = fixture.actions[method](...args);
                assert.equal(fixture.requests.length, 1);
                assert.equal(fixture.requests[0].args[0], "data");
                assert.equal(fixture.cover.isLoading, true);
                const beforeReply = fixture.effects.length;
                if (transition === "dataset") {
                    fixture.select("replacement");
                } else if (transition !== "current") {
                    fixture.actions.invalidate();
                    if (transition === "same-name-reopen") {
                        fixture.select("replacement");
                        fixture.select("data");
                    }
                }
                const failure = new Error("structural mutation rejected");
                if (outcome === "exception") {
                    fixture.requests[0].reply.reject(failure);
                } else {
                    fixture.requests[0].reply.resolve(outcome === "null" ? null : { command: "sort(data)" });
                }
                if (transition === "current" && outcome === "exception") {
                    await assert.rejects(pending, error => error === failure);
                } else {
                    await pending;
                }
                const expected = transition !== "current" || outcome === "exception" ? []
                    : outcome === "success" && method === "sortRowsByColumn"
                        ? ["command", "selection", "refresh", "notice"] : ["notice"];
                assert.deepEqual(fixture.effects.slice(beforeReply), expected);
                assert.equal(fixture.cover.isLoading, false);
            }
        }
        for (const stage of ["menu", "cover", "confirm", "cancel"]) {
            if (["confirm", "cancel"].includes(stage) && !method.startsWith("remove")) {
                continue;
            }
            const fixture = createFixture(stage);
            await fixture.actions[method](...args);
            assert.equal(fixture.requests.length, 0);
            assert.equal(fixture.cover.isLoading, false);
        }
    }
    for (const stage of ["command", "selection", "refresh"]) {
        const fixture = createFixture(stage);
        const pending = fixture.actions.sortRowsByColumn("value", false);
        fixture.requests[0].reply.resolve({ command: "sort(data)" });
        await pending;
        const normal = ["command", "selection", "refresh", "notice"];
        assert.deepEqual(fixture.effects.slice(2), normal.slice(0, normal.indexOf(stage) + 1));
    }
    const fixture = createFixture();
    const oldAction = fixture.actions.insertRow(1, "after");
    fixture.actions.invalidate();
    const replacement = fixture.actions.removeRow(1);
    const replacementMessage = fixture.label.textContent;
    fixture.requests[0].reply.resolve({});
    await oldAction;
    assert.equal(fixture.cover.isLoading, true);
    assert.equal(fixture.label.textContent, replacementMessage);
    assert.equal(fixture.effects.includes("notice"), false);
    fixture.requests[1].reply.resolve({});
    await replacement;
    assert.equal(fixture.cover.isLoading, false);
    assert.equal(fixture.effects.filter(effect => effect === "notice").length, 1);
    console.log("Shared direct structural-action retirement cases passed (controlled, not paired rendered acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
