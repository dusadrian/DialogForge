"use strict";

const path = require("path");


const outputRoot = path.resolve(
    process.env.DIALOGFORGE_DIST_DIR || path.join(__dirname, "..", "dist")
);
const {
    createRuntimeDialogDatasetResolver,
    createRuntimeDialogDatasetResolverOwner
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
        providerId: "r",
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
        getSnapshot: () => ({ providerId: "r", status: "ready", lifecycleGeneration: 1 }),
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
    let reportPageFailure;
    const pageFailure = new Promise(function(resolve) {
        reportPageFailure = resolve;
    });
    const cache = createDatasetEditorWarmCache({
        executeRuntimeMethod: async function(request) {
            const params = request.params || {};
            const start = Number(params.start);
            const count = Number(params.count);

            pageStarts.push(start);

            if (start === 49 && failSecondPage) {
                failSecondPage = false;
                reportPageFailure();
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
    await pageFailure;
    // Let the failed warmup's promise cleanup complete before requesting
    // recovery, even when other build work delays the first page's timer.
    await new Promise(function(resolve) {
        setImmediate(resolve);
    });
    cache.warmVariableMetadata("recovery");

    const lateRange = await cache.readVariableMetadata("recovery", 130, 10);

    assert(lateRange.items.length === 10, "A resumed metadata warmup stayed partial.");
    assert(
        JSON.stringify(pageStarts) === JSON.stringify([1, 49, 49]),
        `Metadata warmup restarted instead of resuming: ${JSON.stringify(pageStarts)}.`
    );
};


const verifySlowFirstMetadataPage = async function(copyTarget, invalidateWarmup) {
    const variables = Array.from({ length: 145 }, function(_value, index) {
        return variable(`s${index + 1}`);
    });
    const pageCalls = [];
    let releaseFirstPage;
    let releaseBackground;
    const firstPageReady = new Promise(function(resolve) {
        releaseFirstPage = resolve;
    });
    const backgroundReady = new Promise(function(resolve) {
        releaseBackground = resolve;
    });
    const cache = createDatasetEditorWarmCache({
        executeRuntimeMethod: async function(request) {
            const params = request.params;
            const start = Number(params.start);
            const count = Number(params.count);
            const call = { name: params.name, start, count };
            pageCalls.push(call);

            if (pageCalls.length === 1) {
                await firstPageReady;
            } else if (start !== 1) {
                await backgroundReady;
            }

            return {
                status: "ready",
                value: {
                    name: params.name,
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
            throw new Error("A batch-capable warmup used the complete snapshot fallback.");
        }
    });

    cache.warmVariableMetadata("slow");
    if (copyTarget) {
        cache.copy("slow", "copied");
        cache.patchVariableMetadata("copied", "s2", variable("s2", "copied edit"));
    }
    const target = copyTarget ? "copied" : "slow";
    const reading = cache.readVariableMetadata(target, 1, 48);

    try {
        await new Promise(function(resolve) { setTimeout(resolve, 180); });
        assert(pageCalls.length === 1, "A slow first page was requested again after the warm wait.");

        if (invalidateWarmup) {
            cache.invalidateVariableMetadata(target);
        }
        releaseFirstPage();
        let deadline;
        const received = await Promise.race([
            reading,
            new Promise(function(_resolve, reject) {
                deadline = setTimeout(function() {
                    reject(new Error("The first Variables screen waited for the background sweep."));
                }, 1000);
            })
        ]).finally(function() { clearTimeout(deadline); });

        if (invalidateWarmup) {
            assert(received === null, "Invalidated read must retire instead of reading replacement state.");
        }
        const result = invalidateWarmup
            ? await cache.readVariableMetadata(target, 1, 48)
            : received;
        assert(result.name === target && result.items.length === 48, "First-page identity or content changed.");
        assert(
            pageCalls.filter(function(call) { return call.start === 1; }).length
                === (invalidateWarmup ? 2 : 1),
            "First-page reuse failed, or an invalidated warmup was reused."
        );
        if (copyTarget) {
            assert(result.items[1].label === (invalidateWarmup ? "s2" : "copied edit"),
                "Copied first-page warming lost a newer edit or reused invalidated metadata.");
        }
    } finally {
        releaseFirstPage();
        releaseBackground();
    }
    if (copyTarget && !invalidateWarmup) {
        await new Promise(function(resolve) { setTimeout(resolve, 10); });
        const completedCopy = await cache.readVariableMetadata(target, 1, 145);
        assert(completedCopy.items.length === 145 && completedCopy.items[1].label === "copied edit",
            "Copied background completion overwrote a newer target edit.");
        assert(pageCalls.length === 2, "Copied background completion restarted a metadata sweep.");
    }
};


const verifyFirstMetadataPageFailure = async function() {
    let calls = 0;
    const cache = createDatasetEditorWarmCache({
        executeRuntimeMethod: async function() {
            calls += 1;
            if (calls === 1) {
                throw new Error("simulated first-page failure");
            }
            return { status: "ready", value: {
                name: "failed", total: 1, start: 1, count: 1, items: [variable("recovered")]
            } };
        },
        readTabularPreview: async function() {
            return { status: "unsupported", columns: [], rows: [] };
        },
        readVariableMetadata: async function() {
            throw new Error("Unexpected snapshot fallback.");
        }
    });
    cache.warmVariableMetadata("failed");
    const result = await cache.readVariableMetadata("failed", 1, 48);
    assert(calls === 2 && result.items[0].name === "recovered", "A failed first page left its reader waiting.");
};


const verifyNamedMetadataRefreshOwnership = async function() {
    for (const scenario of ["overlap", "direct-patch", "invalidate", "copy", "exception", "unrequested-variable",
        "retired-exception", "superseded-exception", "unrelated-invalidation", "unrelated-exception"]) {
        const pending = [];
        const cache = createDatasetEditorWarmCache({
            executeRuntimeMethod: request => {
                if (request.method === "workspace.dataset_variables_named") {
                    return new Promise((resolve, reject) => pending.push({ request, resolve, reject }));
                }
                const prefix = request.params.name === "source" ? "source" : "base";
                return Promise.resolve({ status: "ready", value: {
                    name: request.params.name, total: 2, start: 1, count: 2,
                    items: [variable("x", prefix + " x"), variable("y", prefix + " y")]
                } });
            },
            readTabularPreview: async () => ({ status: "unsupported", columns: [], rows: [] }),
            readVariableMetadata: async () => { throw Error("Unexpected full metadata fallback"); }
        });
        const respond = function(index, items) {
            pending[index].resolve({ status: "ready", value: { name: "data", total: 2, items } });
        };
        cache.warmVariableMetadata("data");
        await cache.readVariableMetadata("data", 1, 2);
        const old = cache.refreshVariableMetadata("data", scenario === "unrequested-variable" ? ["y"] : ["x", "y"]);
        let expectedX = "base x";
        if (scenario === "overlap") {
            const next = cache.refreshVariableMetadata("data", ["x"]);
            respond(1, [variable("x", "latest x")]);
            await next;
            expectedX = "latest x";
        } else if (scenario === "direct-patch") {
            cache.patchVariableMetadata("data", "x", variable("x", "direct x"));
            expectedX = "direct x";
        } else if (scenario === "invalidate" || scenario === "retired-exception") {
            cache.invalidateVariableMetadata("data");
            cache.warmVariableMetadata("data");
            await cache.readVariableMetadata("data", 1, 2);
        } else if (scenario === "copy") {
            cache.warmVariableMetadata("source");
            await cache.readVariableMetadata("source", 1, 2);
            cache.copy("source", "data");
            expectedX = "source x";
        } else if (scenario === "superseded-exception") {
            const next = cache.refreshVariableMetadata("data", ["x", "y"]);
            respond(1, [variable("x", "latest x"), variable("y", "latest y")]);
            await next;
            expectedX = "latest x";
        } else if (scenario === "unrelated-invalidation" || scenario === "unrelated-exception") {
            cache.invalidateVariableMetadata("other-dataset");
            expectedX = "old x";
        }
        if (scenario === "exception" || scenario === "unrelated-exception") {
            const observed = old.then(() => { throw Error("Current refresh exception was swallowed"); }, error => {
                assert(error.message === "Current named refresh failed", "Current refresh exception changed identity");
            });
            pending[0].reject(Error("Current named refresh failed"));
            await observed;
            const retry = cache.refreshVariableMetadata("data", ["x"]);
            respond(1, [variable("x", "retried x")]);
            await retry;
            expectedX = "retried x";
        } else if (scenario === "retired-exception" || scenario === "superseded-exception") {
            pending[0].reject(Error("Obsolete named refresh failed"));
            await old;
        } else {
            respond(0, [variable("x", "old x"), variable("y", "old y")]);
            await old;
        }
        const after = await cache.readVariableMetadata("data", 1, 2);
        assert(after.items[0]?.label === expectedX, scenario === "unrelated-invalidation"
            ? "Current named metadata refresh was discarded after another dataset invalidated"
            : scenario + ": obsolete or unrequested named metadata patched x");
        if (scenario === "overlap" || scenario === "direct-patch" || scenario === "unrequested-variable") {
            assert(after.items[1]?.label === "old y", scenario + ": unaffected current y refresh was lost");
        }
        cache.invalidate();
    }
};


const verifyNamedMetadataFailureCache = async function() {
    for (const scenario of ["returned-failure", "exception", "partially-superseded", "retired"]) {
        let reject;
        let release;
        let reads = 0;
        const failure = Error("Current named metadata could not be read");
        const cache = createDatasetEditorWarmCache({
            readTabularPreview: async () => ({ status: "unsupported", columns: [], rows: [] }),
            readVariableMetadata: async () => { throw Error("Unexpected full fallback"); },
            executeRuntimeMethod: request => {
                if (request.method === "workspace.dataset_variables_named") {
                    return new Promise((resolve, fail) => { release = resolve; reject = fail; });
                }
                reads++;
                return Promise.resolve({ status: "ready", value: {
                    name: "data", total: 2, start: 1, count: 2,
                    items: [variable("x", reads === 1 ? "old x" : "fresh x"), variable("y", "fresh y")]
                } });
            }
        });
        cache.warmVariableMetadata("data");
        await cache.readVariableMetadata("data", 1, 2);
        const old = cache.refreshVariableMetadata("data", ["x", "y"]);
        const observed = old.then(() => null, error => error);
        if (scenario === "partially-superseded") {
            cache.patchVariableMetadata("data", "x", variable("x", "new accepted x"));
        }
        if (scenario === "retired") {
            cache.invalidateVariableMetadata("data");
            cache.warmVariableMetadata("data");
            await cache.readVariableMetadata("data", 1, 2);
        }
        if (scenario === "exception" || scenario === "partially-superseded") {
            reject(failure);
        }
        else {
            release({ status: "failed", message: failure.message });
        }
        const error = await observed;
        assert(scenario === "retired" ? !error : error?.message === failure.message,
            scenario + ": current returned failure was swallowed or retired failure escaped");
        if (scenario === "exception" || scenario === "partially-superseded") {
            assert(error === failure, "Current exception lost its identity.");
        }
        const after = await cache.readVariableMetadata("data", 1, 2);
        assert(reads === 2, scenario + ": failed named refresh left old cached metadata readable");
        assert(after.items[0].label === (scenario === "partially-superseded" ? "new accepted x" : "fresh x"),
            scenario + ": cache recovery discarded a newer accepted patch or retained stale data");
        cache.invalidate();
    }
};


const verifyUnrelatedWarmupInvalidation = async function() {
    for (const scenario of ["first-metadata", "background-metadata", "first-preview"]) {
        let release;
        let produced;
        const gate = new Promise(resolve => { release = resolve; });
        const held = new Promise(resolve => { produced = resolve; });
        const pages = [];
        let previews = 0;
        const variables = Array.from({ length: 145 }, (_, index) => variable("v" + (index + 1)));
        const cache = createDatasetEditorWarmCache({
            executeRuntimeMethod: async request => {
                const { start, count } = request.params;
                pages.push([start, count]);
                if ((scenario === "first-metadata" && pages.length === 1)
                    || (scenario === "background-metadata" && start === 49)) {
                    produced();
                    await gate;
                }
                return { status: "ready", value: { name: "data", total: 145, start,
                    count: Math.min(count, 146 - start), items: variables.slice(start - 1, start - 1 + count) } };
            },
            readTabularPreview: async request => {
                previews++;
                const preview = { status: "ready", objectName: request.objectName,
                    columns: Array.from({ length: 32 }, (_, index) => ({ name: "v" + index })),
                    rows: Array.from({ length: 40 }, () => ({ v0: { raw: "accepted" } })) };
                produced();
                await gate;
                return preview;
            },
            readVariableMetadata: async () => { throw Error("Unexpected full metadata fallback"); }
        });
        try {
            if (scenario === "first-preview") {
                cache.warmPreview("data");
            }
            else {
                cache.warmVariableMetadata("data");
            }
            await held;
            cache.invalidate("unrelated");
            release();
            await new Promise(resolve => setTimeout(resolve, 10));
            if (scenario === "first-preview") {
                const value = await cache.readPreview({ objectName: "data", rowCount: 40, columnCount: 32 });
                assert(value.rows[0].v0.raw === "accepted" && previews === 1,
                    "Unrelated invalidation discarded another object's current preview warmup");
            }
            else {
                const value = await cache.readVariableMetadata("data", 1, 145);
                assert(value.items.length === 145 && JSON.stringify(pages) === JSON.stringify([[1, 48], [49, 97]]),
                    scenario + ": unrelated invalidation canceled/repeated another object's metadata pages");
            }
        }
        finally {
            release();
            cache.invalidate();
        }
    }
};


const verifyReplacedMetadataWarmup = async function() {
    let release;
    let completed;
    const gate = new Promise(resolve => { release = resolve; });
    const oldRead = new Promise(resolve => { completed = resolve; });
    const cache = createDatasetEditorWarmCache({
        executeRuntimeMethod: async function(request) {
            const name = request.params.name;
            const result = { status: "ready", value: {
                name, total: 1, start: 1, count: 1,
                items: [variable("x", name === "source" ? "copied current" : "old target")]
            } };
            if (name === "target") {
                completed();
                await gate;
            }
            return result;
        },
        readTabularPreview: async function() {
            return { status: "unsupported", columns: [], rows: [] };
        },
        readVariableMetadata: async function() {
            throw Error("Unexpected full-metadata fallback");
        }
    });
    try {
        cache.warmVariableMetadata("source");
        await cache.readVariableMetadata("source", 1, 1);
        cache.warmVariableMetadata("target");
        await oldRead;
        cache.copy("source", "target");
        const copied = await cache.readVariableMetadata("target", 1, 1);
        assert(copied.items[0].label === "copied current", "Copy did not publish current metadata");
        release();
        await new Promise(resolve => setTimeout(resolve, 0));
        const after = await cache.readVariableMetadata("target", 1, 1);
        assert(after.items[0].label === "copied current",
            "Retired target warmup overwrote copied current metadata");
    } finally {
        release();
        cache.invalidate();
    }
};


const verifyReplacedPreviewWarmup = async function() {
    let release;
    let completed;
    const gate = new Promise(resolve => { release = resolve; });
    const oldRead = new Promise(resolve => { completed = resolve; });
    let reads = 0;
    const cache = createDatasetEditorWarmCache({
        executeRuntimeMethod: async function() { throw Error("Unexpected metadata query"); },
        readVariableMetadata: async function() { throw Error("Unexpected metadata query"); },
        readTabularPreview: async function(request) {
            reads += 1;
            const result = { status: "ready", objectName: request.objectName,
                columns: Array.from({ length: 32 }, (_, index) => ({ name: "v" + index })),
                rows: Array.from({ length: 40 }, () => ({ v0: { raw: reads === 1 ? "old" : "copied" } })) };
            if (reads === 1) {
                completed();
                await gate;
            }
            return result;
        }
    });
    try {
        cache.warmPreview("target");
        const reading = cache.readPreview({ objectName: "target", rowCount: 40, columnCount: 32 });
        await oldRead;
        cache.copy("unwarmed-source", "target");
        release();
        const after = await reading;
        assert(after.status === "unavailable" && reads === 1,
            "Pending preview reader read replacement state after cache copy retired its owner");
        const fresh = await cache.readPreview({ objectName: "target", rowCount: 40, columnCount: 32 });
        assert(fresh.rows[0].v0.raw === "copied" && reads === 2,
            "Fresh preview read did not recover after cache copy");
    } finally {
        release();
        cache.invalidate();
    }
};


const verifyRetiredFirstPreviewReader = async function() {
    for (const scenario of ["copy", "invalidate", "invalidate-all", "copied-owner", "larger-warmup"]) {
        let release;
        let completed;
        let timer;
        let reads = 0;
        const gate = new Promise(resolve => { release = resolve; });
        const oldRead = new Promise(resolve => { completed = resolve; });
        const heldName = scenario === "copied-owner" ? "source" : "data";
        const cache = createDatasetEditorWarmCache({
            executeRuntimeMethod: async () => { throw Error("Unexpected metadata query"); },
            readVariableMetadata: async () => { throw Error("Unexpected metadata query"); },
            readTabularPreview: async function(request) {
                reads += 1;
                const old = reads === 1;
                const result = { status: "ready", objectName: request.objectName,
                    columns: Array.from({ length: request.columnCount }, (_, index) => ({ name: "v" + index })),
                    rows: Array.from({ length: 40 }, () => ({ v0: { raw: old ? "old" : "current" } })) };
                if (old) {
                    completed();
                    await gate;
                }
                return result;
            }
        });
        try {
            cache.warmPreview(heldName);
            await oldRead;
            if (scenario === "copied-owner") {
                cache.copy("source", "data");
            }
            const reading = cache.readPreview({ objectName: "data", rowCount: 40, columnCount: 32 });
            await new Promise(resolve => setTimeout(resolve, 160));
            if (scenario === "copy") {
                cache.warmPreview("source");
                await cache.readPreview({ objectName: "source", rowCount: 40, columnCount: 32 });
                cache.copy("source", "data");
            } else if (scenario === "larger-warmup") {
                cache.warmPreview("data", 64);
            } else {
                cache.invalidatePreview(scenario === "invalidate-all" ? undefined : "data");
                cache.warmPreview("data");
            }
            const result = await Promise.race([reading, new Promise((_, reject) => {
                timer = setTimeout(() => reject(Error(scenario
                    + ": current reader remained blocked on a retired first preview")), 650);
            })]);
            if (scenario === "larger-warmup") {
                assert(result.rows[0]?.v0?.raw === "current", scenario + ": retired warmup bytes were returned");
            } else {
                assert(result.status === "unavailable", scenario + ": retired reader was reused for replacement data");
            }
            release();
            await new Promise(resolve => setTimeout(resolve, 0));
            const after = await cache.readPreview({ objectName: "data", rowCount: 40, columnCount: 32 });
            assert(after.rows[0]?.v0?.raw === "current", scenario + ": late preview replaced current cache");
        } finally {
            clearTimeout(timer);
            release();
            cache.invalidate();
        }
    }
};


const verifyRetiredFirstMetadataReader = async function() {
    for (const scenario of ["named-refresh", "copy", "invalidate", "invalidate-all", "copied-owner"]) {
        let release;
        let completed;
        const gate = new Promise(resolve => { release = resolve; });
        const oldRead = new Promise(resolve => { completed = resolve; });
        const heldName = scenario === "copied-owner" ? "source" : "data";
        let held = false;
        let pageReads = 0;
        let timer;
        const cache = createDatasetEditorWarmCache({
            executeRuntimeMethod: async function(request) {
                const name = request.params.name;
                if (request.method === "workspace.dataset_variables_batch") {
                    pageReads += 1;
                }
                const old = request.method === "workspace.dataset_variables_batch"
                    && name === heldName && !held;
                const result = { status: "ready", value: {
                    name, total: 1, start: 1, count: 1,
                    items: [variable("x", old ? "old held" : "accepted current")]
                } };
                if (old) {
                    held = true;
                    completed();
                    await gate;
                }
                return result;
            },
            readTabularPreview: async () => ({ status: "unsupported", columns: [], rows: [] }),
            readVariableMetadata: async () => { throw Error("Unexpected full metadata fallback"); }
        });
        try {
            cache.warmVariableMetadata(heldName);
            await oldRead;
            if (scenario === "copied-owner") {
                cache.copy("source", "data");
            }
            const reading = cache.readVariableMetadata("data", 1, 1);
            // Enter the existing after-short-wait first-page await before retiring
            // its owner; returning the held old page is deliberately impossible.
            await new Promise(resolve => setTimeout(resolve, 160));
            if (scenario === "copy") {
                cache.warmVariableMetadata("source");
                await cache.readVariableMetadata("source", 1, 1);
                cache.copy("source", "data");
            } else if (scenario === "invalidate" || scenario === "invalidate-all") {
                cache.invalidateVariableMetadata(scenario === "invalidate-all" ? undefined : "data");
                cache.warmVariableMetadata("data");
            } else {
                await cache.refreshVariableMetadata("data", ["x"]);
            }
            const beforeCompletionReads = pageReads;
            const result = await Promise.race([reading, new Promise((_, reject) => {
                timer = setTimeout(() => reject(Error(scenario
                    + ": current reader remained blocked on a retired first metadata page")), 650);
            })]);
            if (scenario === "copy" || scenario === "invalidate" || scenario === "invalidate-all") {
                assert(result === null, scenario + ": retired reader was reused for replacement metadata");
                assert(pageReads === beforeCompletionReads,
                    scenario + ": retired reader dispatched a replacement page");
                const fresh = await cache.readVariableMetadata("data", 1, 1);
                assert(fresh.items[0]?.label === "accepted current",
                    scenario + ": explicit fresh reader did not recover current metadata");
            } else {
                assert(result.items[0]?.label === "accepted current",
                    scenario + ": named refresh did not supply current metadata");
            }
            release();
            await new Promise(resolve => setTimeout(resolve, 0));
            const after = await cache.readVariableMetadata("data", 1, 1);
            assert(after.items[0]?.label === "accepted current", scenario + ": late first page overwrote current metadata");
        } finally {
            clearTimeout(timer);
            release();
            cache.invalidate();
        }
    }
};


const verifyRetiredMetadataFallback = async function() {
    for (const scenario of ["active", "invalidate-all", "invalidate-object", "replaced-owner"]) {
        let settlePage;
        let metadataFallbacks = 0;
        const page = new Promise(resolve => { settlePage = resolve; });
        const cache = createDatasetEditorWarmCache({
            executeRuntimeMethod: () => page,
            readTabularPreview: async () => ({ status: "unsupported", columns: [], rows: [] }),
            readVariableMetadata: async () => {
                metadataFallbacks++;
                return { status: "ready", variables: [variable("x", "current")] };
            }
        });
        cache.warmVariableMetadata("data");
        if (scenario === "invalidate-all") {
            cache.invalidate();
        } else if (scenario === "invalidate-object") {
            cache.invalidateVariableMetadata("data");
        } else if (scenario === "replaced-owner") {
            cache.copy("replacement", "data");
        }
        // Only a provider without batch support may use the full fallback.
        // Retiring that provider still has to suppress the fallback dispatch.
        settlePage({ status: "unavailable", message: "batch method unavailable" });
        await new Promise(resolve => setTimeout(resolve, 0));
        assert(metadataFallbacks === (scenario === "active" ? 1 : 0),
            scenario + ": obsolete warmup started a full metadata fallback read");
        cache.invalidate();
    }
};


const verifyDialogFallbackRevision = async function() {
    let type = "numeric";
    let reads = 0;
    let generation = 1;
    const workspace = { providerId: "r", status: "ready",
        workspaceRevision: { session: "first", sequence: 1 },
        objects: [{ name: "data", capabilities: ["tabular.schema"], columns: ["x"], columnEntries: [] }] };
    const resolve = createRuntimeDialogDatasetResolver({
        getSnapshot: () => ({ providerId: "r", status: "ready", lifecycleGeneration: generation }),
        getWorkspaceSnapshot: () => workspace,
        listWorkspaceObjects: async () => workspace,
        readTabularSchema: async () => {
            reads++;
            return { status: "ready", columns: [{ name: "x", type }] };
        }
    });
    assert((await resolve())[0].columns[0].numeric, "Initial fallback schema was not numeric");
    await resolve();
    assert(reads === 1, "Unchanged dialog fallback schema was rescanned");
    type = "character";
    workspace.workspaceRevision.sequence++;
    assert((await resolve())[0].columns[0].character && reads === 2,
        "Dialog fallback schema cache ignored a new workspace revision");
    type = "numeric";
    generation++;
    workspace.workspaceRevision = { session: "replacement", sequence: 1 };
    assert((await resolve())[0].columns[0].numeric && reads === 3,
        "Dialog fallback schema cache ignored a replacement runtime");
};


const verifyDialogResolverOwner = async function() {
    let reads = 0;
    const createRuntime = function(type) {
        const workspace = { providerId: "r", status: "ready",
            workspaceRevision: { session: type, sequence: 1 },
            objects: [{ name: "data", capabilities: ["tabular.schema"], columns: ["x"], columnEntries: [] }] };
        return {
            getSnapshot: () => ({ providerId: "r", status: "ready", lifecycleGeneration: 1 }),
            getWorkspaceSnapshot: () => workspace,
            listWorkspaceObjects: async () => workspace,
            readTabularSchema: async () => {
                reads++;
                return { status: "ready", columns: [{ name: "x", type }] };
            }
        };
    };
    let runtime = createRuntime("numeric");
    const resolve = createRuntimeDialogDatasetResolverOwner(() => runtime);
    await resolve();
    await resolve();
    assert(reads === 1, "Shared resolver owner recreated its fallback cache per call");
    runtime = createRuntime("character");
    assert((await resolve())[0].columns[0].character && reads === 2,
        "Shared resolver owner reused another runtime's schema");
    const replacement = runtime;
    runtime = null;
    assert((await resolve()).length === 0, "Missing runtime retained dialog datasets");
    runtime = replacement;
    await resolve();
    assert(reads === 3, "Absent-runtime retirement retained a fallback cache");
};


const verifyRetiredDialogSchema = async function() {
    for (const scenario of ["workspace-change", "restart", "late-error", "current-error"]) {
        let settle;
        let reject;
        let generation = 1;
        let workspace = { providerId: "r", status: "ready",
            workspaceRevision: { session: "first", sequence: 1 },
            objects: [{ name: "data", capabilities: ["tabular.schema"], columns: ["x"], columnEntries: [] }] };
        const pending = new Promise((resolve, fail) => { settle = resolve; reject = fail; });
        const resolve = createRuntimeDialogDatasetResolver({
            getSnapshot: () => ({ providerId: "r", status: "ready", lifecycleGeneration: generation }),
            getWorkspaceSnapshot: () => workspace,
            listWorkspaceObjects: async () => workspace,
            readTabularSchema: () => pending
        });
        const old = resolve();
        await new Promise(resolve => setTimeout(resolve, 0));
        if (scenario !== "current-error") {
            workspace = { ...workspace, workspaceRevision: { session: "replacement", sequence: 2 } };
            if (scenario === "restart" || scenario === "late-error") {
                generation++;
            }
        }
        if (scenario === "late-error" || scenario === "current-error") {
            reject(Error("Named schema fixture failure"));
        } else {
            settle({ status: "ready", columns: [{ name: "x", type: "numeric" }] });
        }
        if (scenario === "current-error") {
            await old.then(() => { throw Error("Current schema error was swallowed"); }, error => {
                assert(error.message === "Named schema fixture failure", "Current schema error changed identity");
            });
        } else {
            assert((await old).length === 0, scenario + ": retired schema escaped its workspace scope");
        }
    }
};


Promise.all([
    verifyDialogResolver(),
    verifyMetadataCache(),
    verifyMetadataWarmupRecovery(),
    verifySlowFirstMetadataPage(false, false),
    verifySlowFirstMetadataPage(true, false),
    verifySlowFirstMetadataPage(true, true),
    verifySlowFirstMetadataPage(false, true),
    verifyFirstMetadataPageFailure(),
    verifyNamedMetadataRefreshOwnership(),
    verifyNamedMetadataFailureCache(),
    verifyUnrelatedWarmupInvalidation(),
    verifyReplacedMetadataWarmup(),
    verifyReplacedPreviewWarmup(),
    verifyRetiredFirstPreviewReader(),
    verifyRetiredFirstMetadataReader(),
    verifyRetiredMetadataFallback(),
    verifyDialogFallbackRevision(),
    verifyDialogResolverOwner(),
    verifyRetiredDialogSchema()
]).then(function() {
    console.log("Shared dialog and dataset metadata caches verified.");
}).catch(function(error) {
    console.error(error);
    process.exit(1);
});
