const assert = require("node:assert/strict");
const {
    toDatasetViewerContent,
    toDatasetViewerSchema
} = require("../dist/src/runtime/tabular-data/datasetViewerReadProjection");
const native = require("../dist/src/shell-electron/dataset-editor/datasetViewerAdapter");
const { createColumn } = require("../dist/src/runtime/tabular-data/tabularProtocol");
const { warmDatasetEditorFirstScreens } = require("../dist/src/dataset-editor/datasetEditorWarmCache");
const { createRuntimeSessionDatasetChannelAdapter } = require("../dist/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter");
const { createDatasetViewerReadController } = require("../dist/src/runtime/tabular-data/datasetViewerReadController");
const { createDatasetViewerReadIpcController } = require("../dist/src/shell-electron/dataset-editor/datasetViewerReadIpcController");
const { datasetEditorIpcChannels } = require("../dist/src/dataset-editor/datasetEditorIpc");

assert.equal(native.toDatasetViewerContent, toDatasetViewerContent);
assert.equal(native.toDatasetViewerSchema, toDatasetViewerSchema);
assert.equal(createColumn({ name: "value", type: "numeric", decimals: 2 }).decimals, 2);

const columns = [
    { name: "value", type: "numeric", decimals: 2 },
    { name: "label", type: "character" }
];
const preview = {
    status: "ready",
    objectName: "fixture",
    columns,
    totalColumnCount: 12,
    totalRowCount: 100,
    rowOffset: 4,
    rowNames: ["five", "six"],
    rows: [
        { value: { display: "1.25", raw: "1.25", declaredMissing: true }, label: null },
        { value: 2.5, label: "second" }
    ]
};
const page = toDatasetViewerContent(preview, { columns: ["label", "value"], rowCount: 1 });
assert.equal(page.rowStart, 5);
assert.equal(page.rowCount, 1);
assert.equal(page.totalRowCount, 100);
assert.equal(page.totalColumnCount, 12);
assert.deepEqual(page.rowNames, ["five"]);
assert.deepEqual(page.columns.map(column => column.name), ["label", "value"]);
assert.equal(page.columns[1].decimals, 2);
assert.deepEqual(page.rows[0], [
    { display: "", raw: "" },
    { display: "1.25", raw: "1.25", declaredMissing: true }
]);
assert.equal(toDatasetViewerSchema({ ...preview, rowCount: 100, columnCount: 12 }).columns[0].decimals, 2);
assert.equal(toDatasetViewerContent({ status: "unavailable" }), null);
assert.equal(toDatasetViewerSchema(null), null);

const warmed = [];
warmDatasetEditorFirstScreens(
    name => warmed.push(["data", name]),
    name => warmed.push(["variables", name]),
    " fixture "
);
warmDatasetEditorFirstScreens(() => assert.fail("empty data warmup"),
    () => assert.fail("empty variables warmup"), " ");
assert.deepEqual(warmed, [["data", "fixture"], ["variables", "fixture"]]);

