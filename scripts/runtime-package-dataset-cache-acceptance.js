"use strict";

// ONE real namespace/cache scenario through both runtime adapters. Only source
// installation versus extraction of its built WASM package is host-specific.
exports.checkActualPackageDatasetCache = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) {
            throw new Error(options.host + ": " + message);
        }
    };
    const runtime = options.runtime;
    const query = async function(code) {
        const result = await runtime.executeInvisibleQuery({ query: code, source: "package-dataset-cache" });
        requireResult(result.status === "ready", result.message || "Private package query failed.");
        return result.value;
    };
    const setup = await options.execute([
        'package_cache_original_libraries <- .libPaths()',
        'package_cache_library <- tempfile("dialogforge-package-cache-")',
        'dir.create(package_cache_library)',
        'package_cache_hits <- 0L',
        'package_cache_last_calls <- ""',
        'package_cache_data <- data.frame(value=c(1L,2L,3L,4L), text=c("1","2","3","4"))',
        'cat("package-cache-ready\\n")'
    ].join("; "), "answer");
    requireResult(setup.outcome === "success", "Private dataset/package setup failed.");
    await options.installFixture(String(await query("package_cache_library")));
    requireResult((await options.execute('.libPaths(c(package_cache_library,.libPaths()))', "answer"))
        .outcome === "success", "Private fixture library was not selected.");
    requireResult(String(await query('as.character(is.element("DialogForgeCacheFixture",loadedNamespaces()))')) === "FALSE",
        "Fixture namespace must not be loaded before first-screen warming.");
    const calls = [];
    const cache = options.createCache({
        readTabularPreview: request => {
            calls.push("preview");
            return runtime.readTabularPreview(request);
        },
        executeRuntimeMethod: request => {
            calls.push(request.method);
            return runtime.executeRuntimeMethod(request);
        },
        readVariableMetadata: name => {
            calls.push("metadata-fallback");
            return runtime.readVariableMetadata(name);
        }
    });
    const request = { objectName: "package_cache_data", rowStart: 1, rowCount: 4, columnCount: 2 };
    const readScreens = async function() {
        const [preview, metadata] = await Promise.all([
            cache.readPreview(request), cache.readVariableMetadata("package_cache_data", 1, 48)
        ]);
        return { preview, metadata };
    };
    const checkLateMetadataFailures = async function() {
        const observations = [];
        for (const scenario of ["active", "invalidate-all", "invalidate-object", "copy-target"]) {
            let release;
            let reportProduced;
            let producedResult;
            let fallbackWork;
            let fallbackReads = 0;
            let timer;
            const gate = new Promise(resolve => { release = resolve; });
            const produced = new Promise(resolve => { reportProduced = resolve; });
            const lateCache = options.createCache({
                readTabularPreview: request => runtime.readTabularPreview(request),
                executeRuntimeMethod: async request => {
                    try {
                        producedResult = await runtime.executeRuntimeMethod(request);
                    }
                    finally {
                        reportProduced();
                    }
                    await gate;
                    return producedResult;
                },
                readVariableMetadata: name => {
                    fallbackReads++;
                    fallbackWork = runtime.readVariableMetadata(name);
                    return fallbackWork;
                }
            });
            try {
                lateCache.warmVariableMetadata("package_cache_missing");
                await Promise.race([produced, new Promise((resolve, reject) => {
                    timer = setTimeout(() => reject(Error("Actual metadata failure did not return")), 5000);
                })]);
                requireResult(producedResult && (producedResult.status !== "ready" || !producedResult.value),
                    "Actual missing-dataset batch did not produce its failure.");
                if (scenario === "invalidate-all") {
                    lateCache.invalidate();
                } else if (scenario === "invalidate-object") {
                    lateCache.invalidateVariableMetadata("package_cache_missing");
                } else if (scenario === "copy-target") {
                    lateCache.copy("package_cache_data", "package_cache_missing");
                }
                release();
                await new Promise(resolve => setTimeout(resolve, 0));
                if (fallbackWork) {
                    await fallbackWork;
                }
                requireResult(fallbackReads === (scenario === "active" ? 1 : 0),
                    scenario + ": retired actual batch failure started another metadata query.");
                observations.push({ scenario, batchStatus: producedResult.status,
                    batchMessage: producedResult.message, fallbackReads,
                    actualRBatch: true, controlledLateReceipt: true });
            }
            finally {
                clearTimeout(timer);
                release();
                lateCache.invalidate();
            }
        }
        return observations;
    };
    const checkCrossObjectNamedRefresh = async function() {
        let release;
        let reportProduced;
        let namedResult;
        let timer;
        const gate = new Promise(resolve => { release = resolve; });
        const produced = new Promise(resolve => { reportProduced = resolve; });
        const namedCache = options.createCache({
            readTabularPreview: request => runtime.readTabularPreview(request),
            readVariableMetadata: name => runtime.readVariableMetadata(name),
            executeRuntimeMethod: async request => {
                const result = await runtime.executeRuntimeMethod(request);
                if (request.method === "workspace.dataset_variables_named") {
                    namedResult = result;
                    reportProduced();
                    await gate;
                }
                return result;
            }
        });
        try {
            const baseline = await options.execute(
                'attr(package_cache_data$value,"label") <- "metadata baseline"', "answer"
            );
            requireResult(baseline.outcome === "success", "Named metadata baseline setup failed.");
            namedCache.warmVariableMetadata("package_cache_data");
            const before = await namedCache.readVariableMetadata("package_cache_data", 1, 2);
            requireResult(before.items[0]?.label === "metadata baseline",
                "Actual baseline variable label was not warmed.");
            const edited = await options.execute(
                'attr(package_cache_data$value,"label") <- "accepted named label"', "answer"
            );
            requireResult(edited.outcome === "success", "Actual variable label edit failed.");
            const refresh = namedCache.refreshVariableMetadata("package_cache_data", ["value"]);
            await Promise.race([produced, new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(Error("Actual named metadata reply did not return")), 5000);
            })]);
            requireResult(namedResult.status === "ready", "Actual named metadata query failed.");
            namedCache.invalidateVariableMetadata("unrelated_dataset");
            release();
            await refresh;
            const after = await namedCache.readVariableMetadata("package_cache_data", 1, 2);
            requireResult(after.items[0]?.label === "accepted named label",
                "Another dataset's invalidation discarded current actual named metadata.");
            return { actualRLabelEdit: true, actualRNamedReply: true, controlledLateReceipt: true,
                unrelatedObjectInvalidated: true, acceptedLabel: after.items[0].label };
        }
        finally {
            clearTimeout(timer);
            release();
            namedCache.invalidate();
        }
    };
    const checkMetadataDeliveryBarrier = async function() {
        const observations = [];
        for (const scenario of ["current", "retired"]) {
            let release;
            let reportProduced;
            let namedResult;
            let timer;
            const gate = new Promise(resolve => { release = resolve; });
            const produced = new Promise(resolve => { reportProduced = resolve; });
            const namedCache = options.createCache({
                readTabularPreview: request => runtime.readTabularPreview(request),
                readVariableMetadata: name => runtime.readVariableMetadata(name),
                executeRuntimeMethod: async request => {
                    const result = await runtime.executeRuntimeMethod(request);
                    if (request.method === "workspace.dataset_variables_named") {
                        namedResult = result;
                        reportProduced();
                        await gate;
                    }
                    return result;
                }
            });
            try {
                await options.execute('attr(package_cache_data$value,"label") <- "barrier baseline"', "answer");
                await namedCache.readVariableMetadata("package_cache_data", 1, 2);
                const edited = await options.execute(
                    'attr(package_cache_data$value,"label") <- "barrier accepted"', "answer"
                );
                requireResult(edited.outcome === "success", "Actual metadata barrier edit failed.");
                const prepared = options.prepareEffects({
                    datasets: {
                        copied: [], added: [], removed: [],
                        changed: [{ name: "package_cache_data", kind: "dataset_variable_meta_changed",
                            columns: ["value"] }]
                    }
                }, namedCache);
                let deliveryRuntime = runtime;
                const sent = [];
                const errors = [];
                let acceptedLabel;
                const delivery = options.createWorkspaceDelivery({
                    getRuntime: () => deliveryRuntime,
                    publishWorkspace: () => sent.push("workspace"),
                    publishDatasetNames: () => sent.push("datasets")
                });
                const pending = delivery.deliver(runtime.getWorkspaceSnapshot(), {
                    metadataRefreshes: prepared.metadataRefreshes,
                    reportMetadataError: error => errors.push(String(error)),
                    refreshDialogs: async () => {
                        acceptedLabel = (await namedCache.readVariableMetadata(
                            "package_cache_data", 1, 2
                        )).items[0]?.label;
                        sent.push("dialogs");
                    }
                });
                requireResult(sent.join(",") === "workspace,datasets",
                    "Metadata refresh delayed workspace publication.");
                await Promise.race([produced, new Promise((_resolve, reject) => {
                    timer = setTimeout(() => reject(Error("Actual barrier metadata did not return")), 5000);
                })]);
                requireResult(namedResult.status === "ready", "Actual barrier named metadata failed.");
                requireResult(sent.length === 2, "Dialog refresh ran before actual held metadata completion.");
                if (scenario === "retired") {
                    deliveryRuntime = null;
                }
                release();
                requireResult(await pending === (scenario === "current"),
                    "Metadata delivery did not honor its captured runtime owner.");
                requireResult(errors.length === 0 && (scenario !== "current" || acceptedLabel === "barrier accepted"),
                    "Current dialog did not receive the accepted actual named metadata.");
                requireResult(sent.length === (scenario === "current" ? 3 : 2),
                    "Retired metadata completion refreshed obsolete dialogs.");
                observations.push({ scenario, actualRNamedReply: true, controlledLateReceipt: true,
                    controlledDeliveryRetirement: scenario === "retired",
                    immediateWorkspacePublication: true, dialogPublications: sent.length - 2,
                    acceptedLabel });
            }
            finally {
                clearTimeout(timer);
                release();
                namedCache.invalidate();
            }
        }
        return observations;
    };
    const checkNamedMetadataFailure = async function() {
        const observations = [];
        for (const scenario of ["current", "retired"]) {
            let release;
            let reportProduced;
            let namedResult;
            let timer;
            let batchReads = 0;
            const gate = new Promise(resolve => { release = resolve; });
            const produced = new Promise(resolve => { reportProduced = resolve; });
            const namedCache = options.createCache({
                readTabularPreview: request => runtime.readTabularPreview(request),
                readVariableMetadata: name => runtime.readVariableMetadata(name),
                executeRuntimeMethod: async request => {
                    const result = await runtime.executeRuntimeMethod(request);
                    if (request.method === "workspace.dataset_variables_named") {
                        namedResult = result;
                        reportProduced();
                        await gate;
                    }
                    else if (request.method === "workspace.dataset_variables_batch") {
                        batchReads++;
                    }
                    return result;
                }
            });
            try {
                requireResult((await options.execute(
                    'package_cache_failure <- data.frame(value=1:4)', "answer"
                )).outcome === "success", "Actual named failure setup failed.");
                namedCache.warmVariableMetadata("package_cache_failure");
                const before = await namedCache.readVariableMetadata("package_cache_failure", 1, 1);
                requireResult(before.items[0]?.type === "integer" || before.items[0]?.type === "numeric",
                    "Initial actual named-failure cache was not numeric.");
                requireResult((await options.execute('rm(package_cache_failure)', "answer")).outcome === "success",
                    "Actual named failure object removal failed.");
                // Deliberately hold the real remove effect: reproduce the stale
                // cache boundary, not a claim about ordinary rendered deletion.
                const prepared = options.prepareEffects({
                    datasets: { copied: [], added: [], removed: [],
                        changed: [{ name: "package_cache_failure", kind: "dataset_variable_meta_changed",
                            columns: ["value"] }] }
                }, namedCache);
                const errors = [];
                let dialogs = 0;
                const delivery = options.createWorkspaceDelivery({
                    getRuntime: () => runtime,
                    publishWorkspace() {},
                    publishDatasetNames() {}
                });
                const pending = delivery.deliver(runtime.getWorkspaceSnapshot(), {
                    metadataRefreshes: prepared.metadataRefreshes,
                    reportMetadataError: error => errors.push(error.message),
                    refreshDialogs: async () => { dialogs++; }
                });
                await Promise.race([produced, new Promise((_resolve, reject) => {
                    timer = setTimeout(() => reject(Error("Actual named failure did not return")), 5000);
                })]);
                requireResult(namedResult.status === "failed" && namedResult.message === "workspace-object-not-found",
                    "Missing actual R object did not return the expected named-read failure.");
                if (scenario === "retired") {
                    namedCache.invalidateVariableMetadata("package_cache_failure");
                    await options.execute('package_cache_failure <- data.frame(value=c("a","b","c","d"))', "answer");
                    namedCache.warmVariableMetadata("package_cache_failure");
                    await namedCache.readVariableMetadata("package_cache_failure", 1, 1);
                }
                release();
                const delivered = await pending;
                requireResult(errors.length === (scenario === "current" ? 1 : 0)
                    && (scenario !== "current" || errors[0] === "workspace-object-not-found"),
                    "Current named-read failure was swallowed or obsolete failure was reported.");
                requireResult(delivered === (scenario === "current") && dialogs === (scenario === "current" ? 1 : 0),
                    "Named failure delivery escaped its workspace receipt.");
                if (scenario === "current") {
                    await options.execute('package_cache_failure <- data.frame(value=c("a","b","c","d"))', "answer");
                }
                const after = await namedCache.readVariableMetadata("package_cache_failure", 1, 1);
                requireResult(batchReads === 2 && after.items[0]?.type === "character",
                    "Actual named-read failure retained stale numeric metadata or invalidated a newer cache: "
                        + JSON.stringify({ scenario, batchReads, type: after.items[0]?.type }));
                observations.push({ scenario, actualMissingRObjectFailure: true,
                    actualRReplacementType: after.items[0].type, controlledLateReceipt: true,
                    heldRemoveEffect: true, reportedErrors: errors, batchReads, dialogs });
            }
            finally {
                clearTimeout(timer);
                release();
                namedCache.invalidate();
                await options.execute(
                    'if (exists("package_cache_failure",envir=.GlobalEnv,inherits=FALSE)) rm(package_cache_failure)',
                    "answer"
                );
            }
        }
        return observations;
    };
    const checkCrossObjectWarmup = async function() {
        const observations = [];
        for (const phase of ["first", "background"]) {
            let release;
            let metadataProduced;
            let previewProduced;
            let metadataCompleted;
            let timer;
            let previewReads = 0;
            const pages = [];
            const gate = new Promise(resolve => { release = resolve; });
            const metadataHeld = new Promise(resolve => { metadataProduced = resolve; });
            const previewHeld = new Promise(resolve => { previewProduced = resolve; });
            const metadataReady = new Promise(resolve => { metadataCompleted = resolve; });
            const currentCache = options.createCache({
                readVariableMetadata: name => runtime.readVariableMetadata(name),
                executeRuntimeMethod: async request => {
                    const result = await runtime.executeRuntimeMethod(request);
                    pages.push([request.params.start, request.params.count]);
                    if (request.params.start === (phase === "first" ? 1 : 49)) {
                        metadataProduced();
                        await gate;
                    }
                    if (result.status === "ready" && request.params.start + result.value.items.length - 1
                        >= result.value.total) {
                        metadataCompleted();
                    }
                    return result;
                },
                readTabularPreview: async request => {
                    const result = await runtime.readTabularPreview(request);
                    previewReads++;
                    previewProduced();
                    await gate;
                    return result;
                }
            });
            try {
                requireResult((await options.execute(
                    'package_cache_warming <- as.data.frame(matrix(rep(1:4,145),nrow=4))', "answer"
                )).outcome === "success", "Actual cross-object warming setup failed.");
                currentCache.warmFirstScreens("package_cache_warming");
                await Promise.race([Promise.all([metadataHeld, previewHeld]),
                    new Promise((_resolve, reject) => {
                        timer = setTimeout(() => reject(Error("Actual cross-object warmup did not return")), 10000);
                    })]);
                // The real responses are held only at their cache delivery
                // boundary. Invalidate another object, not the warmed owner.
                currentCache.invalidate("unrelated_dataset");
                release();
                clearTimeout(timer);
                await Promise.race([metadataReady, new Promise((_resolve, reject) => {
                    timer = setTimeout(() => reject(Error("Actual background metadata was canceled")), 10000);
                })]);
                // A full-list read is intentional only after background
                // completion, not while the first-screen count is still 48.
                await new Promise(resolve => setTimeout(resolve, 0));
                const [preview, metadata] = await Promise.all([
                    currentCache.readPreview({ objectName: "package_cache_warming", rowCount: 4, columnCount: 32 }),
                    currentCache.readVariableMetadata("package_cache_warming", 1, 145)
                ]);
                requireResult(preview.status === "ready" && previewReads === 1
                    && preview.rows.length === 4 && preview.columns.length === 32,
                    "Unrelated invalidation repeated the actual current Data warmup.");
                requireResult(metadata.items.length === 145
                    && JSON.stringify(pages) === JSON.stringify([[1, 48], [49, 97]])
                    && metadata.items.every(item => item.measure === "interval"),
                    "Unrelated invalidation canceled/repeated actual current Variables warmup: "
                        + JSON.stringify({ phase, pages, variables: metadata.items.length }));
                observations.push({ phase, actualRPreviewAndMetadata: true, controlledLateReceipt: true,
                    unrelatedCacheInvalidation: true, previewReads, metadataPages: pages,
                    variables: metadata.items.length, declaredInferencePreserved: true });
            }
            finally {
                clearTimeout(timer);
                release();
                currentCache.invalidate();
                await options.execute(
                    'if (exists("package_cache_warming",envir=.GlobalEnv,inherits=FALSE)) rm(package_cache_warming)',
                    "answer"
                );
            }
        }
        return observations;
    };
    const checkMalformedWorkspaceSnapshot = async function() {
        const baseline = await runtime.listWorkspaceObjects();
        requireResult(baseline.objects.some(object => object.name === "package_cache_data"),
            "Conservative snapshot fixture requires a prepared real dataset.");
        const snapshotCorruptions = [];
        for (const corruption of ["count", "name-precedence"]) {
            try {
                await query([
                    'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code);',
                    'stopifnot(!exists("restore_payload_snapshot_fixture",envir=rt,inherits=FALSE));',
                    'original <- rt$runtime_cached_workspace_snapshot;',
                    'original_variable <- rt$json_variable;',
                    'rt$runtime_cached_workspace_snapshot <- function() {',
                    'snapshot <- original();',
                    corruption === "count" ? 'snapshot$variables <- list();'
                        : 'stopifnot(length(snapshot$variables)>0L);',
                    'snapshot };',
                    corruption === "name-precedence"
                        ? 'rt$json_variable <- function(variable) paste0('
                            + JSON.stringify('{"name":" ",')
                            + ', substring(original_variable(variable),2L));'
                        : '',
                    'rt$restore_payload_snapshot_fixture <- function() {',
                    'rt$runtime_cached_workspace_snapshot <- original;',
                    'rt$json_variable <- original_variable;',
                    'rm("restore_payload_snapshot_fixture",envir=rt) } }); "installed"'
                ].join(" "));
                let failure;
                try {
                    await runtime.listWorkspaceObjects();
                }
                catch (error) {
                    failure = error;
                }
                requireResult(failure?.message === "Workspace snapshot response is invalid."
                    && failure.cause?.responseError === "invalid-workspace-snapshot",
                    "Real inconsistent R snapshot became an authoritative empty workspace.");
                const retained = runtime.getWorkspaceSnapshot();
                requireResult(retained.objects.some(object => object.name === "package_cache_data"),
                    "Rejected actual snapshot erased the previously prepared dataset.");
                await query([
                    'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code);',
                    'rt$restore_payload_snapshot_fixture() }); "restored"'
                ].join(" "));
                const recovered = await runtime.listWorkspaceObjects();
                requireResult(recovered.status === "ready" && recovered.objects.some(
                    object => object.name === "package_cache_data"
                ), "Actual workspace snapshot did not recover after restoring its private producer.");
                snapshotCorruptions.push(corruption);
            }
            finally {
                await query([
                    'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code);',
                    'restore <- get0("restore_payload_snapshot_fixture",envir=rt,inherits=FALSE);',
                    'if (typeof(restore)=="closure") restore() }); "restored"'
                ].join(" "));
            }
        }
        return { actualRFormatterAndRead: true, controlledInvalidSnapshotProducer: true,
            invalidReplyRejected: true, previousObjectsRetained: true, freshSnapshotRecovered: true,
            rejectedCorruptions: snapshotCorruptions, controlledInvalidVariableFormatter: true };
    };
    const checkMalformedWorkspaceReconciliation = async function() {
        const baseline = await runtime.listWorkspaceObjects({ detectChanges: true });
        requireResult(baseline.objects.some(object => object.name === "package_cache_data"),
            "Conservative reconciliation fixture requires a prepared real dataset.");
        try {
            await query([
                'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code);',
                'stopifnot(!exists("restore_payload_update_fixture",envir=rt,inherits=FALSE));',
                'original <- rt$runtime_workspace_delta;',
                'rt$runtime_workspace_delta <- function() {',
                'output <- original(); output$result$workspaceRevision <- NULL; output };',
                'rt$restore_payload_update_fixture <- function() {',
                'rt$runtime_workspace_delta <- original;',
                'rm("restore_payload_update_fixture",envir=rt) } }); "installed"'
            ].join(" "));
            let failure;
            try {
                await runtime.listWorkspaceObjects({ detectChanges: true });
            }
            catch (error) {
                failure = error;
            }
            requireResult(failure?.message === "Workspace refresh response is invalid."
                && failure.cause?.responseError === "invalid-workspace-update",
                "Real missing-receipt R delta became an accepted workspace reconciliation.");
            requireResult(runtime.getWorkspaceSnapshot().objects.some(
                object => object.name === "package_cache_data"
            ), "Rejected actual reconciliation erased the prepared dataset.");
            await query([
                'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code);',
                'rt$restore_payload_update_fixture() }); "restored"'
            ].join(" "));
            const recovered = await runtime.listWorkspaceObjects({ detectChanges: true });
            requireResult(recovered.status === "ready" && recovered.objects.some(
                object => object.name === "package_cache_data"
            ), "Actual reconciliation did not recover after restoring its private producer.");
            return { actualRFormatterAndRead: true, controlledInvalidReconciliationProducer: true,
                invalidReplyRejected: true, previousObjectsRetained: true, freshReconciliationRecovered: true };
        }
        finally {
            await query([
                'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code);',
                'restore <- get0("restore_payload_update_fixture",envir=rt,inherits=FALSE);',
                'if (typeof(restore)=="closure") restore() }); "restored"'
            ].join(" "));
        }
    };
    const checkMalformedExtensionWorkspace = async function() {
        const baseline = await runtime.listWorkspaceObjects();
        requireResult(baseline.objects.some(object => object.name === "package_cache_data"),
            "Extension receipt fixture requires the prepared dataset.");
        let path;
        try {
            path = String(await query([
                'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code);',
                'stopifnot(!exists("restore_extension_payload_fixture",envir=rt,inherits=FALSE));',
                'original <- rt$runtime_workspace_delta;',
                'rt$runtime_workspace_delta <- function() {',
                'output <- original(); output$result$workspaceRevision <- NULL;',
                'output$result$removed <- "package_cache_data"; output };',
                'rt$restore_extension_payload_fixture <- function() {',
                'rt$runtime_workspace_delta <- original;',
                'rm("restore_extension_payload_fixture",envir=rt) };',
                'path <- tempfile("dialogforge-extension-payload-",fileext=".R");',
                'writeLines("package_cache_extension_hits <- get0(\\"package_cache_extension_hits\\",envir=.GlobalEnv,ifnotfound=0L) + 1L",path);',
                'path })'
            ].join(" ")));
            const result = await runtime.executeRuntimeMethod({
                method: "runtime.run_script_file", params: { path }, source: "extension-receipt-fixture"
            });
            requireResult(result.status === "ready" && result.workspaceUpdate === undefined
                && result.workspaceReconciliation === "failed",
                "Actual completed script accepted its malformed embedded workspace receipt.");
            const retained = runtime.getWorkspaceSnapshot();
            requireResult(retained.objects.some(object => object.name === "package_cache_data")
                && retained.freshness === "stale",
                "Rejected actual extension effects erased rows or falsely retained freshness.");
            requireResult(Number(await query("as.character(package_cache_extension_hits)")) === 1,
                "Receipt failure reran an already-completed script.");
            await query([
                'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code);',
                'rt$restore_extension_payload_fixture() }); "restored"'
            ].join(" "));
            const recovered = await runtime.listWorkspaceObjects();
            requireResult(recovered.freshness === "fresh" && recovered.objects.some(
                object => object.name === "package_cache_data"
            ), "Actual full snapshot did not recover after the extension receipt failure.");
            return { actualRScriptAndFormatter: true, controlledInvalidExtensionProducer: true,
                operationCompletedOnce: true, invalidEffectsRejected: true,
                previousObjectsRetainedAndStale: true, explicitFreshSnapshotRecovered: true };
        }
        finally {
            await query([
                'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code);',
                'restore <- get0("restore_extension_payload_fixture",envir=rt,inherits=FALSE);',
                'if (typeof(restore)=="closure") restore() });',
                path ? 'unlink(' + JSON.stringify(path) + ');' : '',
                'if (exists("package_cache_extension_hits",envir=.GlobalEnv,inherits=FALSE)) rm(package_cache_extension_hits);',
                '"restored"'
            ].join(" "));
        }
    };
    const checkMalformedCommandWorkspace = async function() {
        await runtime.listWorkspaceObjects();
        try {
            await query([
                'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code);',
                'stopifnot(!exists("restore_command_payload_fixture",envir=rt,inherits=FALSE));',
                'original <- rt$emit_workspace_update_event;',
                'rt$emit_workspace_update_event <- function(update=NULL,parent_id="") {',
                'update$workspaceRevision <- NULL; update$removed <- "package_cache_data";',
                'original(update,parent_id) };',
                'rt$restore_command_payload_fixture <- function() {',
                'rt$emit_workspace_update_event <- original;',
                'rm("restore_command_payload_fixture",envir=rt) } }); "installed"'
            ].join(" "));
            const result = await options.execute([
                'package_cache_command_hits <- get0("package_cache_command_hits",envir=.GlobalEnv,ifnotfound=0L) + 1L',
                'cat("command-payload-completed\\n")'
            ].join("; "), "answer");
            requireResult(result.outcome === "success" && result.workspaceUpdate === null
                && result.workspaceReconciliation === "failed",
                "Actual successful evaluation accepted a malformed workspace event.");
            const retained = runtime.getWorkspaceSnapshot();
            requireResult(retained.freshness === "stale" && retained.objects.some(
                object => object.name === "package_cache_data"
            ), "Malformed actual event erased the prepared dataset or advertised freshness.");
            requireResult(Number(await query("as.character(package_cache_command_hits)")) === 1,
                "Malformed workspace event replayed already-completed R evaluation.");
            await query([
                'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code);',
                'rt$restore_command_payload_fixture() }); "restored"'
            ].join(" "));
            const recovered = await runtime.listWorkspaceObjects();
            requireResult(recovered.freshness === "fresh" && recovered.objects.some(
                object => object.name === "package_cache_data"
            ), "Actual full snapshot did not recover after malformed command effects.");
            return { actualREvaluationAndFormatter: true, controlledInvalidCommandEvent: true,
                evaluationCompletedOnce: true, invalidEffectsRejected: true,
                previousObjectsRetainedAndStale: true, explicitFreshSnapshotRecovered: true };
        }
        finally {
            await query([
                'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code);',
                'restore <- get0("restore_command_payload_fixture",envir=rt,inherits=FALSE);',
                'if (typeof(restore)=="closure") restore() });',
                'if (exists("package_cache_command_hits",envir=.GlobalEnv,inherits=FALSE)) rm(package_cache_command_hits);',
                '"restored"'
            ].join(" "));
        }
    };
    const checkDialogFallbackScope = async function() {
        const sparse = workspace => ({ ...workspace, objects: workspace.objects
            .filter(object => object.name === "package_cache_data")
            .map(object => ({ ...object, columnEntries: [] })) });
        let workspace = sparse(await runtime.listWorkspaceObjects());
        let reads = 0;
        let holdSchema = false;
        let release;
        let reportProduced;
        let timer;
        const gate = new Promise(resolve => { release = resolve; });
        const produced = new Promise(resolve => { reportProduced = resolve; });
        const facade = {
            getSnapshot: () => runtime.getSnapshot(),
            getWorkspaceSnapshot: () => workspace,
            listWorkspaceObjects: async () => workspace,
            readTabularSchema: async name => {
                reads++;
                const result = await runtime.readTabularSchema(name);
                if (holdSchema) {
                    reportProduced();
                    await gate;
                }
                return result;
            }
        };
        const resolve = options.createResolverOwner(() => facade);
        try {
            const initial = await resolve();
            requireResult(initial[0]?.columns[0]?.numeric, "Actual fallback variable was not numeric.");
            await resolve();
            requireResult(reads === 1, "Unchanged actual dialog fallback repeated its schema read.");
            requireResult((await options.execute(
                'package_cache_data$value <- c("a","b","c","d")', "answer"
            )).outcome === "success", "Actual fallback variable retyping failed.");
            workspace = sparse(await runtime.listWorkspaceObjects());
            const changed = await resolve();
            requireResult(changed[0]?.columns[0]?.character && reads === 2,
                "New actual workspace revision retained the previous numeric dialog schema.");
            requireResult((await options.execute(
                'package_cache_data$text <- rep("changed",4)', "answer"
            )).outcome === "success", "Actual late-schema setup failed.");
            workspace = sparse(await runtime.listWorkspaceObjects());
            holdSchema = true;
            const old = resolve();
            void old.catch(() => {});
            await Promise.race([produced, new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(Error("Actual fallback schema did not return")), 5000);
            })]);
            requireResult((await options.execute('package_cache_data$value <- 1:4', "answer"))
                .outcome === "success", "Actual replacement fallback schema setup failed.");
            workspace = sparse(await runtime.listWorkspaceObjects());
            holdSchema = false;
            release();
            requireResult((await old).length === 0, "Late actual schema escaped its older workspace scope.");
            const current = await resolve();
            requireResult(current[0]?.columns[0]?.numeric && reads === 4,
                "Fresh actual numeric schema did not recover after late-schema retirement.");
            return { actualRSchema: true, controlledSparseWorkspace: true,
                actualWorkspaceRetyping: true, unchangedSchemaReads: 1,
                staleSchemaPublished: false, controlledLateReceipt: true, totalSchemaReads: reads };
        }
        finally {
            clearTimeout(timer);
            release();
        }
    };
    try {
        cache.warmFirstScreens("package_cache_data");
        const initial = await readScreens();
        requireResult(initial.preview.status === "ready" && initial.metadata.items.length === 2
            && initial.metadata.items.every(item => item.measure === "interval"),
        "Actual initial declared inference and preview were not warmed.");
        const initialReads = calls.length;
        await readScreens();
        requireResult(calls.length === initialReads, "Ready screens repeated runtime reads before package change.");

        const load = await options.execute('library("DialogForgeCacheFixture"); cat("cache-method-registered\\n")', "answer");
        requireResult(load.outcome === "success" && load.workspaceUpdate?.datasets.removed.includes("package_cache_data"),
            "Actual package method registration did not retire unsafe dataset ownership.");
        const loadEffects = options.createEffects(load.workspaceUpdate);
        const hitsAfterLoad = Number(await query("as.character(package_cache_hits)"));
        await Promise.all(options.applyEffects(loadEffects, cache));
        const restricted = await readScreens();
        // Workspace discovery conservatively restricts the whole data frame.
        // Targeted column reads may remain safe: they do not dispatch the
        // modified format.data.frame method. Require fresh reads, not a blanket
        // refusal of operations that never use that method.
        requireResult(calls.length === initialReads + 2
            && restricted.preview.status === "ready" && restricted.metadata.items.length === 2,
            "Accepted package effects did not retire both warmed screens: "
            + JSON.stringify({ restricted, loadEffects, calls }));
        const hitsAfterRead = Number(await query("as.character(package_cache_hits)"));
        requireResult(hitsAfterLoad === 0 && hitsAfterRead === 0,
            "Automatic reconciliation/cache reads invoked the package format method: "
            + JSON.stringify({ hitsAfterLoad, hitsAfterRead, calls: await query("package_cache_last_calls") }));
        const explicit = await options.execute('invisible(try(format(package_cache_data),silent=TRUE))', "answer");
        requireResult(explicit.outcome === "success" && Number(await query("as.character(package_cache_hits)")) === 1,
            "The namespace method was not physically registered for explicit R evaluation.");

        const unload = await options.execute('detach("package:DialogForgeCacheFixture",unload=TRUE); cat("cache-method-restored\\n")', "answer");
        requireResult(unload.outcome === "success" && unload.workspaceUpdate?.datasets.added.includes("package_cache_data"),
            "Actual fixture namespace unload did not restore the safe dataset owner.");
        const unloadEffects = options.createEffects(unload.workspaceUpdate);
        await Promise.all(options.applyEffects(unloadEffects, cache));
        cache.warmFirstScreens("package_cache_data");
        const restored = await readScreens();
        requireResult(restored.preview.status === "ready" && Number(restored.preview.rows[0].value.raw) === 1
            && restored.metadata.items.length === 2
            && restored.metadata.items.every(item => item.measure === "interval"),
        "Package-method restoration did not recover unchanged Data/Variables screens.");
        requireResult(Number(await query("as.character(package_cache_hits)")) === 1,
            "Restored automatic reads invoked the removed namespace method.");
        const restoredReads = calls.length;
        await readScreens();
        requireResult(calls.length === restoredReads, "Restored warmed screens repeated runtime reads.");
        const stableOwner = String(await query([
            'local({ search_environment <- as.environment("DialogApp");',
            'owner <- environment(search_environment$runtime_workspace_change_for_code);',
            'as.character(identical(search_environment$app_env, owner) &&',
            'identical(search_environment$event_seq, owner$event_seq) &&',
            'identical(search()[[2L]], "DialogApp")) })'
        ].join(" ")));
        requireResult(stableOwner === "TRUE",
            "Package attachment copied runtime state away from its function owner.");
        const lateMetadataFailures = await checkLateMetadataFailures();
        const crossObjectNamedRefresh = await checkCrossObjectNamedRefresh();
        const dialogFallbackScope = await checkDialogFallbackScope();
        const metadataDeliveryBarrier = await checkMetadataDeliveryBarrier();
        const namedMetadataFailures = await checkNamedMetadataFailure();
        const crossObjectWarmup = await checkCrossObjectWarmup();
        const malformedWorkspaceSnapshot = await checkMalformedWorkspaceSnapshot();
        const malformedWorkspaceReconciliation = await checkMalformedWorkspaceReconciliation();
        const malformedExtensionWorkspace = await checkMalformedExtensionWorkspace();
        const malformedCommandWorkspace = await checkMalformedCommandWorkspace();
        return { host: options.host, actualPackageNamespace: true, initialReads, calls,
            loadEffects, unloadEffects, afterPackagePreviewStatus: restricted.preview.status,
            afterPackageMetadataCount: restricted.metadata.items.length,
            packageEffectsRetiredBothScreens: true,
            restoredMeasures: restored.metadata.items.map(item => item.measure),
            automaticMethodHits: 0, explicitMethodHits: 1, warmedReadsReused: true,
            stableSearchOwner: true,
            lateMetadataFailures,
            crossObjectNamedRefresh,
            dialogFallbackScope,
            metadataDeliveryBarrier,
            namedMetadataFailures,
            crossObjectWarmup,
            malformedWorkspaceSnapshot,
            malformedWorkspaceReconciliation,
            malformedExtensionWorkspace,
            malformedCommandWorkspace,
            renderedEditorChecked: false };
    }
    finally {
        cache.invalidate();
        const cleanup = await options.execute([
            'if (is.element("package:DialogForgeCacheFixture",search())) detach("package:DialogForgeCacheFixture",unload=TRUE)',
            '.libPaths(package_cache_original_libraries)',
            'rm(package_cache_original_libraries,package_cache_library,package_cache_data,package_cache_hits,package_cache_last_calls)'
        ].join("; "), "answer");
        requireResult(cleanup.outcome === "success", "Private package/cache state restoration failed.");
    }
};
