"use strict";

const assert = require("node:assert/strict");
const { createWorkspaceRuntimeEventController } = require("../dist/src/base-app/features/workspace-pane/workspaceRuntimeEventController");
const { createWorkspaceUpdate, applyWorkspaceUpdateToObjects } = require("../dist/src/runtime/workspace/workspaceUpdate");
const { isWorkspaceDatasetCandidate, readLatestAddedWorkspaceDataset } = require("../dist/src/runtime/workspace/workspaceDatasetSelection");
const fs = require("node:fs");
const path = require("node:path");

for (const sourcePath of [
    "src/base-app/features/workspace-pane/workspaceRuntimeEventController.ts",
    "src/shell-web/pages/shell.js"
]) {
    assert.ok(fs.readFileSync(path.join(__dirname, "..", sourcePath), "utf8")
        .includes("readLatestAddedWorkspaceDataset("),
    "Both presentation hosts must use the same surviving-addition selection owner.");
}

for (const candidate of [
    { kind: "table" }, { kind: "data.frame" }, { kind: "tibble" },
    { kind: "custom", capabilities: ["tabular.read"] },
    { display_type: "table" }, { type_info: "data.frame" }
]) {
    assert.equal(isWorkspaceDatasetCandidate(candidate), true);
}
for (const candidate of [null, false, "table", {}, { kind: "numeric" },
    { kind: "function", capabilities: [] }]) {
    assert.equal(isWorkspaceDatasetCandidate(candidate), false);
}
assert.equal(readLatestAddedWorkspaceDataset([
    { name: "a", kind: "table" }, { name: "b", kind: "table" },
    { name: "retyped", kind: "numeric" }
], ["b", "a", "removed", "retyped"]), "a",
"Use supplied addition order, but only select surviving datasets.");
assert.equal(readLatestAddedWorkspaceDataset([{ name: "a", kind: "table" }], []), "",
"No additions must not invent a new selection.");
assert.equal(readLatestAddedWorkspaceDataset([], ["removed"]), "");

for (const providerId of ["r", "webr"]) {
    let snapshot = {
        status: "ready", providerId, objects: [],
        workspaceRevision: { session: "current", sequence: 1 }
    };
    const selected = [];
    const controller = createWorkspaceRuntimeEventController({
        getWorkspaceSnapshot: () => snapshot,
        getRuntimeProviderId: () => providerId,
        renderWorkspace: (value) => { snapshot = value; },
        setActiveDataset: async (name) => { selected.push(name); }
    });
    const apply = function(sequence, fields) {
        const payload = {
            added: [], updated: [], removed: [], ...fields,
            workspaceRevision: { session: "current", sequence }
        };
        const expected = applyWorkspaceUpdateToObjects(
            snapshot.objects, createWorkspaceUpdate(payload)
        );
        controller.applySnapshot({
            status: "ready", providerId,
            events: [{ type: "workspace.update", providerId,
                createdAt: String(sequence), payload }]
        });
        assert.deepEqual(snapshot.objects, expected, providerId);
    };

    apply(2, { added: [{
        name: "data", kind: "table", hasViewer: true,
        dataframe: { rowCount: 2, colnames: ["x"], numeric: [true] },
        provenance: { source: "fixture" }
    }] });
    assert.deepEqual(snapshot.objects[0].columns, ["x"]);
    assert.equal(snapshot.objects[0].columnEntries[0].numeric, true);
    assert.equal(snapshot.objects[0].provenance.source, "fixture");
    assert.ok(snapshot.objects[0].capabilities.includes("tabular.read"));

    apply(3, { updated: [{ name: "data", kind: "table", detail: "changed" }] });
    assert.deepEqual(snapshot.objects[0].columns, ["x"]);
    apply(4, { updated: [{ name: "data", kind: "numeric", columns: [] }] });
    assert.deepEqual(snapshot.objects[0].columns, []);
    assert.deepEqual(snapshot.objects[0].capabilities, []);

    const before = selected.slice();
    apply(5, { added: [{ name: "removed", kind: "table" }], removed: ["removed"] });
    apply(6, { added: [{ name: "retyped", kind: "table" }],
        updated: [{ name: "retyped", kind: "numeric" }] });
    assert.deepEqual(selected, before, "Removed/retyped additions must not be selected");
}

console.log("Shared workspace event projection cases passed.");
