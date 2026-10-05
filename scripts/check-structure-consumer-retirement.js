"use strict";

const assert = require("node:assert/strict");
const { createDatasetStructureMutationController } = require(
    "../dist/src/dataset-editor/renderer/datasetStructureMutationController"
);


const checkConsumer = async function(method, transition, retireAt, status = "updated") {
    let session = { providerId: "fixture", lifecycleGeneration: 1, status: "ready" };
    let objectName = "data";
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const effects = [];
    const requests = [];
    const receipt = { status, objectName: "data", message: "Actual receipt" };
    const record = function(name, value) {
        effects.push(name);
        if (name === "receipt") {
            assert.equal(value, receipt);
        }
        if (name === retireAt) {
            session = { ...session, lifecycleGeneration: 2 };
        }
    };
    const dispatch = function(request) {
        requests.push(request);
        return held;
    };
    const answerModal = function() {
        if (transition === "modal-retirement") {
            session = { ...session, lifecycleGeneration: 2 };
        }
        return transition !== "cancel";
    };
    const controller = createDatasetStructureMutationController({
        controls: {
            columnRenameFrom: { value: "x" }, columnRenameTo: { value: "renamed" },
            columnInsertName: { value: "new" }, columnInsertPosition: { value: "after" },
            rowNameIndex: { value: "0" }, rowNameValue: { value: "named" },
            rowStructurePosition: { value: "after" }
        },
        getSelection: () => ({ kind: "data-cell", objectName, rowIndex: 0,
            columnName: "x", metadataKey: "", anchorRowIndex: 0, focusRowIndex: 0 }),
        getPreview: () => ({ objectName, columns: [{ name: "x" }] }),
        getRuntimeSnapshot: () => session,
        getUiCommandVisibility: () => "visible",
        confirm: answerModal,
        prompt: () => answerModal() ? "named" : null,
        renderStatus: () => record("status"),
        renderColumnRename: value => record("receipt", value),
        renderColumnStructure: value => record("receipt", value),
        renderRowNameUpdate: value => record("receipt", value),
        renderRowStructure: value => record("receipt", value),
        renameColumn: dispatch, insertColumn: dispatch, removeColumn: dispatch,
        updateRowName: dispatch, insertRow: dispatch, removeRow: dispatch, sortRows: dispatch,
        refreshDataset: () => record("dataset"),
        refreshVariableMetadata: () => record("metadata"),
        refreshValueLabels: () => record("labels"),
        refreshDeclaredMissing: () => record("missing"),
        refreshRuntimeEvents: () => record("events")
    });
    const pending = controller[method](method === "sortRows" ? "descending" : undefined);
    if (transition === "modal-retirement" || transition === "cancel") {
        await pending;
        assert.equal(requests.length, 0);
        assert.deepEqual(effects, transition === "cancel" ? ["status"] : []);
        return;
    }
    assert.equal(requests.length, 1);
    assert.equal(requests[0].uiCommandVisibility, "visible");
    if (transition === "generation") {
        session = { ...session, lifecycleGeneration: 2 };
    } else if (transition === "provider") {
        session = { ...session, providerId: "replacement" };
    } else if (transition === "status") {
        session = { ...session, status: "stopped" };
    } else if (transition === "dataset") {
        objectName = "replacement";
    }
    release(receipt);
    await pending;
    const normal = method.includes("Column")
        ? ["receipt", "dataset", "metadata", "labels", "missing", "events"]
        : ["receipt", "dataset", "events"];
    if (transition) {
        assert.deepEqual(effects, []);
    } else if (retireAt) {
        assert.deepEqual(effects, normal.slice(0, normal.indexOf(retireAt) + 1));
    } else {
        assert.deepEqual(effects, status === "updated" ? normal : ["receipt"]);
    }
};


const main = async function() {
    for (const method of ["renameColumn", "insertColumn", "removeColumn", "updateRowName", "renameSelectedRow", "insertRow", "removeRow", "sortRows"]) {
        for (const transition of ["generation", "provider", "status", "dataset"]) {
            await checkConsumer(method, transition);
        }
        await checkConsumer(method, null, null);
        await checkConsumer(method, null, null, "failed");
        for (const stage of method.includes("Column")
            ? ["receipt", "dataset", "metadata", "labels", "missing"] : ["receipt", "dataset"]) {
            await checkConsumer(method, null, stage);
        }
    }
    for (const method of ["removeColumn", "removeRow", "renameSelectedRow"]) {
        await checkConsumer(method, "modal-retirement");
        await checkConsumer(method, "cancel");
    }
    console.log("Shared structural consumer cases passed (controlled renderer, not real modal/host acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
