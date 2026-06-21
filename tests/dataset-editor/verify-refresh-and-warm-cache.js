"use strict";

const assert = require("assert");

const {
    createDatasetEditorWarmCache
} = require("../../shared/dataset-editor/main-process/datasetEditorWarmCache");
const {
    createDatasetEditorWindowController
} = require("../../shared/dataset-editor/main-process/datasetEditorWindowController");
const {
    createDatasetRefreshController
} = require("../../shared/dataset-editor/renderer/datasetRefreshController");

const createDeferred = function() {
    let resolve;
    let reject;

    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return {
        promise,
        resolve,
        reject
    };
};

const createPreview = function(value) {
    return {
        status: "ready",
        objectName: "survey",
        rowStart: 1,
        rowCount: 40,
        totalRows: 40,
        totalColumns: 32,
        columns: Array.from({ length: 32 }, (_item, index) => {
            return `v${index + 1}`;
        }),
        rows: Array.from({ length: 40 }, () => {
            return [value];
        })
    };
};

const verifyPreviewWarmupDoesNotCommitAfterInvalidation = async function() {
    const firstPreview = createDeferred();
    const previews = [firstPreview.promise, Promise.resolve(createPreview("fresh"))];

    const cache = createDatasetEditorWarmCache({
        executeRuntimeMethod: async () => {
            throw new Error("unexpected variable metadata request");
        },
        readVariableMetadata: async () => {
            throw new Error("unexpected variable metadata fallback");
        },
        readTabularPreview: async () => {
            const next = previews.shift();

            assert.ok(next, "preview reads should be bounded");
            return next;
        }
    });

    cache.warmPreview("survey", 32);
    cache.invalidate("survey");

    firstPreview.resolve(createPreview("stale"));
    await firstPreview.promise;

    const preview = await cache.readPreview({
        objectName: "survey",
        rowStart: 1,
        rowCount: 40,
        columnCount: 32
    });

    assert.strictEqual(preview.rows[0][0], "fresh");
    assert.strictEqual(previews.length, 0);
};

const createMetadataBatch = function(value) {
    return {
        status: "ready",
        value: {
            name: "survey",
            total: 2,
            start: 1,
            count: 2,
            items: [
                { name: value, type: "numeric" },
                { name: "other", type: "numeric" }
            ]
        }
    };
};

const verifyVariableWarmupDoesNotCommitAfterInvalidation = async function() {
    const firstMetadata = createDeferred();
    const batches = [
        firstMetadata.promise,
        Promise.resolve(createMetadataBatch("fresh"))
    ];

    const cache = createDatasetEditorWarmCache({
        executeRuntimeMethod: async () => {
            const next = batches.shift();

            assert.ok(next, "variable metadata reads should be bounded");
            return next;
        },
        readVariableMetadata: async () => {
            throw new Error("unexpected variable metadata fallback");
        },
        readTabularPreview: async () => {
            throw new Error("unexpected preview request");
        }
    });

    cache.warmVariableMetadata("survey", 48);
    cache.invalidate("survey");

    firstMetadata.resolve(createMetadataBatch("stale"));
    await firstMetadata.promise;

    const batch = await cache.readVariableMetadata("survey", 1, 2);

    assert.strictEqual(batch.items[0].name, "fresh");
    assert.strictEqual(batches.length, 0);
};

const verifySameDatasetRefreshDoesNotApplyOlderResult = async function() {
    const firstSchema = createDeferred();
    const secondSchema = createDeferred();
    const schemas = [firstSchema.promise, secondSchema.promise];
    const appliedSchemas = [];
    const loadedWindows = [];
    const queuedRefreshes = [];

    const controller = createDatasetRefreshController({
        batchSize: 48,
        normalizeDatasetName: (value) => String(value || "").trim(),
        getCurrentDatasetName: () => "survey",
        getCurrentSchema: () => ({ name: "survey" }),
        openDataset: async () => {},
        syncDatasetSelector: () => {},
        hideHeaderMenu: () => {},
        closeValueLabels: () => {},
        clearEditState: () => {},
        invalidatePendingLoads: () => {},
        markViewportActivity: () => {},
        isVariableViewActive: () => false,
        isVariableMetadataLoaded: () => false,
        resetVariableMetadata: () => {},
        fetchSchema: async () => {
            const next = schemas.shift();

            assert.ok(next, "schema refreshes should be bounded");
            return next;
        },
        applySchema: (schema) => {
            appliedSchemas.push(schema);
        },
        showSchemaFailure: () => {
            throw new Error("unexpected schema failure");
        },
        readViewport: () => ({
            rowStart: 1,
            rowCount: 40,
            columnStart: 1,
            columnEnd: 16
        }),
        resetLoadedWindow: () => {},
        loadWindow: async (viewport) => {
            loadedWindows.push(viewport);
        },
        getVariableHost: () => null,
        getMinimumVisibleVariableRows: () => 48,
        loadVariablesUntil: async () => {},
        ensureVariablesLoaded: async () => {},
        getVariables: () => [],
        renderVariables: () => {},
        renderNoVariables: () => {},
        scheduleBackgroundVariableLoad: () => {},
        queueViewportRefresh: () => {
            queuedRefreshes.push("queued");
        }
    });

    const firstRefresh = controller.refresh("survey");
    const secondRefresh = controller.refresh("survey");

    secondSchema.resolve({ name: "second" });
    await secondRefresh;

    firstSchema.resolve({ name: "first" });
    await firstRefresh;

    assert.deepStrictEqual(appliedSchemas, [{ name: "second" }]);
    assert.strictEqual(loadedWindows.length, 1);
    assert.strictEqual(queuedRefreshes.length, 1);
};

const verifyDatasetEditorWindowLoadFailureRejects = async function() {
    const loadError = new Error("missing page");
    const reportedErrors = [];
    const sentMessages = [];

    const fakeWindow = {
        destroyed: false,
        isDestroyed: function() {
            return this.destroyed;
        },
        setMenu: function() {},
        setTitle: function() {},
        show: function() {
            throw new Error("failed window must not be shown");
        },
        focus: function() {
            throw new Error("failed window must not be focused");
        },
        on: function() {},
        loadFile: async function() {
            throw loadError;
        },
        webContents: {
            setZoomFactor: function() {},
            on: function() {},
            send: function(channel, payload) {
                sentMessages.push({ channel, payload });
            }
        }
    };

    const controller = createDatasetEditorWindowController({
        createWindow: () => fakeWindow,
        pagePath: "/missing/datasetEditor.html",
        getZoomFactor: () => 1,
        createInitPayload: () => ({}),
        listDatasetNames: async () => [],
        onLoadError: (error) => {
            reportedErrors.push(error);
        }
    });

    await assert.rejects(controller.ensureLoaded(), /missing page/);

    assert.strictEqual(controller.isPageLoaded(), false);
    assert.deepStrictEqual(reportedErrors, [loadError]);
    assert.deepStrictEqual(sentMessages, []);
};

const run = async function() {
    await verifyPreviewWarmupDoesNotCommitAfterInvalidation();
    await verifyVariableWarmupDoesNotCommitAfterInvalidation();
    await verifySameDatasetRefreshDoesNotApplyOlderResult();
    await verifyDatasetEditorWindowLoadFailureRejects();

    console.log("Dataset refresh and warm-cache guards verified.");
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
