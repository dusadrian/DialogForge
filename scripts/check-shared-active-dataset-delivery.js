"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createWorkspaceActiveDatasetDelivery, readWorkspaceActiveDatasetScope } = require("../dist/src/runtime/workspace/workspaceActiveDatasetDelivery");
const { createMainWorkspaceController } = require("../dist/src/base-app/features/workspace-pane/mainWorkspaceController");
const { createWorkspaceChannelAdapter } = require("../dist/src/base-app/features/workspace-pane/workspaceChannelAdapter");
const { createRuntimeWorkspaceState } = require("../dist/src/runtime/session/runtimeWorkspaceState");
const { createRuntimeActiveDatasetController } = require("../dist/src/runtime/session/runtimeActiveDatasetController");
const { createDatasetEditorIpcController } = require("../dist/src/shell-electron/dataset-editor/datasetEditorIpcController");
const { datasetEditorIpcChannels } = require("../dist/src/dataset-editor/datasetEditorIpc");
const { createRuntimeSessionIpcController } = require("../dist/src/shell-electron/runtime/runtimeSessionIpcController");
const { workspaceIpcChannels } = require("../dist/src/core/ipc/workspaceIpc");

const selected = (name) => ({ status: "selected", objectName: name, providerId: "fixture" });

const main = async function() {
    for (const file of [
        "src/shell-electron/runtime/runtimeSessionIpcController.ts",
        "src/shell-electron/dataset-editor/datasetEditorIpcController.ts",
        "src/shell-electron/dataset-editor/datasetEditorComposition.ts",
        "src/shell-web/pages/shell.js"
    ]) {
        const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
        assert.ok(source.includes("createWorkspaceActiveDatasetDelivery({"));
        assert.ok(source.includes("getAuthoritativeSnapshot"),
            "Both host selection adapters must consult common authority acceptance.");
    }
    const editorComposition = fs.readFileSync(path.join(__dirname, "..",
        "src/shell-electron/dataset-editor/datasetEditorComposition.ts"), "utf8");
    assert.ok(editorComposition.includes("selectDataset: activeDatasetDelivery.select"));
    assert.ok(editorComposition.includes("reportError: options.reportError"),
        "Opening preparation must retain selection failure reporting.");
    assert.ok(editorComposition.indexOf("options.warmInitialDatasetPreview(objectName)")
        < editorComposition.indexOf("windowController.create()"), "Retain pre-open first-screen warming.");
    assert.ok(editorComposition.indexOf("options.warmInitialVariableMetadata(objectName)")
        < editorComposition.indexOf("windowController.create()"));

    for (const host of ["r", "webr"]) {
        let authority = {
            ...selected("same-name"), providerId: host,
            selectionRevision: { owner: "current", sequence: 2 }
        };
        const authoritativePublished = [];
        const authoritativeSelected = [];
        let response = { ...authority, selectionRevision: { owner: "current", sequence: 1 } };
        const authoritativeDelivery = createWorkspaceActiveDatasetDelivery({
            getSessionScope: () => "scope",
            getAuthoritativeSnapshot: () => authority,
            readActiveDataset: async () => response,
            requestActiveDataset: async () => response,
            publish: (value) => { authoritativePublished.push(value); },
            selected: (value) => { authoritativeSelected.push(value); }
        });
        assert.equal(await authoritativeDelivery.select("same-name"), null,
            "Same-name replies still need the current receipt before warming/publication.");
        response = { ...authority, selectionRevision: { owner: "retired", sequence: 2 } };
        assert.equal(await authoritativeDelivery.select("same-name"), null);
        response = { ...authority, selectionRevision: undefined };
        assert.equal(await authoritativeDelivery.refresh(), null);
        response = authority;
        assert.deepEqual(await authoritativeDelivery.select("same-name"), authority);
        assert.equal(authoritativeSelected.length, 1);
        authority = null;
        assert.equal(await authoritativeDelivery.select("same-name"), null);
        assert.equal(authoritativePublished.length, 1);

        let releaseEffects;
        let effectsStarted;
        const started = new Promise((resolve) => { effectsStarted = resolve; });
        const effectsGate = new Promise((resolve) => { releaseEffects = resolve; });
        authority = { ...selected("first"), providerId: host };
        const effectsDelivery = createWorkspaceActiveDatasetDelivery({
            getSessionScope: () => "scope",
            getAuthoritativeSnapshot: () => authority,
            readActiveDataset: async () => authority,
            requestActiveDataset: async () => authority,
            publish() {},
            selected: async () => { effectsStarted(); await effectsGate; }
        });
        const pendingEffects = effectsDelivery.select("first");
        await started;
        authority = { ...selected("second"), providerId: host };
        await effectsDelivery.refresh();
        releaseEffects();
        assert.equal(await pendingEffects, null,
            "Follow-up completion cannot return a snapshot superseded during its await.");

        const nativeHandlers = new Map();
        const staleSnapshot = { ...authority,
            selectionRevision: { owner: "owner", sequence: 1 } };
        const currentSnapshot = { ...authority,
            selectionRevision: { owner: "owner", sequence: 2 } };
        const nativeEffects = [];
        createRuntimeSessionIpcController({
            ipcMain: { handle: (name, callback) => nativeHandlers.set(name, callback) },
            runtimeSessionManager: {
                getWorkspaceSnapshot: () => ({ providerId: host, objects: [] }),
                getActiveDataset: () => currentSnapshot,
                setActiveDataset: async () => staleSnapshot
            },
            sendActiveDataset: () => nativeEffects.push("broadcast"),
            warmInitialDatasetPreview: () => nativeEffects.push("preview"),
            warmInitialVariableMetadata: () => nativeEffects.push("metadata"),
            broadcastRuntimeEvents: async () => nativeEffects.push("events")
        });
        assert.deepEqual(await nativeHandlers.get(workspaceIpcChannels.setActiveDataset)({}, "second"), currentSnapshot);
        assert.deepEqual(nativeEffects, [], "Native IPC must not broadcast/warm a superseded receipt.");

        let releasePublication;
        let publicationStarted;
        const publicationBegan = new Promise((resolve) => { publicationStarted = resolve; });
        const publicationGate = new Promise((resolve) => { releasePublication = resolve; });
        let publicationEffects = 0;
        authority = { ...selected("first"), providerId: host };
        const asynchronousPublication = createWorkspaceActiveDatasetDelivery({
            getSessionScope: () => "scope",
            getAuthoritativeSnapshot: () => authority,
            readActiveDataset: async () => authority,
            requestActiveDataset: async () => authority,
            publish: async () => { publicationStarted(); await publicationGate; },
            selected: () => { publicationEffects += 1; }
        });
        const publishing = asynchronousPublication.select("first");
        await publicationBegan;
        authority = { ...selected("second"), providerId: host };
        releasePublication();
        assert.equal(await publishing, null);
        assert.equal(publicationEffects, 0, "Recheck authority after async notification publication.");

        let scope = "first-session";
        const pending = [];
        const published = [];
        const accepted = [];
        const controller = createWorkspaceActiveDatasetDelivery({
            getSessionScope: () => scope,
            requestActiveDataset: () => new Promise((resolve) => { pending.push(resolve); }),
            readActiveDataset: async () => ({ status: "none", objectName: "", providerId: host }),
            publish: (snapshot) => { published.push(snapshot); },
            selected: (snapshot) => { accepted.push(snapshot.objectName); }
        });

        const older = controller.select("older");
        const newer = controller.select("newer");
        assert.deepEqual(published, [], "Do not publish requested names before acceptance.");
        pending[1](selected("accepted-newer"));
        assert.deepEqual(await newer, selected("accepted-newer"));
        pending[0](selected("older"));
        assert.equal(await older, null);
        assert.deepEqual(accepted, ["accepted-newer"], "Publish the accepted name, not the requested one.");

        const restarted = controller.select("old-runtime");
        scope = "replacement-session";
        pending[2](selected("old-runtime"));
        assert.equal(await restarted, null);
        assert.equal(published.length, 1);

        const rejected = controller.select("not-a-table");
        pending[3]({ status: "invalid", objectName: "not-a-table", providerId: host });
        assert.equal((await rejected).status, "invalid");
        assert.deepEqual(accepted, ["accepted-newer"], "Rejected names must not trigger selected-only effects.");

        const removed = controller.select("removed");
        await controller.refresh();
        pending[4](selected("removed"));
        assert.equal(await removed, null, "Authoritative refresh supersedes an old selection reply.");
        assert.equal(published.at(-1).status, "none");

        const clearing = controller.clear();
        pending[5]({ status: "none", objectName: "", providerId: host });
        assert.equal((await clearing).status, "none");
        assert.deepEqual(accepted, ["accepted-newer"], "Clear must not trigger selected effects.");

        const workspaceScope = { providerId: host, status: "ready",
            workspaceRevision: { session: "worker", sequence: 2 } };
        let resolveStopped;
        const stoppedPublication = [];
        const stopping = createWorkspaceActiveDatasetDelivery({
            getSessionScope: () => readWorkspaceActiveDatasetScope(workspaceScope),
            requestActiveDataset: () => new Promise((resolve) => { resolveStopped = resolve; }),
            readActiveDataset: async () => selected("data"),
            publish: (snapshot) => { stoppedPublication.push(snapshot); }
        });
        const lateSelection = stopping.select("data");
        workspaceScope.status = "unavailable";
        resolveStopped(selected("data"));
        assert.equal(await lateSelection, null, "Shutdown with a retained receipt must reject late publication.");
        assert.deepEqual(stoppedPublication, []);

        const failed = createWorkspaceActiveDatasetDelivery({
            getSessionScope: () => scope,
            requestActiveDataset: async () => { throw new Error("delivery failed"); },
            readActiveDataset: async () => selected("recovered"),
            publish: (snapshot) => { published.push(snapshot); }
        });
        await assert.rejects(failed.select("failed"), /delivery failed/);
        assert.equal((await failed.refresh()).objectName, "recovered");

        const workspaceState = createRuntimeWorkspaceState(host);
        workspaceState.remember([{ name: "data", kind: "table", capabilities: ["tabular.read"] }]);
        const runtimeSelection = createRuntimeActiveDatasetController({
            workspaceState,
            getSnapshot: () => ({ providerId: host, status: "ready" }),
            recordRuntimeEvent() {}
        });
        assert.equal(runtimeSelection.setActiveDataset("data").status, "selected");
        assert.equal(runtimeSelection.setActiveDataset("").status, "none");
        assert.equal(runtimeSelection.getActiveDataset().objectName, "");
        assert.equal(runtimeSelection.setActiveDataset("data").status, "selected");

        let activeName = "data";
        let releaseChannel;
        const channelGate = new Promise((resolve) => { releaseChannel = resolve; });
        const channel = createWorkspaceChannelAdapter({
            getDataEditorDatasetName: () => "data",
            setDataEditorDatasetName() {},
            getActiveDatasetName: () => activeName,
            setActiveDataset: async function(name) { await channelGate; activeName = name; },
            clearActiveDataset: async function() { await channelGate; activeName = ""; }
        });
        let returned = false;
        const setting = channel.setActiveDataset({ name: "accepted" }, []).then((name) => {
            returned = true;
            return name;
        });
        await Promise.resolve();
        assert.equal(returned, false, "Channel reply waits for acceptance.");
        releaseChannel();
        assert.equal(await setting, "accepted");
        assert.equal(await channel.clearActiveDataset(), "");

        const handlers = new Map();
        const sent = [];
        createDatasetEditorIpcController({
            translate: (key) => key,
            ipcMain: { handle: (name, callback) => handlers.set(name, callback), on() {} },
            runtimeSessionManager: {
                getActiveDataset: runtimeSelection.getActiveDataset,
                setActiveDataset: async (name) => runtimeSelection.setActiveDataset(name)
            },
            getDatasetEditorState: () => ({ objectName: "data" }),
            setDatasetEditorState() {},
            sendActiveDataset: (snapshot) => { sent.push(snapshot); },
            warmInitialDatasetPreview() {}, warmInitialVariableMetadata() {}
        });
        assert.equal(await handlers.get(datasetEditorIpcChannels.setActiveDataset)({}, { name: "data" }), "data");
        assert.equal(await handlers.get(datasetEditorIpcChannels.clearActiveDataset)(), "");
        assert.equal(sent.at(-1).status, "none");
    }

    const nativePublished = [];
    const nativeDetails = [];
    global.window = {
        dialogForge: {
            setActiveDataset: async () => ({ status: "invalid", objectName: "rejected", providerId: "r" }),
            getActiveDataset: async () => ({ status: "none", objectName: "", providerId: "r" })
        }
    };
    const native = createMainWorkspaceController({
        getSessionScope: () => "native-session",
        renderActiveDataset: (snapshot) => { nativePublished.push(snapshot); },
        readDatasetDetails: (name) => { nativeDetails.push(name); },
        refreshRuntimeEvents() {}
    });
    await native.setActiveDataset("rejected");
    assert.equal(nativePublished[0].status, "invalid");
    assert.deepEqual(nativeDetails, []);
    delete global.window;

    const browserSource = fs.readFileSync(path.join(__dirname, "../src/shell-web/pages/shell.js"), "utf8");
    assert.ok(browserSource.includes("createWorkspaceActiveDatasetDelivery({"));
    assert.ok(!browserSource.includes('applyActiveWorkspaceDatasetName(datasetNames[0] || "")'),
        "Browser must read common runtime fallback instead of choosing independently.");
    assert.ok(!browserSource.includes("setActiveDataset(result.datasetName)"),
        "Launch dataset requests must not bypass acceptance to paint the requested name.");
    assert.equal((browserSource.match(/clearActiveDataset: clearActiveWorkspaceDataset/g) || []).length, 2,
        "Both browser channel and external-call clears use accepted runtime delivery.");
    console.log("Shared active-dataset delivery cases passed; rendered native/browser selection remains acceptance.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
