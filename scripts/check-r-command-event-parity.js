"use strict";
const assert = require("node:assert/strict");
const { createBrowserWebRSession } = require("../dist/src/runtime/providers/webr/webRBrowserSession");
const { createRRuntimeEventController } = require("../dist/src/runtime/providers/r/controllers/rRuntimeEventController");

const main = async function() {
    for (const providerId of ["r", "webr"]) {
        const controller = createRRuntimeEventController();
        const snapshot = { providerId, status: "ready", lifecycleGeneration: 1 };
        for (let index = 0; index < 45; index++) {
            controller.recordRuntimeControlEvents([
                { type: "execution_phase", parent_id: "command-" + index, phase: "running" }
            ], snapshot);
        }
        const log = await controller.listRuntimeEvents(snapshot);
        assert.equal(log.length, 40);
        assert.equal(log[0].payload.activityId, "command-44");
        assert.equal(log.at(-1).payload.activityId, "command-5");
        log.length = 0;
        assert.equal((await controller.listRuntimeEvents(snapshot)).length, 40);
        assert.deepEqual(await controller.listRuntimeEvents({ ...snapshot, lifecycleGeneration: 2 }), []);
        assert.deepEqual(await controller.listRuntimeEvents({ ...snapshot, providerId: "other" }), []);
        controller.recordRuntimeControlEvents([
            { type: "execution_phase", parent_id: "fresh", phase: "evaluated", outcome: "error" }
        ], { ...snapshot, lifecycleGeneration: 2 });
        const fresh = await controller.listRuntimeEvents({ ...snapshot, lifecycleGeneration: 2 });
        assert.equal(fresh.length, 1);
        assert.equal(fresh[0].payload.outcome, "error");
        controller.recordRuntimeControlEvents([{ type: "workspace_update", update: {
            added: [], updated: [], removed: [], objectCount: 0,
            workspaceRevision: { session: "events", sequence: 1 },
            datasets: { added: [], removed: [], changed: [], copied: [] }
        } }], { ...snapshot, lifecycleGeneration: 2 });
        assert.equal((await controller.listRuntimeEvents({ ...snapshot, lifecycleGeneration: 2 })).length, 1,
            "Workspace updates stay with their existing manager receipt owner.");
    }
    const client = {
        execute: async request => ({
            id: request.id, method: request.method, ok: true,
            events: [
                { type: "execution_phase", parent_id: request.params.parentId, phase: "running" },
                { type: "execution_phase", parent_id: request.params.parentId, phase: "evaluated", outcome: "success" },
                { type: "completion", parent_id: request.params.parentId, state: "idle",
                    workspaceReconciliation: "unchanged", workspaceObjectCount: 0,
                    workspaceRevision: { session: "phase-parity", sequence: 1 } }
            ]
        }),
        detach() {}
    };
    let current = true;
    const session = createBrowserWebRSession({
        isCurrentSession: () => current,
        runtimeControlClient: client,
        visibleCommands: { readConsoleOutputWidth: () => 80, recordTranscriptEvents() {} },
        workspaceChanged() {}
    });
    const runtime = session.runtimeSessionManager;
    try {
        await runtime.start();
        const result = await session.executeVisibleCommand("1", { activityId: "phase-command" });
        assert.equal(result.ok, true);
        const log = await runtime.listRuntimeEvents();
        const phases = log.events.filter(event => event.type === "command.execution");
        assert.deepEqual(phases.map(event => event.payload.phase), ["evaluated", "running"],
            "WebR must retain the same execution-phase diagnostics as native R.");
        assert.ok(phases.every(event => event.lifecycleGeneration === runtime.getSnapshot().lifecycleGeneration));
        let release;
        let lateRequest;
        client.execute = async request => {
            lateRequest = request;
            return new Promise(resolve => { release = resolve; });
        };
        const pending = session.executeVisibleCommand("late", { activityId: "retired-phase" });
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(release, "The old request must be admitted before retirement.");
        current = false;
        release({ id: lateRequest.id, method: lateRequest.method, ok: true, events: [
            { type: "execution_phase", parent_id: "retired-phase", phase: "evaluated", outcome: "success" }
        ] });
        assert.equal((await pending).ok, false);
        const retiredLog = await runtime.listRuntimeEvents();
        assert.ok(!retiredLog.events.some(event => event.payload.activityId === "retired-phase"),
            "A late successful old-client reply cannot add current diagnostics.");
    } finally {
        await runtime.stop();
    }
    console.log("Shared R command event diagnostics preserve phase order and lifetime.");
};
main().catch(error => { console.error(error); process.exitCode = 1; });
