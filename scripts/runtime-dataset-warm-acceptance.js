"use strict";

const { checkActualMetadataRefreshRace, checkActualMetadataWarmupReplacement } =
    require("./runtime-dataset-metadata-race-acceptance");

// One actual runtime/cache scenario imported by both physical test adapters.
// Timings end at accepted data, not DOM paint or a completed import workflow.
exports.measureRuntimeDatasetWarming = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    };
    const objectName = "warming_data";
    const started = Date.now();
    const created = await options.execute(
        'stopifnot(requireNamespace("declared",quietly=TRUE), as.character(getNamespaceVersion("declared"))=="0.27"); warming_data <- as.data.frame(matrix(rep(c(1,2,3,4),length.out=490000L),nrow=2000L)); warming_data$V1 <- as.character(warming_data$V1); cat("warming-ready\\n")',
        "answer"
    );
    requireResult(created.outcome === "success", "Actual warming dataset creation failed.");
    const creationMs = Date.now() - started;
    const calls = [];
    const metadataNames = new Set();
    let metadataFinished;
    const metadataReady = new Promise(resolve => { metadataFinished = resolve; });
    const runtime = options.runtime;
    const cache = options.createCache({
        readTabularPreview: async function(request) {
            const call = { kind: "preview", request: { ...request }, startedAt: Date.now() };
            calls.push(call);
            const result = await runtime.readTabularPreview(request);
            call.durationMs = Date.now() - call.startedAt;
            call.rows = result.rows.length;
            call.columns = result.columns.length;
            return result;
        },
        executeRuntimeMethod: async function(request) {
            const call = { kind: "metadata", method: request.method,
                params: { ...request.params }, startedAt: Date.now() };
            calls.push(call);
            const result = await runtime.executeRuntimeMethod(request);
            call.durationMs = Date.now() - call.startedAt;
            for (const item of result.value?.items || []) {
                metadataNames.add(item.name);
            }
            if (metadataNames.size === 245) {
                metadataFinished();
            }
            return result;
        },
        readVariableMetadata: async function(name) {
            calls.push({ kind: "full-metadata-fallback" });
            return runtime.readVariableMetadata(name);
        }
    });
    const request = { objectName, rowStart: 1, rowCount: 40, columnCount: 32 };
    const warmedAt = Date.now();
    cache.warmFirstScreens(objectName);
    let firstDataMs;
    let firstVariablesMs;
    const [preview, variables] = await Promise.all([
        cache.readPreview(request).then(result => {
            firstDataMs = Date.now() - warmedAt;
            return result;
        }),
        cache.readVariableMetadata(objectName, 1, 48).then(result => {
            firstVariablesMs = Date.now() - warmedAt;
            return result;
        })
    ]);
    const firstScreensMs = Date.now() - warmedAt;
    requireResult(preview.status === "ready" && preview.rows.length === 40
        && preview.columns.length === 32 && preview.totalRowCount === 2000
        && preview.totalColumnCount === 245, "First Data request was not bounded to its viewport.");
    requireResult(variables.total === 245 && variables.items.length === 48,
        "First Variables request did not return its bounded screen.");
    requireResult(variables.items.every(item => item.measure === "interval"),
        "Required declared quantitative inference, including numeric-character input, was absent.");
    let timer;
    try {
        await Promise.race([metadataReady, new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error("Actual background metadata exceeded 30 seconds.")), 30000);
        })]);
    } finally {
        clearTimeout(timer);
    }
    // Let the cache's own completed-batch continuation store the final page.
    await new Promise(resolve => setTimeout(resolve, 0));
    const complete = await cache.readVariableMetadata(objectName, 1, 245);
    requireResult(complete.items.length === 245, "Background variable metadata was incomplete.");
    const backgroundMs = Date.now() - warmedAt;
    const beforeRepeat = calls.length;
    const repeatedAt = Date.now();
    await Promise.all([cache.readPreview(request), cache.readVariableMetadata(objectName, 1, 48)]);
    const repeatedMs = Date.now() - repeatedAt;
    requireResult(calls.length === beforeRepeat, "Ready warmed screens triggered redundant runtime reads.");
    requireResult(calls.filter(call => call.kind === "preview").every(call => call.request.rowCount === 40
        && call.request.columnCount === 32 && call.rows === 40 && call.columns === 32),
        "Warming eagerly read data beyond the first viewport.");
    requireResult(!calls.some(call => call.kind === "full-metadata-fallback"),
        "Batch-capable runtime fell back to complete metadata reads.");
    const metadataCalls = calls.filter(call => call.kind === "metadata");
    requireResult(metadataCalls[0].params.start === 1 && metadataCalls[0].params.count === 48,
        "First-screen warming changed the initial Variables viewport.");
    let nextStart = 1;
    for (const call of metadataCalls) {
        requireResult(call.params.start === nextStart && call.params.count > 0
            && call.params.count <= 100 && nextStart + call.params.count - 1 <= 245,
            "Background metadata repeated, skipped or exceeded a bounded page.");
        nextStart += call.params.count;
    }
    requireResult(nextStart === 246, "Background metadata did not cover every variable exactly once.");
    const report = { host: options.host, rows: 2000, columns: 245, creationMs,
        firstDataMs, firstVariablesMs, firstScreensMs,
        backgroundMs, repeatedMs, previewObjectBytes: new TextEncoder().encode(JSON.stringify(preview)).byteLength,
        firstMetadataObjectBytes: new TextEncoder().encode(JSON.stringify(variables)).byteLength, calls,
        firstMeasures: variables.items.slice(0, 4).map(item => item.measure),
        renderedPaintMeasured: false };
    if (options.checkInvalidation) {
        const changes = [];
        const change = async function(name, code) {
            const result = await options.execute(code + '; cat("cache-change-ready\\n")', "answer");
            requireResult(result.outcome === "success" && result.workspaceUpdate?.workspaceRevision,
                "Actual cache mutation did not commit a workspace receipt: " + name);
            const effects = options.createEffects(result.workspaceUpdate);
            await Promise.all(options.applyEffects(effects, cache));
            changes.push({ name, effects });
        };
        await change("cell", "warming_data$V2[1L] <- 99");
        const cell = await cache.readPreview(request);
        requireResult(cell.status === "ready" && Number(cell.rows[0].V2.raw) === 99,
            "Accepted R cell mutation left a stale first Data screen: " + JSON.stringify(cell.rows[0]));
        // Rewarm after invalidation so retyping must invalidate an actual cached
        // preview, not merely return a fresh uncached fallback read.
        cache.warmPreview(objectName);
        await cache.readPreview(request);
        await change("label", 'attr(warming_data$V1, "label") <- "accepted label"');
        const label = await cache.readVariableMetadata(objectName, 1, 48);
        requireResult(label.items[0].label === "accepted label",
            "Accepted R metadata mutation left a stale first Variables screen.");
        cache.warmPreview(objectName);
        await cache.readPreview(request);
        await change("retype", 'warming_data$V1 <- rep(c("alpha", "beta"), 1000L)');
        const retyped = await cache.readVariableMetadata(objectName, 1, 48);
        const retypedData = await cache.readPreview(request);
        requireResult(retyped.items[0].measure === "nominal" && retypedData.rows[0].V1.raw === "alpha",
            "Accepted R retype retained numeric-character inferred metadata or old data.");
        if (options.checkMetadataRace) {
            report.metadataRefreshRace = {
                lateSuccess: await checkActualMetadataRefreshRace({ ...options, objectName }),
                lateException: await checkActualMetadataRefreshRace({ ...options, objectName, throwAfterHold: true })
            };
            report.metadataWarmupReplacement = await checkActualMetadataWarmupReplacement(options);
            report.receiptWarmupReplacement = await checkActualMetadataWarmupReplacement({
                ...options, viaReceiptEffects: true
            });
        }
        let releasePreview;
        let previewRead;
        const previewHeld = new Promise(resolve => { releasePreview = resolve; });
        const previewCompleted = new Promise(resolve => { previewRead = resolve; });
        let previewReads = 0;
        const raceCache = options.createCache({
            readTabularPreview: async request => {
                const result = await runtime.readTabularPreview(request);
                previewReads++;
                if (previewReads === 1) {
                    previewRead();
                    await previewHeld;
                }
                return result;
            },
            executeRuntimeMethod: request => runtime.executeRuntimeMethod(request),
            readVariableMetadata: name => runtime.readVariableMetadata(name)
        });
        raceCache.warmPreview(objectName);
        const pendingPreview = raceCache.readPreview(request);
        await previewCompleted;
        const raceMutation = await options.execute('warming_data$V2[1L] <- 123; cat("cache-race-ready\\n")', "answer");
        requireResult(raceMutation.outcome === "success" && raceMutation.workspaceUpdate?.workspaceRevision,
            "Actual mutation while preview delivery held did not commit.");
        const raceEffects = options.createEffects(raceMutation.workspaceUpdate);
        await Promise.all(options.applyEffects(raceEffects, raceCache));
        await Promise.all(options.applyEffects(raceEffects, cache));
        releasePreview();
        const retiredPreview = await pendingPreview;
        requireResult(retiredPreview.status === "unavailable"
            && retiredPreview.rows.length === 0 && previewReads === 1,
            "Retired preview reader dispatched replacement data after an actual mutation.");
        const racePreview = await raceCache.readPreview(request);
        requireResult(Number(racePreview.rows[0].V2.raw) === 123 && previewReads === 2,
            "Old completed preview bypassed an intervening actual mutation/cache generation.");
        raceCache.invalidate();
        await change("copy", "warming_copy <- warming_data");
        const copied = await cache.readPreview({ ...request, objectName: "warming_copy" });
        const copiedMetadata = await cache.readVariableMetadata("warming_copy", 1, 48);
        requireResult(copied.status === "ready" && copied.rows[0].V1.raw === "alpha"
            && copiedMetadata.items[0].measure === "nominal", "Actual copied dataset lost accepted cache state.");
        await change("remove", "rm(warming_copy)");
        const removed = await cache.readPreview({ ...request, objectName: "warming_copy" });
        requireResult(removed.status !== "ready", "Removed R dataset retained a ready cached preview.");
        report.invalidation = { changes, cell: cell.rows[0].V2.raw, label: label.items[0].label,
            retypedMeasure: retyped.items[0].measure, retypedValue: retypedData.rows[0].V1.raw,
            copiedMeasure: copiedMetadata.items[0].measure, removedStatus: removed.status,
            heldPreviewRace: { value: racePreview.rows[0].V2.raw, previewReads,
                retiredStatus: retiredPreview.status, effects: raceEffects } };
    }
    cache.invalidate(objectName);
    const cleaned = await options.execute('rm(warming_data); cat("warming-cleaned\\n")', "answer");
    requireResult(cleaned.outcome === "success", "Warming fixture cleanup failed.");
    return report;
};
