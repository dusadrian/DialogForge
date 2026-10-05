"use strict";

const assert = require("node:assert/strict");
const { createDatasetMetadataMutationController } = require(
    "../dist/src/dataset-editor/renderer/datasetMetadataMutationController"
);
const { createInitialDatasetEditorState } = require(
    "../dist/src/dataset-editor/state/datasetEditorState"
);


const checkConsumer = async function(method, transition, status = "updated") {
    let session = { providerId: "fixture", lifecycleGeneration: 1, status: "ready" };
    let objectName = "data";
    let state = createInitialDatasetEditorState();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const effects = [];
    const requests = [];
    const receipt = { status, objectName: "data", message: "Actual result" };
    const isWrite = method.startsWith("write");
    const record = function(name, value) {
        effects.push(name);
        if (name === "receipt") {
            assert.equal(value, receipt);
            if (transition === "render-retirement") {
                session = { ...session, lifecycleGeneration: 2 };
            }
        }
    };
    const bindings = {
        controls: {
            variableName: { value: "x" }, metadataKey: { value: "label" },
            metadataValue: { value: "Edited" }, valueLabelVariable: { value: "x" },
            valueLabelValue: { value: "1" }, valueLabelLabel: { value: "One" },
            declaredMissingVariable: { value: "x" }, declaredMissingValue: { value: "99" },
            declaredMissingLabel: { value: "Missing" }
        },
        getState: () => state,
        setState: value => { state = value; record("state"); },
        getObjectName: () => objectName,
        getRuntimeSnapshot: () => session,
        getUiCommandVisibility: () => "visible",
        renderStatus: () => assert.fail("Valid fixture must dispatch"),
        renderSelection: () => record("selection"),
        renderVariableMetadataUpdate: value => record("receipt", value),
        renderValueLabelUpdate: value => record("receipt", value),
        renderDeclaredMissingUpdate: value => record("receipt", value),
        renderVariableMetadata: () => record("snapshot"),
        renderValueLabels: () => record("snapshot"),
        renderDeclaredMissing: () => record("snapshot"),
        readVariableMetadata: async () => ({ status: "ready", objectName: "data" }),
        readValueLabels: async () => ({ status: "ready", objectName: "data" }),
        readDeclaredMissing: async () => ({ status: "ready", objectName: "data" }),
        refreshRuntimeEvents: () => record("events"),
        [method]: request => { requests.push(request); return held; }
    };
    const controller = createDatasetMetadataMutationController(bindings);
    const pending = controller[method]("data");
    assert.equal(requests.length, 1);
    if (isWrite) {
        assert.equal(requests[0].uiCommandVisibility, "visible");
    }
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
    }
    release(receipt);
    await pending;
    await Promise.resolve();
    if (transition === "render-retirement") {
        assert.deepEqual(effects, ["receipt"]);
    } else if (transition) {
        assert.deepEqual(effects, []);
    } else if (!isWrite) {
        assert.deepEqual(effects, ["snapshot"]);
    } else if (status !== "updated") {
        assert.deepEqual(effects, ["receipt"]);
    } else {
        assert.equal(effects[0], "receipt");
        assert.ok(effects.includes("events"));
        assert.ok(effects.includes("snapshot"));
    }
};


const main = async function() {
    for (const method of ["readVariableMetadata", "readValueLabels", "readDeclaredMissing", "writeVariableMetadata", "writeValueLabels", "writeDeclaredMissing"]) {
        for (const transition of ["generation", "in-place-generation", "provider", "status", "dataset", "missing-session"]) {
            await checkConsumer(method, transition);
        }
        await checkConsumer(method, null);
        if (method.startsWith("write")) {
            await checkConsumer(method, "render-retirement");
            await checkConsumer(method, null, "failed");
        }
    }
    console.log("Shared metadata consumer cases passed (controlled renderer, not paired host acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
