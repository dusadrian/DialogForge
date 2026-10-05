"use strict";

// ONE actual named-metadata response held after R returns, while a later
// actual accepted metadata mutation updates the same cache on both hosts.
exports.checkActualMetadataRefreshRace = async function(options) {
    const objectName = options.objectName;
    let holdNextNamed = false;
    let release;
    let completed;
    const gate = new Promise(resolve => { release = resolve; });
    const oldRead = new Promise(resolve => { completed = resolve; });
    const calls = [];
    const cache = options.createCache({
        readTabularPreview: request => options.runtime.readTabularPreview(request),
        readVariableMetadata: name => options.runtime.readVariableMetadata(name),
        executeRuntimeMethod: async function(request) {
            const result = await options.runtime.executeRuntimeMethod(request);
            calls.push({ method: request.method, params: request.params });
            if (holdNextNamed && request.method === "workspace.dataset_variables_named") {
                holdNextNamed = false;
                completed(result);
                await gate;
                if (options.throwAfterHold) {
                    throw Error("Scoped obsolete named metadata exception");
                }
            }
            return result;
        }
    });
    cache.warmVariableMetadata(objectName);
    await cache.readVariableMetadata(objectName, 1, 48);
    const change = async function(label) {
        const result = await options.execute(
            'attr(' + objectName + '$V1, "label") <- ' + JSON.stringify(label)
            + '; cat("metadata-race-ready\\n")', "answer");
        if (result.outcome !== "success" || !result.workspaceUpdate?.workspaceRevision) {
            throw Error(options.host + ": actual metadata mutation did not commit");
        }
        return options.createEffects(result.workspaceUpdate);
    };
    let timeout;
    try {
        const firstEffects = await change("first-race-label");
        holdNextNamed = true;
        const oldRefresh = Promise.all(options.applyEffects(firstEffects, cache));
        const firstRead = await Promise.race([
            oldRead,
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(Error("Actual named metadata did not reach held boundary")), 10000);
            })
        ]);
        if (firstRead.status !== "ready" || firstRead.value?.items?.[0]?.label !== "first-race-label") {
            throw Error(options.host + ": held named metadata was not the actual first mutation");
        }
        const secondEffects = await change("second-race-label");
        await Promise.all(options.applyEffects(secondEffects, cache));
        const beforeRelease = await cache.readVariableMetadata(objectName, 1, 48);
        if (beforeRelease.items[0]?.label !== "second-race-label") {
            throw Error(options.host + ": later actual label was not accepted before old release");
        }
        release();
        await oldRefresh;
        const afterRelease = await cache.readVariableMetadata(objectName, 1, 48);
        if (afterRelease.items[0]?.label !== "second-race-label") {
            throw Error(options.host + ": old completed named metadata overwrote later accepted label: "
                + JSON.stringify({ before: beforeRelease.items[0]?.label, after: afterRelease.items[0]?.label }));
        }
        return { host: options.host, firstActualLabel: firstRead.value.items[0].label,
            beforeRelease: beforeRelease.items[0].label, afterRelease: afterRelease.items[0].label,
            calls, actualRMutations: 2, controlledCompletedReply: true,
            controlledObsoleteException: Boolean(options.throwAfterHold), renderedEditorChecked: false };
    } finally {
        release();
        clearTimeout(timeout);
        cache.invalidate();
    }
};

