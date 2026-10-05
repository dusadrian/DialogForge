"use strict";

const assert = require("node:assert/strict");
const { createWorkspaceRuntimeEventController } = require("../dist/src/base-app/features/workspace-pane/workspaceRuntimeEventController");

let snapshot = {
    status: "ready", providerId: "r", objects: [{ name: "probe", kind: "table" }],
    workspaceRevision: { session: "current", sequence: 4 }
};
let renders = 0;
const selections = [];
const controller = createWorkspaceRuntimeEventController({
    getWorkspaceSnapshot: () => snapshot,
    getRuntimeProviderId: () => "r",
    renderWorkspace(value) { snapshot = value; renders += 1; },
    async setActiveDataset(name) { selections.push(name); }
});
const event = (sequence, session = "current", extra = {}) => ({
    type: "workspace.update", providerId: "r", createdAt: String(sequence),
    payload: {
        added: [{ name: "old_table", kind: "table" }], updated: [], removed: ["probe"],
        workspaceRevision: { session, sequence }, ...extra
    }
});
const replay = (events) => controller.applySnapshot({ status: "ready", providerId: "r", events });

replay([event(3), event(4), event(999, "retired"), event(5, "current", { workspaceRevision: undefined })]);
assert.equal(renders, 0, "Old, duplicate, foreign and unversioned history must preserve a versioned pane");
assert.deepEqual(selections, []);
replay([event(5)]);
assert.equal(renders, 1);
assert.deepEqual(snapshot.workspaceRevision, { session: "current", sequence: 5 });
assert.deepEqual(selections, ["old_table"]);

for (let sequence = 6; sequence < 170; sequence += 1) {
    replay([event(sequence, "current", { added: [], removed: [] })]);
}
const beforeReplay = renders;
replay([event(5)]);
assert.equal(renders, beforeReplay, "Receipt checks survive dedupe-key eviction");
snapshot = { ...snapshot, status: "uncertain" };
replay([event(170)]);
assert.equal(renders, beforeReplay, "History cannot make an uncertain baseline ready");
snapshot = null;
replay([event(171)]);
assert.equal(renders, beforeReplay, "A delta cannot establish a new session baseline");
snapshot = { status: "ready", providerId: "r", objects: [], workspaceRevision: { session: "replacement", sequence: 1 } };
replay([event(172)]);
assert.equal(renders, beforeReplay);
replay([event(2, "replacement", { workspaceRevision: { session: "replacement", sequence: "bad" } })]);
assert.equal(renders, beforeReplay, "Malformed receipts must not become legacy events");

snapshot = { status: "ready", providerId: "legacy", objects: [] };
replay([{ ...event(200, "legacy", { workspaceRevision: undefined }), providerId: "legacy" }]);
assert.equal(renders, beforeReplay + 1, "Unversioned providers keep their existing event path");
console.log("Renderer history: stale/duplicate/foreign/malformed receipts, missing/uncertain baselines, dedupe eviction and legacy events passed.");
