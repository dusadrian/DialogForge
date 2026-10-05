"use strict";

// Real native R and production host handler; only Electron's registration and
// outbound window delivery are captured. No user profile or workspace is loaded.
const assert = require("node:assert/strict");
const path = require("node:path");
const { createRuntimeProvider } = require("../dist/src/runtime/providers/r/runtimeProvider");
const { createRuntimeSessionManager } = require("../dist/src/runtime/session/runtimeSessionManager");
const { createRuntimeSessionIpcController } = require("../dist/src/shell-electron/runtime/runtimeSessionIpcController");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");
const { workspaceIpcChannels } = require("../dist/src/core/ipc/workspaceIpc");

const main = async function() {
    const rootDir = path.resolve(__dirname, "..");
    const manager = createRuntimeSessionManager(createRuntimeProvider({
        rootDir,
        processLifecycle: true
    }), { rootDir });
    const handlers = new Map();
    const delivered = [];
    const active = [];
    const warnings = [];
    const invalidated = [];
    const execute = async function(text) {
        const result = await manager.executeVisibleCommandWithEffects(
            createVisibleCommandRequest({ text, source: "rename-runtime-acceptance" })
        );
        const errors = result.transcriptEvents.filter((event) => {
            return event.type === "failed" || event.type === "rejected"
                || event.state === "error";
        });
        assert.deepEqual(errors, [], "The setup/check command must succeed in real R");
        assert.ok(result.transcriptEvents.some((event) => event.type === "completed"));
        return result;
    };
    const names = (snapshot) => snapshot.objects.map((object) => object.name).sort();

    createRuntimeSessionIpcController({
        ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } },
        runtimeSessionManager: manager,
        setRuntimeSessionSnapshot() {},
        sendRuntimeSession() {},
        executeVisibleCommand: manager.executeVisibleCommand,
        captureWorkspaceBaseline: async function() {},
        refreshWorkspaceAndBroadcast: manager.listWorkspaceObjects,
        broadcastRuntimeEvents: async function() {},
        invalidateInitialDatasetPreview(name) { invalidated.push(name); },
        sendTranscriptEvents(events) { warnings.push(...events); },
        sendWorkspaceSnapshot(snapshot) { delivered.push(snapshot); },
        sendActiveDataset(snapshot) { active.push(snapshot); },
        warmInitialDatasetPreview() {},
        warmInitialVariableMetadata() {}
    });
    const rename = (oldName, newName) => handlers.get(workspaceIpcChannels.renameObject)(
        {}, { oldName, newName, source: "rename-runtime-acceptance" }
    );

    try {
        const started = await manager.start();
        assert.equal(started.status, "ready", started.message);
        await execute("rename_source <- data.frame(value = c(11, 22)); occupied <- 99");
        const before = await manager.listWorkspaceObjects();
        await manager.setActiveDataset("rename_source");

        const renamed = await rename("rename_source", "rename_target");
        assert.equal(renamed.status, "ready");
        assert.deepEqual(names(renamed), ["occupied", "rename_target"]);
        assert.deepEqual(delivered.at(-1), renamed, "Host receives the returned snapshot");
        assert.deepEqual(names(manager.getWorkspaceSnapshot()), names(renamed));
        assert.equal(renamed.workspaceRevision.session, before.workspaceRevision.session);
        assert.ok(renamed.workspaceRevision.sequence > before.workspaceRevision.sequence);
        assert.equal(manager.getActiveDataset().objectName, "rename_target");
        assert.equal(active.at(-1).objectName, "rename_target");
        assert.equal(invalidated.at(-1), "rename_source");
        await execute("stopifnot(!exists('rename_source'), identical(rename_target$value, c(11, 22)))");
        assert.deepEqual(names(manager.getWorkspaceSnapshot()), names(renamed));

        const conflict = await rename("rename_target", "occupied");
        assert.equal(conflict.status, "conflict");
        assert.deepEqual(names(conflict), names(renamed));
        await execute("stopifnot(identical(occupied, 99), identical(rename_target$value, c(11, 22)))");
        const missing = await rename("missing_source", "unused_target");
        assert.equal(missing.status, "not-found");
        const unchanged = await rename("rename_target", "rename_target");
        assert.equal(unchanged.status, "ready");
        assert.deepEqual(names(unchanged), names(renamed));
        assert.equal(warnings.length, 0);

        await execute([
            "rename_attempts <- 0L",
            "local({",
            "rt <- environment(as.environment('DialogApp')$runtime_workspace_change_for_code)",
            "original <- rt$runtime_workspace_rename",
            "rt$runtime_workspace_rename <- function(params) {",
            "rt$runtime_workspace_rename <- original",
            "rename_attempts <<- rename_attempts + 1L",
            "original(params)",
            "stop('synthetic post-rename response failure')",
            "}",
            "})"
        ].join("\n"));
        const baseline = manager.getWorkspaceSnapshot();
        const uncertain = await rename("rename_target", "rename_recovered");
        assert.equal(uncertain.status, "uncertain");
        assert.deepEqual(names(uncertain), names(baseline));
        assert.deepEqual(delivered.at(-1), uncertain);
        assert.equal(warnings.length, 1);
        assert.equal(warnings[0].streamName, "warning");
        assert.match(warnings[0].message, /could not be confirmed/);

        await execute([
            "stopifnot(rename_attempts == 1L,",
            "!exists('rename_target'),",
            "identical(rename_recovered$value, c(11, 22)))"
        ].join("\n"));
        const recovered = manager.getWorkspaceSnapshot();
        assert.equal(recovered.status, "ready");
        assert.deepEqual(names(recovered), ["occupied", "rename_attempts", "rename_recovered"]);
        assert.ok(recovered.workspaceRevision.sequence > baseline.workspaceRevision.sequence);

        const edits = await manager.writeCells([
            { objectName: "rename_recovered", rowIndex: 0, columnName: "value", value: 33 },
            { objectName: "rename_recovered", rowIndex: 1, columnName: "value", value: 44 }
        ]);
        assert.equal(edits.updated, 2);
        assert.equal(edits.failed, 0);
        assert.ok(manager.getWorkspaceSnapshot().workspaceRevision.sequence > recovered.workspaceRevision.sequence);
        await execute("stopifnot(identical(rename_recovered$value, c(33, 44)))");
        console.log("Real native R cell batch: both edits committed, R values verified and workspace revision advanced.");

        console.log("Real R Rename: host delivery, active dataset, receipts, rejection cases, uncertain outcome and single-attempt recovery passed.");
    }
    finally {
        await manager.stop();
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
