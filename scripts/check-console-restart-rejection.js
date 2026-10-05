"use strict";

const assert = require("node:assert/strict");
const {
    createConsoleToolbarController
} = require("../dist/src/console/renderer/consoleToolbarController");
const { createUnavailableWorkspaceSnapshot } = require("../dist/src/runtime/workspace/workspaceProtocol");
const { normalizeWorkspaceSnapshot } = require("../dist/src/base-app/features/workspace-pane/workspacePane");


const createToolbarDocument = function() {
    const elements = new Map();
    return {
        body: { classList: { toggle() {} } },
        getElementById(id) {
            if (!elements.has(id)) {
                elements.set(id, {
                    setAttribute() {}, removeAttribute() {}, replaceChildren() {}
                });
            }
            return elements.get(id);
        }
    };
};


const main = async function() {
    for (const providerId of ["r", "webr"]) {
        const effects = [];
        const rejection = new Error("Workspace persistence is occupied.");
        let returnedSnapshot = null;
        let currentStatus = "ready";
        let rejectedStatus = "ready";
        let replacementReady = false;
        let busy = false;
        let busyListener;
        let sessionListener;
        const retiredListeners = [];
        const document = createToolbarDocument();
        const baseline = {
            providerId, status: "ready", freshness: "fresh",
            workspaceRevision: { session: `${providerId}-workspace`, sequence: 3 },
            objects: [{ name: "kept", kind: "data.frame", detail: "3 x 1", hasViewer: true }]
        };
        let workspace = baseline;
        const controller = createConsoleToolbarController({
            document,
            getRuntimeSession: () => ({ providerId, status: currentStatus }),
            isRuntimeBusy: () => busy,
            onDidRuntimeBusy(listener) {
                busyListener = listener;
                return () => { retiredListeners.push("busy"); };
            },
            onDidSessionPhase(listener) {
                sessionListener = listener;
                return () => { retiredListeners.push("session"); };
            },
            getWorkingDirectoryPath: () => "",
            getHomeDirectoryPath: () => "",
            getActiveDatasetName: () => "kept",
            getProductStateChips: () => [],
            translate: (key) => key,
            setWorkingDirectoryPaths() {},
            readWorkingDirectory: async () => ({}),
            clearTranscriptEvents() { effects.push("clear-events"); },
            clearTranscriptIdentity() { effects.push("clear-identity"); },
            clearConsoleSurface() { effects.push("clear-surface"); },
            retireRuntimeExecution() { effects.push("retire"); },
            renderTranscript() { effects.push("render"); },
            setInputText() { effects.push("replace-input"); },
            focusInput() {},
            restartRuntime: async function() {
                if (returnedSnapshot) {
                    return returnedSnapshot;
                }
                currentStatus = rejectedStatus;
                throw rejection;
            },
            appendRestartMessage: async function(action, phase, message) {
                effects.push({ action, phase, message });
                if (phase === "failed" && replacementReady) {
                    currentStatus = "ready";
                }
            },
            revealRestartFailure() { effects.push("reveal-failure"); },
            getWorkspaceSnapshot: () => workspace,
            applyUnavailableWorkspace(snapshot) {
                workspace = snapshot;
                effects.push("workspace-unavailable");
            },
            applyRuntimeSession(snapshot) {
                currentStatus = snapshot.status;
                effects.push("apply-session");
            },
            refreshRuntimeEvents() { effects.push("refresh-events"); },
            refreshPrompts() { effects.push("refresh-prompts"); },
            refreshWorkspace: async function() { effects.push("refresh-workspace"); }
        });

        await controller.restartRestoreWorkspace();
        assert.deepEqual(effects, [
            { action: "restore", phase: "starting", message: undefined },
            { action: "restore", phase: "failed", message: rejection.message }
        ], `${providerId}: rejection must retain transcript identities, input and session`);
        for (const status of ["failed", "starting", "stopped"]) {
            effects.length = 0;
            returnedSnapshot = {
                providerId,
                status,
                message: "Startup failed.",
                workspaceRestored: false,
                workspaceRestoreMessage: "Recovery data retained at /fixture.RData."
            };
            await controller.restartRestoreWorkspace();
            const expected = [
                { action: "restore", phase: "starting", message: undefined },
                "clear-identity",
                "apply-session",
                { action: "restore", phase: "failed", message: returnedSnapshot.workspaceRestoreMessage }
            ];
            if (status !== "starting") {
                expected.push("workspace-unavailable", "reveal-failure");
                assert.equal(workspace.freshness, "unavailable");
                assert.deepEqual(workspace.objects, baseline.objects, "Keep the recovery baseline, not live rows.");
                assert.deepEqual(workspace.workspaceRevision, baseline.workspaceRevision);
                assert.equal(normalizeWorkspaceSnapshot(workspace).variables.length, 0);
                assert.equal(document.getElementById("consoleActiveDataset").hidden, true);
            }
            assert.deepEqual(effects, expected,
                `${providerId}/${status}: report recovery without runtime queries or completed restart`);
        }
        returnedSnapshot = null;
        for (const status of ["failed", "stopped", "not-started", "starting", "ready"]) {
            effects.length = 0;
            rejectedStatus = status;
            await controller.restartRestoreWorkspace();
            const expected = [
                { action: "restore", phase: "starting", message: undefined },
                { action: "restore", phase: "failed", message: rejection.message }
            ];
            if (status !== "starting" && status !== "ready") {
                expected.push("workspace-unavailable", "reveal-failure");
            }
            assert.deepEqual(effects, expected,
                `${providerId}/${status}: reveal startup failure, not an active or replacement session`);
        }
        effects.length = 0;
        rejectedStatus = "failed";
        replacementReady = true;
        await controller.restartRestoreWorkspace();
        assert.equal(effects.includes("reveal-failure"), false,
            `${providerId}: failure delivery must not alter a replacement ready session`);
        assert.equal(effects.includes("workspace-unavailable"), false,
            `${providerId}: failure delivery must not alter replacement workspace presentation`);
        for (const freshness of ["fresh", "stale", "pending"]) {
            assert.equal(normalizeWorkspaceSnapshot({ ...baseline, freshness }).variables.length, 1,
                "Synchronization does not make a live runtime's last baseline disappear.");
        }
        const changedProvider = createUnavailableWorkspaceSnapshot(
            { providerId: "replacement", status: "failed" }, baseline
        );
        assert.deepEqual(changedProvider.objects, []);
        assert.equal(changedProvider.workspaceRevision, undefined);
        assert.equal(baseline.status, "ready");
        assert.equal(baseline.objects.length, 1, "Presentation cannot mutate the saved baseline.");
        currentStatus = "ready";
        busy = true;
        busyListener(busy);
        assert.equal(document.getElementById("consoleToolbarStop").disabled, false,
            "Both hosts refresh the same toolbar when execution becomes busy.");
        busy = false;
        busyListener(busy);
        assert.equal(document.getElementById("consoleToolbarStop").disabled, true);
        currentStatus = "starting";
        sessionListener("starting");
        assert.equal(document.getElementById("consoleToolbarRestart").disabled, true);
        controller.dispose();
        assert.deepEqual(retiredListeners, ["busy", "session"]);
    }
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