// Actual R replies with either the direct cache-copy API or the SAME workspace
// receipt/effect reader used by both host compositions. Neither is a rendered
// Duplicate/menu check or proof of application notification delivery.
exports.checkActualMetadataWarmupReplacement = async function(options) {
    const source = "metadata_copy_source";
    const target = "metadata_copy_target";
    let release;
    let completed;
    let hold = true;
    let releasePreview;
    let previewCompleted;
    let previewReads = 0;
    const previewGate = new Promise(resolve => { releasePreview = resolve; });
    const oldPreview = new Promise(resolve => { previewCompleted = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const oldRead = new Promise(resolve => { completed = resolve; });
    const calls = [];
    const cache = options.createCache({
        readTabularPreview: async function(request) {
            const result = await options.runtime.readTabularPreview(request);
            previewReads += 1;
            if (previewReads === 1) {
                previewCompleted(result);
                await previewGate;
            }
            return result;
        },
        readVariableMetadata: name => options.runtime.readVariableMetadata(name),
        executeRuntimeMethod: async function(request) {
            const result = await options.runtime.executeRuntimeMethod(request);
            calls.push({ method: request.method, name: request.params?.name });
            if (hold && request.method === "workspace.dataset_variables_batch"
                && request.params.name === target) {
                hold = false;
                completed(result);
                await gate;
            }
            return result;
        }
    });
    let timeout;
    let pendingBoundary = "create replacement fixtures";
    const checkReplacement = async function() {
        const created = await options.execute(
            source + ' <- data.frame(x=1:3); attr(' + source + '$x,"label") <- "copied current"; '
            + target + ' <- data.frame(x=4:6); attr(' + target + '$x,"label") <- "old target"', "answer");
        if (created.outcome !== "success") {
            throw Error(options.host + ": actual copy fixtures were not created");
        }
        cache.warmVariableMetadata(source);
        pendingBoundary = "warm source metadata";
        await cache.readVariableMetadata(source, 1, 48);
        cache.warmVariableMetadata(target);
        pendingBoundary = "hold old target metadata";
        const old = await oldRead;
        if (old.status !== "ready" || old.value?.items?.[0]?.label !== "old target") {
            throw Error(options.host + ": held actual target label was not established");
        }
        cache.warmPreview(target);
        const readingPreview = cache.readPreview({ objectName: target, rowStart: 1, rowCount: 3, columnCount: 1 });
        pendingBoundary = "hold old target preview";
        const previousPreview = await oldPreview;
        if (Number(previousPreview.rows[0]?.x?.raw) !== 4) {
            throw Error(options.host + ": old actual target preview was not established");
        }
        // Put the current reader beyond the existing short warmup wait before
        // retiring its owner. No old response is released to make it advance.
        await new Promise(resolve => setTimeout(resolve, 160));
        pendingBoundary = "execute actual target replacement";
        const copied = await options.execute(target + " <- " + source, "answer");
        if (copied.outcome !== "success" || !copied.workspaceUpdate?.workspaceRevision) {
            throw Error(options.host + ": actual R copy did not commit");
        }
        const effects = options.createEffects(copied.workspaceUpdate);
        if (options.viaReceiptEffects) {
            if (!effects.some(effect => effect.name === target)) {
                throw Error(options.host + ": actual replacement receipt omitted target effects");
            }
            pendingBoundary = "apply actual replacement receipt effects";
            await Promise.all(options.applyEffects(effects, cache));
        } else {
            cache.copy(source, target);
        }
        pendingBoundary = "read metadata before retired reply release";
        const before = await cache.readVariableMetadata(target, 1, 48);
        if (before.items[0]?.label !== "copied current") {
            throw Error(options.host + ": shared copy API did not accept source metadata");
        }
        pendingBoundary = "read preview before retired reply release";
        const retiredPreview = await readingPreview;
        if (
            retiredPreview.status !== "unavailable"
            || retiredPreview.rows.length !== 0
            || previewReads !== 1
        ) {
            throw Error(options.host + ": replaced preview reader did not retire without a replacement read");
        }
        const currentPreview = await cache.readPreview({
            objectName: target, rowStart: 1, rowCount: 3, columnCount: 1
        });
        if (Number(currentPreview.rows[0]?.x?.raw) !== 1 || previewReads !== 2) {
            throw Error(options.host + ": replaced preview warmup returned old target bytes");
        }
        release();
        releasePreview();
        await new Promise(resolve => setTimeout(resolve, 0));
        pendingBoundary = "read metadata after retired reply release";
        const after = await cache.readVariableMetadata(target, 1, 48);
        if (after.items[0]?.label !== "copied current") {
            throw Error(options.host + ": completed retired target warmup overwrote copy: "
                + JSON.stringify({ before: before.items[0]?.label, after: after.items[0]?.label }));
        }
        return { host: options.host, before: before.items[0].label, after: after.items[0].label,
            oldPreview: Number(previousPreview.rows[0].x.raw), currentPreview: Number(currentPreview.rows[0].x.raw),
            previewReads,
            retiredPreviewStatus: retiredPreview.status,
            previewReturnedBeforeRetiredReplyRelease: true,
            actualRMutations: 2, controlledCompletedReply: true, calls,
            effects,
            sharedCacheCopyAPIChecked: !options.viaReceiptEffects,
            sharedReceiptCacheEffectsChecked: Boolean(options.viaReceiptEffects),
            applicationCopyReceiptWiringChecked: false,
            renderedEditorChecked: false };
    };
    try {
        return await Promise.race([checkReplacement(), new Promise((_, reject) => {
            timeout = setTimeout(() => reject(Error(options.host
                + ": actual metadata/preview replacement did not settle within twenty seconds at "
                + pendingBoundary)), 20000);
        })]);
    } finally {
        release();
        releasePreview();
        clearTimeout(timeout);
        cache.invalidate();
    }
};