const checkWarmPreviewChannel = async function() {
    let reads = 0;
    const channel = createRuntimeSessionDatasetChannelAdapter({
        runtimeSessionManager: {
            getSnapshot: () => ({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" }),
            getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
            async readTabularPreview() { assert.fail("bypassed supplied warm-cache reader"); }
        },
        async readTabularPreview(request) {
            reads += 1;
            assert.equal(request.objectName, "fixture");
            assert.equal(request.rowCount, 1);
            return preview;
        },
        invalidateDataset() {}
    });
    const content = await channel.readContent({ name: "fixture", rowCount: 1 });
    assert.equal(reads, 1);
    assert.equal(content.rowCount, 1);
    assert.equal(content.columns[0].decimals, 2);
};

const checkSharedReadRoutes = async function() {
    const requests = [];
    const batches = [];
    const runtime = {
        getSnapshot: () => ({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" }),
        getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
        async readTabularSchema(name) {
            assert.equal(name, "fixture");
            return { ...preview, rowCount: 100, columnCount: 12 };
        },
        async readVariableMetadata(name) {
            assert.equal(name, "fixture");
            return { status: "ready", variables: columns };
        },
        async executeRuntimeMethod() { assert.fail("bypassed supplied batch reader"); }
    };
    const readPreview = async request => { requests.push(request); return preview; };
    const readBatch = async (name, start, count) => {
        batches.push({ name, start, count });
        return { name, total: 2, start, count: 2, items: columns };
    };
    const shared = createDatasetViewerReadController({
        runtimeSessionManager: runtime,
        readTabularPreview: readPreview,
        readVariableMetadataBatch: readBatch,
        readFilterState: () => null
    });
    const handlers = new Map();
    createDatasetViewerReadIpcController({
        ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
        runtimeSessionManager: runtime,
        readInitialDatasetPreview: readPreview,
        readInitialVariableMetadataBatch: readBatch,
        getFilterState: () => null
    });
    const payload = { name: " fixture ", rowStart: 5, rowCount: 1, columns: ["value"] };
    const invoke = (channel, value) => handlers.get(channel)({}, value);
    assert.deepEqual(await invoke(datasetEditorIpcChannels.getContent, payload),
        await shared.readContent(payload));
    assert.deepEqual(requests[0], requests[1]);
    assert.deepEqual(await invoke(datasetEditorIpcChannels.getSchema, payload),
        await shared.readSchema(payload.name));
    assert.deepEqual(await invoke(datasetEditorIpcChannels.getVariables, payload),
        await shared.readVariables(payload));
    assert.deepEqual(await invoke(datasetEditorIpcChannels.getVariablesBatch, payload),
        await shared.readVariableBatch(payload));
    assert.deepEqual(batches[0], { name: "fixture", start: 1, count: 16 });
    assert.deepEqual(batches[0], batches[1]);
    const browser = createRuntimeSessionDatasetChannelAdapter({
        runtimeSessionManager: runtime,
        readTabularPreview: readPreview,
        readVariableMetadataBatch: readBatch,
        invalidateDataset() {}
    });
    for (const input of [
        { name: "fixture" },
        { name: "fixture", rowStart: -1, rowCount: 0, columnCount: NaN }
    ]) {
        await invoke(datasetEditorIpcChannels.getContent, input);
        await browser.readContent(input);
        assert.deepEqual(requests.at(-1), requests.at(-2));
        assert.equal(requests.at(-1).rowStart, 1);
        assert.equal(requests.at(-1).rowCount, 40);
        assert.equal(requests.at(-1).columnCount, 32);
    }
    await browser.readVariableBatch({ name: "fixture", count: 0 });
    assert.deepEqual(batches.at(-1), { name: "fixture", start: 1, count: 16 });
    assert.deepEqual(await browser.readFilterMask({ name: "fixture" }),
        await invoke(datasetEditorIpcChannels.getFilterMask, { name: "fixture" }));
    assert.equal(await shared.readVariables({ name: " " }), null);
    assert.equal(await shared.readVariableBatch({ name: " " }), null);
    assert.equal(await shared.readContent({ name: " " }), null);
};

const checkUnavailableVariableFallback = async function() {
    for (const status of ["unavailable", "error", "ready"]) {
        const runtime = {
            getSnapshot: () => ({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" }),
            getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
            executeRuntimeMethod: async () => ({ status: "unavailable" }),
            readVariableMetadata: async () => ({ status, variables: [] })
        };
        const shared = createDatasetViewerReadController({
            runtimeSessionManager: runtime,
            readFilterState: () => null
        });
        const browser = createRuntimeSessionDatasetChannelAdapter({
            runtimeSessionManager: runtime,
            invalidateDataset() {}
        });
        const expected = status === "ready"
            ? { name: "fixture", total: 0, start: 1, count: 0, items: [] }
            : null;
        assert.deepEqual(await shared.readVariableBatch({ name: "fixture" }), expected);
        assert.deepEqual(await browser.readVariableBatch({ name: "fixture" }), expected);
    }
};

Promise.all([checkWarmPreviewChannel(), checkSharedReadRoutes(), checkUnavailableVariableFallback()]).then(() => {
    console.log("Shared dataset read projection cases passed.");
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
