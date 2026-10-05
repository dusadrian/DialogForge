"use strict";

const assert = require("node:assert/strict");
const { createDatasetViewerReadIpcController } = require(
    "../dist/src/shell-electron/dataset-editor/datasetViewerReadIpcController"
);
const { createRuntimeSessionDatasetChannelAdapter } = require(
    "../dist/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter"
);
const { datasetEditorIpcChannels } = require("../dist/src/dataset-editor/datasetEditorIpc");


const checkRead = async function(host, method, transition, fallback = false) {
    let session = { providerId: "fixture", lifecycleGeneration: 1, status: "ready" };
    let current = true;
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let reads = 0;
    const preview = { status: "ready", objectName: "data", columns: [{ name: "x", type: "numeric" }],
        rows: [{ x: 43 }], rowCount: 1, columnCount: 1, rowOffset: 0,
        totalRowCount: 1, totalColumnCount: 1 };
    const metadata = { status: "ready", variables: [{ name: "x" }] };
    const batch = { name: "data", total: 1, start: 1, count: 1, items: metadata.variables };
    const dispatch = function() {
        reads += 1;
        return reads === 1 ? held : Promise.resolve(metadata);
    };
    const runtime = {
        getSnapshot: () => session,
        getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
        readTabularSchema: dispatch,
        readVariableMetadata: dispatch,
        executeRuntimeMethod: dispatch
    };
    const readBatch = fallback ? undefined : dispatch;
    let read;
    if (host === "native") {
        const handlers = new Map();
        createDatasetViewerReadIpcController({
            ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
            runtimeSessionManager: runtime,
            readInitialDatasetPreview: dispatch,
            readInitialVariableMetadataBatch: readBatch,
            getFilterState: () => ({ command: "x > 0" })
        });
        const channels = { readSchema: "getSchema", readContent: "getContent",
            readVariables: "getVariables", readVariableBatch: "getVariablesBatch", readFilterMask: "getFilterMask" };
        read = input => handlers.get(datasetEditorIpcChannels[channels[method]])({}, input);
    } else {
        const adapter = createRuntimeSessionDatasetChannelAdapter({
            runtimeSessionManager: runtime,
            isCurrentRuntime: () => current,
            readTabularPreview: dispatch,
            readVariableMetadataBatch: readBatch,
            readFilterState: () => ({ command: "x > 0" }),
            invalidateDataset: () => assert.fail("Read must not invalidate")
        });
        read = input => adapter[method](method === "readSchema" ? input.name : input);
    }
    const pending = read({ name: "data", rowCount: 1, start: 1, count: 1 });
    assert.equal(reads, 1);
    if (transition === "generation") {
        session = { ...session, lifecycleGeneration: 2 };
    } else if (transition === "provider") {
        session = { ...session, providerId: "replacement" };
    } else if (transition === "status") {
        session = { ...session, status: "stopped" };
    } else if (transition === "replacement") {
        current = false;
    }
    const result = fallback ? { status: "unavailable" }
        : method === "readVariables" ? metadata
        : method === "readVariableBatch" ? batch
        : method === "readFilterMask" ? { status: "ready", value: { name: "data", mask: [true] } }
        : preview;
    release(result);
    const delivered = await pending;
    if (transition !== "none") {
        assert.equal(delivered, null, "Retired viewer read must not deliver old data");
        assert.equal(reads, 1, "Retired batch must not dispatch fallback metadata read");
    } else {
        assert.ok(delivered);
        assert.equal(reads, fallback ? 2 : 1);
    }
};


const main = async function() {
    for (const host of ["native", "browser"]) {
        for (const method of ["readSchema", "readContent", "readVariables", "readVariableBatch", "readFilterMask"]) {
            for (const transition of ["generation", "provider", "status", "none", ...(host === "browser" ? ["replacement"] : [])]) {
                await checkRead(host, method, transition);
            }
        }
        await checkRead(host, "readVariableBatch", "generation", true);
        await checkRead(host, "readVariableBatch", "none", true);
    }
    console.log("Both compiled viewer adapters retirement cases passed (controlled runtime, not physical R/WebR acceptance).");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
