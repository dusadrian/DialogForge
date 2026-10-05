"use strict";

const assert = require("node:assert/strict");
const { createDatasetCellMutationController } = require(
    "../dist/src/dataset-editor/renderer/datasetCellMutationController"
);
const { createInitialDatasetEditorState } = require(
    "../dist/src/dataset-editor/state/datasetEditorState"
);
const { captureRuntimeSessionScope } = require(
    "../dist/src/runtime/session/runtimeSessionScope"
);


const checkConsumer = async function(transition, retireAt, status = "updated") {
    let session = {
        providerId: "fixture", lifecycleGeneration: 1, status: "ready"
    };
    let objectName = "data";
    let state = createInitialDatasetEditorState();
    state.selection = { ...state.selection, kind: "data-cell",
        objectName: "data", rowIndex: 0, columnName: "x" };
    state.editing = { active: true, value: "43" };
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const effects = [];
    const requests = [];
    const receipt = { status, objectName: "data", message: "Original receipt" };
    const record = function(name, value) {
        effects.push(name);
        if (name === "receipt") {
            assert.equal(value, receipt);
        }
        if (name === retireAt) {
            session = { ...session, lifecycleGeneration: 2 };
        }
    };
    const controller = createDatasetCellMutationController({
        controls: { row: { value: "0" }, column: { value: "x" }, value: { value: "43" } },
        getState: () => state,
        setState: value => { state = value; record("state"); },
        getObjectName: () => objectName,
        getRuntimeSnapshot: () => session,
        getUiCommandVisibility: () => "visible",
        renderStatus: () => assert.fail("Valid cell must reach mutation"),
        writeCell: request => { requests.push(request); return held; },
        renderResult: value => record("receipt", value),
        renderSelection: () => record("selection"),
        refreshDataset: () => record("dataset"),
        refreshVariableMetadata: () => record("metadata"),
        refreshValueLabels: () => record("labels"),
        refreshDeclaredMissing: () => record("missing"),
        refreshRuntimeEvents: () => record("events")
    });
    const pending = controller.write();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].rowIndex, 0);
    assert.equal(requests[0].uiCommandVisibility, "visible");

    if (transition === "generation") {
        session = { ...session, lifecycleGeneration: 2 };
    } else if (transition === "in-place-generation") {
        session.lifecycleGeneration = 2;
    } else if (transition === "provider") {
        session = { ...session, providerId: "replacement" };
    } else if (transition === "status") {
        session = { ...session, status: "stopped" };
    } else if (transition === "dataset") {
        objectName = "replacement";
    } else if (transition === "missing-session") {
        session = null;
    } else if (transition === "equivalent-snapshot") {
        session = { ...session };
    }
    release(receipt);
    await pending;

    const normal = ["receipt", "state", "selection", "dataset", "metadata", "labels", "missing", "events"];
    if (transition && transition !== "equivalent-snapshot") {
        assert.deepEqual(effects, []);
        assert.equal(state.editing.active, true);
    } else if (retireAt) {
        assert.deepEqual(effects, normal.slice(0, normal.indexOf(retireAt) + 1));
    } else {
        assert.deepEqual(effects, status === "updated" ? normal : ["receipt"]);
    }
};


const main = async function() {
    for (const transition of ["generation", "in-place-generation", "provider", "status", "dataset", "missing-session", "equivalent-snapshot"]) {
        await checkConsumer(transition);
    }
    for (const stage of ["receipt", "state", "selection", "dataset", "metadata", "labels", "missing"]) {
        await checkConsumer(null, stage);
    }
    await checkConsumer(null, null);
    await checkConsumer(null, null, "failed");
    assert.equal(captureRuntimeSessionScope(() => null)(), false);
    console.log("Shared cell consumer retirement cases passed (controlled renderer, not real host acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
