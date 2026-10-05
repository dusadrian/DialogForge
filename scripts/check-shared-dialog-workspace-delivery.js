"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { captureProductDialogWorkspaceTarget, createProductDialogWorkspaceDelivery, readProductDialogWorkspaceDeliveryWarning } = require("../dist/src/dialog-runtime/dialog-builder/productDialogWorkspaceDelivery");
const { ProductDialogWindowRegistry } = require("../dist/src/dialog-runtime/dialog-builder/productDialogWindowRegistry");
const { createWorkspaceSnapshotDelivery, captureWorkspaceRuntimeScope } = require("../dist/src/runtime/workspace/workspaceSnapshotDelivery");
const { createRuntimeSessionIpcController } = require("../dist/src/shell-electron/runtime/runtimeSessionIpcController");
const { workspaceIpcChannels } = require("../dist/src/core/ipc/workspaceIpc");
const { prepareWorkspaceDatasetCacheEffects } = require("../dist/src/runtime/workspace/workspaceUpdateEffects");


const checkMetadataRefreshBarrier = async function(host, outcome) {
    let runtime = {
        getSnapshot: () => ({ providerId: host, lifecycleGeneration: 1, status: "ready" }),
        getWorkspaceSnapshot: () => snapshot
    };
    const snapshot = { providerId: host, status: "ready", objects: [] };
    let release;
    let reject;
    const heldRefresh = new Promise((resolve, fail) => {
        release = resolve;
        reject = fail;
    });
    const failure = new Error("Current named metadata refresh failed");
    const prepared = prepareWorkspaceDatasetCacheEffects({
        datasets: {
            copied: [], added: [], removed: [],
            changed: [{ name: "data", kind: "dataset_variable_meta_changed", columns: ["x"] }]
        }
    }, {
        refreshVariableMetadata: () => heldRefresh,
        copy() {}, invalidatePreview() {}, invalidateVariableMetadata() {}
    });
    const sent = [];
    const errors = [];
    const delivery = createWorkspaceSnapshotDelivery({
        getRuntime: () => runtime,
        publishWorkspace: () => sent.push("workspace"),
        publishDatasetNames: () => sent.push("datasets")
    });
    const pending = delivery.deliver(snapshot, {
        metadataRefreshes: prepared.metadataRefreshes,
        reportMetadataError: error => errors.push(error),
        refreshDialogs: async () => { sent.push("dialogs"); }
    });
    assert.deepEqual(sent, ["workspace", "datasets"],
        "Workspace/first-screen publication must not wait for metadata.");
    await Promise.resolve();
    assert.deepEqual(sent, ["workspace", "datasets"],
        "Dialog refresh must wait for accepted named metadata refresh completion.");

    if (outcome.startsWith("retired")) {
        runtime = { ...runtime };
    }
    if (outcome.endsWith("failure")) {
        reject(failure);
    }
    else {
        release();
    }
    assert.equal(await pending, !outcome.startsWith("retired"));
    assert.deepEqual(errors, outcome === "current-failure" ? [failure] : [],
        "Current errors retain identity; retired errors cannot affect replacement dialogs.");
    assert.deepEqual(sent, outcome.startsWith("retired")
        ? ["workspace", "datasets"] : ["workspace", "datasets", "dialogs"]);

    // Preparation owns rejection observation even when delivery never starts.
    const abandoned = prepareWorkspaceDatasetCacheEffects({
        datasets: {
            copied: [], added: [], removed: [],
            changed: [{ name: "data", kind: "dataset_variable_meta_changed", columns: ["x"] }]
        }
    }, {
        refreshVariableMetadata: () => Promise.reject(failure),
        copy() {}, invalidatePreview() {}, invalidateVariableMetadata() {}
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(await abandoned.metadataRefreshes, [{ status: "rejected", reason: failure }]);
};


const checkPreparedDialogTarget = async function(host, phase, outcome) {
    const windows = new ProductDialogWindowRegistry();
    let destroyed = false;
    const window = {
        isDestroyed: () => destroyed,
        focus() {},
        close() { destroyed = true; },
        webContents: { id: 1 }
    };
    windows.register("same-dialog", window);
    const frame = { connected: true, inert: false, controlsReady: Promise.resolve() };
    const getTargetScope = function() {
        return host === "native"
            ? windows.get("same-dialog")
            : frame.connected && !frame.inert ? frame.controlsReady : null;
    };
    const isCurrent = captureProductDialogWorkspaceTarget(getTargetScope);
    let release;
    let reject;
    const gate = new Promise((resolve, fail) => {
        release = resolve;
        reject = fail;
    });
    let preparations = 0;
    let reads = 0;
    const sent = [];
    const failure = new Error("Dialog preparation fixture failed");
    const delivery = createProductDialogWorkspaceDelivery({
        readWorkspaceData: async () => ({}),
        readInitialWorkspaceData: function() {
            reads += 1;
            return phase === "workspace" && reads === 1
                ? gate : Promise.resolve({ origin: "fresh-target" });
        },
        getActiveDatasetName: () => "",
        sendWorkspaceData() {}
    });
    if (outcome === "already-closed") {
        window.close();
        frame.inert = true;
    }
    const publication = delivery.publishPreparedWorkspaceData(data => sent.push(data), {
        isCurrent,
        prepare: phase === "prepare" ? function() {
            preparations += 1;
            return gate;
        } : undefined
    });
    const observed = publication.then(() => null, error => error);

    if (outcome.startsWith("retired") || outcome === "reopened") {
        window.close();
        frame.inert = true;
        if (outcome === "reopened") {
            windows.register("same-dialog", { ...window, isDestroyed: () => false });
            frame.controlsReady = Promise.resolve();
            frame.inert = false;
        }
        assert.equal(isCurrent(), false,
            "A retained/reopened frame or replacement same-ID window is not the old target.");
    }
    if (outcome.endsWith("failure")) {
        reject(failure);
    }
    else {
        release({ origin: "old-target" });
    }

    assert.equal(await observed, outcome === "current-failure" ? failure : null,
        "Current preparation errors retain identity; retired target errors cannot affect a replacement.");
    assert.equal(sent.length, outcome === "current-success" ? 1 : 0, host);
    if (outcome === "already-closed") {
        assert.equal(preparations, 0);
        assert.equal(reads, 0, "Closed targets neither prepare nor read initial workspace data.");
    }
    if (phase === "prepare" && !outcome.startsWith("current")) {
        assert.equal(reads, 0, "Retirement during physical preparation prevents the workspace read.");
    }
    if (outcome === "reopened") {
        await delivery.publishPreparedWorkspaceData(data => sent.push(data), {
            isCurrent: captureProductDialogWorkspaceTarget(getTargetScope)
        });
        assert.equal(sent.length, 1);
        assert.equal(sent[0].origin, "fresh-target",
            "An old target's reply must not seed the prepared workspace cache.");
    }
};


const checkInitialWorkspaceFailure = async function(host, interruption, publish) {
    let scope = "initial-runtime";
    let rejectInitial;
    let initialReads = 0;
    const failure = new Error("Initial workspace read failed");
    const replacementFailure = new Error("Replacement workspace read failed");
    const initialRead = new Promise((_resolve, reject) => {
        rejectInitial = reject;
    });
    const sent = [];
    const delivery = createProductDialogWorkspaceDelivery({
        readWorkspaceData: async () => ({ origin: "current-refresh", host }),
        readInitialWorkspaceData: function() {
            initialReads += 1;
            if (initialReads === 1) {
                return initialRead;
            }
            if (interruption === "runtime-replacement-failure") {
                return Promise.reject(replacementFailure);
            }

            return Promise.resolve({ origin: "current-initial", host });
        },
        getSessionScope: () => scope,
        getActiveDatasetName: () => "current-dataset",
        sendWorkspaceData() {}
    });
    const request = publish
        ? delivery.publishPreparedWorkspaceData(data => sent.push(data))
        : delivery.readPreparedWorkspaceData();
    const observed = request.then(
        value => ({ value }),
        error => ({ error })
    );

    if (interruption.startsWith("runtime-replacement")) {
        scope = "replacement-runtime";
    }
    else if (interruption === "newer-refresh") {
        const refresh = await delivery.refreshWorkspaceData();
        assert.equal(refresh.status, "delivered");
    }

    rejectInitial(failure);
    const result = await observed;

    if (interruption === "current") {
        assert.equal(result.error, failure,
            "A current initial-read failure must retain its exact error.");
        assert.equal(initialReads, 1);
        assert.deepEqual(sent, []);
        return;
    }
    if (interruption === "runtime-replacement-failure") {
        assert.equal(result.error, replacementFailure,
            "Retry failure must report the current error, not discard it or reuse the old one.");
        assert.equal(initialReads, 2);
        assert.deepEqual(sent, []);
        return;
    }

    assert.equal(result.error, undefined,
        "An obsolete initial-read error must not fail current preparation.");
    const data = publish ? sent[0] : result.value;
    assert.equal(data.origin, interruption === "runtime-replacement"
        ? "current-initial" : "current-refresh");
    assert.equal(data.host, host);
    assert.equal(data.activeDataset, "current-dataset");
    let expectedInitialReads = 1;
    if (interruption === "runtime-replacement") {
        expectedInitialReads = publish ? 3 : 2;
    }
    assert.equal(initialReads, expectedInitialReads,
        "Publication revalidates a changed scope; a newer cached refresh needs no initial read.");
    assert.equal(sent.length, publish ? 1 : 0,
        "Only the current result may be published.");
};


const main = async function() {
    for (const host of ["r", "webr"]) {
        for (const outcome of ["current-success", "current-failure", "retired-success", "retired-failure"]) {
            await checkMetadataRefreshBarrier(host, outcome);
        }
    }
    for (const host of ["native", "browser"]) {
        for (const interruption of [
            "current", "runtime-replacement", "runtime-replacement-failure",
            "newer-refresh"
        ]) {
            for (const publish of [false, true]) {
                await checkInitialWorkspaceFailure(host, interruption, publish);
            }
        }
    }

    for (const host of ["native", "browser"]) {
        for (const phase of ["prepare", "workspace"]) {
            for (const outcome of [
                "current-success", "current-failure", "retired-success",
                "retired-failure", "reopened", "already-closed"
            ]) {
                await checkPreparedDialogTarget(host, phase, outcome);
            }
        }
    }

    for (const host of ["native", "browser"]) {
        const sent = [];
        let finishDialogs;
        let completed = false;
        const snapshot = {
            providerId: "r",
            workspaceRevision: { session: "first", sequence: 1 },
            objects: [
                { name: "table", capabilities: ["tabular.read"] },
                { name: "legacy", kind: "data.frame", capabilities: [] },
                { name: "scalar", capabilities: [] }
            ]
        };
        let generation = 1;
        let currentWorkspace = snapshot;
        let runtime = {
            getSnapshot: () => ({ lifecycleGeneration: generation, status: "ready" }),
            getWorkspaceSnapshot: () => currentWorkspace
        };
        const initialScope = captureWorkspaceRuntimeScope(() => runtime);
        assert.equal(initialScope(snapshot), true);
        const warmed = [];
        let selected = "table";
        const delivery = createWorkspaceSnapshotDelivery({
            getRuntime: () => runtime,
            getActiveDataset: () => ({ status: "selected", objectName: selected }),
            warmDatasetFirstScreens(name) { warmed.push(name); },
            publishWorkspace(value) { sent.push([host, "workspace", value]); },
            publishDatasetNames(names) { sent.push([host, "editor", names]); }
        });
        const pending = delivery.deliver(snapshot, {
            refreshDialogs() {
                sent.push([host, "dialogs"]);
                return new Promise(resolve => { finishDialogs = resolve; });
            }
        }).then((accepted) => {
            assert.equal(accepted, true);
            completed = true;
        });
        assert.deepEqual(sent.map(entry => entry[1]), ["workspace", "editor", "dialogs"]);
        assert.deepEqual(sent[1][2], ["table", "legacy"]);
        assert.equal(completed, false);
        finishDialogs();
        await pending;
        assert.equal(completed, true);
        assert.deepEqual(warmed, ["table"], host);
        await delivery.deliver(snapshot, { warmActiveDataset: false });
        selected = "scalar";
        await delivery.deliver(snapshot);
        selected = "removed";
        await delivery.deliver(snapshot);
        assert.deepEqual(warmed, ["table"], "Only selected datasets warm.");
        selected = "table";
        await assert.rejects(delivery.deliver(snapshot, {
            async refreshDialogs() { throw new Error("Delivery failed"); }
        }), /Delivery failed/);

        let releaseOlder;
        const older = delivery.deliver(snapshot, {
            refreshDialogs: () => new Promise(resolve => { releaseOlder = resolve; })
        });
        assert.equal(await delivery.deliver(snapshot), true);
        releaseOlder();
        assert.equal(await older, false);

        let rejectRetired;
        const retired = delivery.deliver(snapshot, {
            refreshDialogs: () => new Promise((_resolve, reject) => { rejectRetired = reject; })
        });
        generation += 1;
        assert.equal(initialScope(), false,
            "Pre-delivery operation scope must retire when generation changes.");
        rejectRetired(new Error("Retired delivery failed"));
        assert.equal(await retired, false);

        const beforeStale = sent.length;
        const beforeStaleWarm = warmed.length;
        currentWorkspace = {
            ...snapshot,
            workspaceRevision: { session: "first", sequence: 2 }
        };
        assert.equal(await delivery.deliver(snapshot), false);
        assert.equal(sent.length, beforeStale);
        assert.equal(warmed.length, beforeStaleWarm,
            "Rejected workspace snapshots must not warm stale datasets.");

        let releaseReplacement;
        const replaced = delivery.deliver(currentWorkspace, {
            refreshDialogs: () => new Promise(resolve => { releaseReplacement = resolve; })
        });
        runtime = { ...runtime };
        releaseReplacement();
        assert.equal(await replaced, false);

        const disappearing = createWorkspaceSnapshotDelivery({
            getRuntime: () => runtime,
            publishWorkspace() { runtime = null; },
            publishDatasetNames() { throw new Error("Retired editor delivery must not start"); }
        });
        assert.equal(await disappearing.deliver(currentWorkspace), false);
    }
    const mutationHandlers = new Map();
    const obsolete = { providerId: "r", objects: [], status: "uncertain", message: "Obsolete" };
    const authoritative = { providerId: "r", objects: [], status: "ready" };
    const mutationEffects = [];
    createRuntimeSessionIpcController({
        ipcMain: { handle: (name, handler) => mutationHandlers.set(name, handler) },
        runtimeSessionManager: {
            getSnapshot: () => ({ providerId: "r", lifecycleGeneration: 1, status: "ready" }),
            getWorkspaceSnapshot: () => authoritative,
            removeWorkspaceObjects: async () => obsolete,
            renameWorkspaceObject: async () => obsolete,
            clearWorkspace: async () => obsolete
        },
        invalidateInitialDatasetPreview() {},
        sendWorkspaceSnapshot: async () => false,
        sendTranscriptEvents: () => mutationEffects.push("warning"),
        sendActiveDataset: () => mutationEffects.push("active"),
        broadcastRuntimeEvents: async () => mutationEffects.push("events")
    });
    for (const [channel, input] of [
        [workspaceIpcChannels.removeObjects, { objectNames: ["old"] }],
        [workspaceIpcChannels.renameObject, { oldName: "old", newName: "new" }],
        [workspaceIpcChannels.clear, undefined]
    ]) {
        assert.equal(await mutationHandlers.get(channel)({}, input), authoritative);
    }
    assert.deepEqual(mutationEffects, [],
        "Rejected delivery must not start obsolete warning/selection/event effects.");
    for (const host of ["r", "webr"]) {
        const reads = [];
        const sent = [];
        let scope = "first";
        let active = "current";
        const delivery = createProductDialogWorkspaceDelivery({
            readWorkspaceData: () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
            readInitialWorkspaceData: async () => ({ origin: host, activeDataset: "old" }),
            getSessionScope: () => scope,
            getActiveDatasetName: () => active,
            sendWorkspaceData: (data, target) => sent.push({ data, target })
        });
        const older = delivery.refreshWorkspaceData("target");
        const newer = delivery.refreshWorkspaceData();
        reads[1].resolve({ origin: "newer", activeDataset: "old" });
        assert.equal((await newer).status, "delivered");
        active = "changed";
        reads[0].resolve({ origin: "older" });
        assert.equal((await older).status, "superseded");
        assert.deepEqual(sent, [
            { data: { origin: "newer", activeDataset: "current" }, target: "" },
            { data: { origin: "newer", activeDataset: "changed" }, target: "target" }
        ]);
        assert.equal((await delivery.readPreparedWorkspaceData()).activeDataset, "changed");

        const retired = delivery.refreshWorkspaceData();
        scope = "replacement";
        reads[2].resolve({ origin: "retired" });
        assert.equal((await retired).status, "superseded");
        assert.equal(sent.length, 2);
        assert.equal((await delivery.readPreparedWorkspaceData()).origin, host,
            "Replacement scope must not reuse old prepared data.");

        const failing = delivery.refreshWorkspaceData();
        reads[3].reject(new Error("Read failed"));
        const failed = await failing;
        assert.deepEqual(failed, { status: "failed", error: "Read failed" });
        assert.ok(readProductDialogWorkspaceDeliveryWarning(failed).includes("stale"));
        const retry = delivery.refreshWorkspaceData();
        reads[4].resolve({ origin: "retry" });
        await retry;
        assert.equal(readProductDialogWorkspaceDeliveryWarning({ status: "delivered" }), "");
        assert.equal(readProductDialogWorkspaceDeliveryWarning({ status: "superseded" }), "");
        assert.equal(sent.at(-1).data.origin, "retry");

        const staleFailure = delivery.refreshWorkspaceData();
        const currentRefresh = delivery.refreshWorkspaceData();
        reads[6].resolve({ origin: "current" });
        await currentRefresh;
        reads[5].reject(new Error("Superseded read failed"));
        assert.equal((await staleFailure).status, "superseded");

        let rejectPending;
        const recoveringPreparation = createProductDialogWorkspaceDelivery({
            readWorkspaceData: () => new Promise((_resolve, reject) => { rejectPending = reject; }),
            readInitialWorkspaceData: async () => ({ origin: "initial-recovery" }),
            getActiveDatasetName: () => active,
            sendWorkspaceData() {}
        });
        const failedRefresh = recoveringPreparation.refreshWorkspaceData();
        const preparedAfterFailure = recoveringPreparation.readPreparedWorkspaceData();
        rejectPending(new Error("Pending read failed"));
        assert.equal((await failedRefresh).status, "failed");
        assert.equal((await preparedAfterFailure).origin, "initial-recovery");

        let initialRelease;
        let initialReads = 0;
        const initial = createProductDialogWorkspaceDelivery({
            readWorkspaceData: async () => ({}),
            readInitialWorkspaceData: async () => {
                initialReads += 1;
                if (initialReads === 1) {
                    return new Promise((resolve) => { initialRelease = resolve; });
                }
                return { origin: "replacement" };
            },
            getSessionScope: () => scope,
            getActiveDatasetName: () => active,
            sendWorkspaceData() {}
        });
        const preparation = initial.readPreparedWorkspaceData();
        scope = "third";
        initialRelease({ origin: "retired-initial" });
        assert.equal((await preparation).origin, "replacement");

        const created = [];
        initialReads = 0;
        const creation = initial.publishPreparedWorkspaceData((data) => created.push(data));
        scope = "fourth";
        initialRelease({ origin: "retired-created" });
        await creation;
        assert.equal(created.length, 1);
        assert.equal(created[0].origin, "replacement");
    }
    for (const file of [
        "src/shell-electron/dialog-runtime/productDialogWindowController.ts",
        "src/shell-web/pages/shell.js"
    ]) {
        const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
        assert.ok(source.includes("createProductDialogWorkspaceDelivery({"));
        assert.ok(source.includes("publishPreparedWorkspaceData("));
        assert.ok(source.includes("captureProductDialogWorkspaceTarget("));
        assert.ok(source.includes("isCurrent: isCurrentDialogTarget"));
    }
    const browserShell = fs.readFileSync(path.join(
        __dirname, "..", "src/shell-web/pages/shell.js"
    ), "utf8");
    const refreshStart = browserShell.indexOf("const refreshWebRWorkspacePane =");
    const refreshEnd = browserShell.indexOf("const readBrowserDatasetNames =");
    assert.ok(refreshStart >= 0 && refreshEnd > refreshStart, "Full refresh source boundary was not found.");
    const fullRefresh = browserShell.slice(refreshStart, refreshEnd);
    assert.ok(fullRefresh.includes("notifyBrowserDialogsWorkspaceChanged"),
        "Full browser refresh must use the shared delivery's dialog barrier.");
    assert.ok(!browserShell.includes("getDataEditorCache") && !browserShell.includes("state.dataEditor.cache"),
        "Browser host must not retain dormant editor cache bookkeeping.");
    assert.ok(browserShell.includes("createDatasetEditorWarmCache(manager)"),
        "Removing dormant bookkeeping must retain the SAME live editor cache.");
    for (const file of [
        "src/shell-web/pages/shell.js",
        "src/shell-electron/runtime/runtimeIpcComposition.ts"
    ]) {
        const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
        assert.ok(source.includes("prepareWorkspaceDatasetCacheEffects("),
            "Both hosts must use the SAME metadata-refresh preparation owner.");
        assert.ok(source.includes("metadataRefreshes: prepared.metadataRefreshes"),
            "Both hosts must supply the SAME snapshot-delivery metadata barrier.");
        assert.ok(!source.includes("Promise.allSettled(metadataRefreshes)")
            && !source.includes("void refresh.catch(options.reportError)"),
            "Host compositions must not own parallel completion/failure policies.");
    }
    console.log("Shared dialog workspace delivery cases passed; rendered dialog acceptance remains open.");
};
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
