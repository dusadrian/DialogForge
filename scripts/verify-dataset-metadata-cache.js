"use strict";

const path = require("path");


const outputRoot = path.resolve(
    process.env.DIALOGFORGE_DIST_DIR || path.join(__dirname, "..", "dist")
);
const {
    createRuntimeDialogDatasetResolver
} = require(path.join(
    outputRoot,
    "src",
    "dialog-runtime",
    "custom-js",
    "runtimeDatasetResolver.js"
));
const {
    createDatasetEditorWarmCache
} = require(path.join(
    outputRoot,
    "src",
    "dataset-editor",
    "datasetEditorWarmCache.js"
));


const assert = function(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
};


const variable = function(name, label = name) {
    return {
        name,
        type: "numeric",
        measure: "scale",
        label
    };
};


const verifyDialogResolver = async function() {
    const snapshot = {
        status: "ready",
        objects: [{
            name: "data",
            kind: "data.frame",
            capabilities: ["tabular.schema"],
            columns: ["x", "y"],
            columnEntries: [variable("x"), variable("y")],
            provenance: {}
        }]
    };
    let listCalls = 0;
    let schemaCalls = 0;
    const resolveDatasets = createRuntimeDialogDatasetResolver({
        getWorkspaceSnapshot: function() {
            return snapshot;
        },
        listWorkspaceObjects: async function() {
            listCalls += 1;
            return snapshot;
        },
        readTabularSchema: async function() {
            schemaCalls += 1;
            return { status: "ready", columns: [] };
        }
    });

    await resolveDatasets();
    await resolveDatasets();
    assert(listCalls === 0, "Dialog resolver listed an already prepared workspace.");
    assert(schemaCalls === 0, "Dialog resolver rescanned prepared variable metadata.");
};


const verifyMetadataCache = async function() {
    const variables = Array.from({ length: 245 }, function(_value, index) {
        return variable(`v${index + 1}`);
    });
    let pageCalls = 0;
    let namedCalls = 0;
    const cache = createDatasetEditorWarmCache({
        executeRuntimeMethod: async function(request) {
            const params = request.params || {};

            if (request.method === "workspace.dataset_variables_batch") {
                pageCalls += 1;
                const start = Number(params.start);
                const count = Number(params.count);

                return {
                    status: "ready",
                    value: {
                        name: "data",
                        total: variables.length,
                        start,
                        count: Math.min(count, variables.length - start + 1),
                        items: variables.slice(start - 1, start - 1 + count)
                    }
                };
            }

            if (request.method === "workspace.dataset_variables_named") {
                namedCalls += 1;
                return {
                    status: "ready",
                    value: {
                        name: "data",
                        total: variables.length,
                        items: [variable("v220", "changed")]
                    }
                };
            }

            throw new Error(`Unexpected runtime method: ${request.method}`);
        },
        readTabularPreview: async function() {
            return { status: "unsupported", columns: [], rows: [] };
        },
        readVariableMetadata: async function() {
            return { status: "ready", variables };
        }
    });

    cache.warmVariableMetadata("data");
    cache.patchVariableMetadata("data", "v2", variable("v2", "edited"));

    const lateRange = await cache.readVariableMetadata("data", 201, 20);

    assert(pageCalls === 3, `Expected three metadata pages, received ${pageCalls}.`);
    assert(lateRange.items.length === 20, "The complete metadata cache lost variables.");

    const earlyEdit = await cache.readVariableMetadata("data", 2, 1);

    assert(
        earlyEdit.items[0]?.label === "edited",
        "A metadata edit was overwritten while background paging completed."
    );

    await cache.refreshVariableMetadata("data", ["v220"]);
    const changed = await cache.readVariableMetadata("data", 220, 1);

    assert(namedCalls === 1, "A metadata delta did not use the named-variable route.");
    assert(changed.items[0]?.label === "changed", "A metadata delta missed the cache.");
    assert(pageCalls === 3, "A cached metadata read started another full sweep.");
};


const verifyMetadataWarmupRecovery = async function() {
    const variables = Array.from({ length: 145 }, function(_value, index) {
        return variable(`r${index + 1}`);
    });
    const pageStarts = [];
    let failSecondPage = true;
    const cache = createDatasetEditorWarmCache({
        executeRuntimeMethod: async function(request) {
            const params = request.params || {};
            const start = Number(params.start);
            const count = Number(params.count);

            pageStarts.push(start);

            if (start === 49 && failSecondPage) {
                failSecondPage = false;
                throw new Error("simulated metadata page failure");
            }

            return {
                status: "ready",
                value: {
                    name: "recovery",
                    total: variables.length,
                    start,
                    count: Math.min(count, variables.length - start + 1),
                    items: variables.slice(start - 1, start - 1 + count)
                }
            };
        },
        readTabularPreview: async function() {
            return { status: "unsupported", columns: [], rows: [] };
        },
        readVariableMetadata: async function() {
            return { status: "ready", variables };
        }
    });

    cache.warmVariableMetadata("recovery");
    await new Promise(function(resolve) {
        setTimeout(resolve, 10);
    });
    cache.warmVariableMetadata("recovery");

    const lateRange = await cache.readVariableMetadata("recovery", 130, 10);

    assert(lateRange.items.length === 10, "A resumed metadata warmup stayed partial.");
    assert(
        JSON.stringify(pageStarts) === JSON.stringify([1, 49, 49]),
        `Metadata warmup restarted instead of resuming: ${JSON.stringify(pageStarts)}.`
    );
};


Promise.all([
    verifyDialogResolver(),
    verifyMetadataCache(),
    verifyMetadataWarmupRecovery()
]).then(function() {
    console.log("Shared dialog and dataset metadata caches verified.");
}).catch(function(error) {
    console.error(error);
    process.exit(1);
});
