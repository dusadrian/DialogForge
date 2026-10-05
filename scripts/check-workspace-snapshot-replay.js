"use strict";

const assert = require("node:assert/strict");
const { createMainWorkspacePaneCoordinator } = require("../dist/src/base-app/features/workspace-pane/mainWorkspacePaneCoordinator");

let current = null;
const completions = [];
const coordinator = createMainWorkspacePaneCoordinator({
    getWorkspaceSnapshot: () => current,
    setWorkspaceSnapshot: (snapshot) => { current = snapshot; },
    ingestCompletionNames: (names) => completions.push(names)
});
const snapshot = (name, sequence, session = "first", status = "ready") => ({
    status, providerId: "r", objects: [{ name, kind: "number", capabilities: [] }],
    workspaceRevision: { session, sequence }
});

coordinator.renderWorkspace(snapshot("current", 4));
coordinator.renderWorkspace(snapshot("old", 3));
coordinator.renderWorkspace(snapshot("duplicate", 4));
assert.equal(current.objects[0].name, "current", "Old and duplicate full snapshots cannot replace current rows");
assert.equal(completions.length, 1, "Rejected snapshots cannot feed completion names");
coordinator.renderWorkspace(snapshot("current", 4, "first", "uncertain"));
assert.equal(current.status, "uncertain", "Same-revision failure must still mark the pane stale");
coordinator.renderWorkspace(snapshot("false recovery", 4));
assert.equal(current.status, "uncertain", "Same receipt cannot clear a later uncertainty");
coordinator.renderWorkspace(snapshot("recovered", 5));
assert.equal(current.status, "ready");
assert.equal(current.objects[0].name, "recovered");
coordinator.renderWorkspace({ status: "unavailable", providerId: "r", objects: [] });
assert.equal(current.status, "unavailable");
assert.deepEqual(current.workspaceRevision, { session: "first", sequence: 5 });
assert.equal(current.objects[0].name, "recovered", "Unversioned lifecycle status preserves the last baseline");
coordinator.renderWorkspace({ status: "ready", providerId: "r", objects: [] });
assert.equal(current.status, "unavailable", "Unversioned snapshots cannot erase a versioned baseline");
coordinator.renderWorkspace(snapshot("replacement", 1, "second"));
coordinator.renderWorkspace(snapshot("retired", 999, "first"));
assert.equal(current.objects[0].name, "replacement", "Retired session cannot replace its successor");
assert.deepEqual(completions.at(-1), ["replacement"]);
const acceptedWorkspace = current;
const acceptedCompletionCount = completions.length;
coordinator.refreshTranslations();
assert.equal(current, acceptedWorkspace,
    "Refreshing labels must not accept or replace a workspace snapshot.");
assert.equal(completions.length, acceptedCompletionCount,
    "Refreshing labels must not feed completion names again.");
console.log("Full snapshot replay: older/duplicate/retired snapshots suppressed, completion names protected, uncertainty retained until newer recovery.");
