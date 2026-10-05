"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { presentWorkspaceActiveDataset, createWorkspaceActiveDatasetPresenter } = require("../dist/src/base-app/features/workspace-pane/workspaceActiveDatasetPresentation");
const { createRuntimeWorkspaceState } = require("../dist/src/runtime/session/runtimeWorkspaceState");
const { createWorkspaceActiveDatasetDelivery } = require("../dist/src/runtime/workspace/workspaceActiveDatasetDelivery");
const { createMainWorkspacePaneCoordinator } = require("../dist/src/base-app/features/workspace-pane/mainWorkspacePaneCoordinator");

for (const host of ["r", "webr"]) {
    const state = createRuntimeWorkspaceState(host);
    const initial = state.getActiveDataset();
    state.selectKnown(host, "first");
    const first = state.getActiveDataset();
    state.selectKnown(host, "second");
    const second = state.getActiveDataset();
    assert.equal(first.selectionRevision.owner, second.selectionRevision.owner);
    assert.ok(initial.selectionRevision.sequence < first.selectionRevision.sequence);
    assert.ok(first.selectionRevision.sequence < second.selectionRevision.sequence);
    const copied = state.getActiveDataset();
    copied.selectionRevision.sequence = 9999;
    assert.deepEqual(state.getActiveDataset(), second, "Receipts must not alias runtime state.");

    const published = [];
    let authoritativeOwner = state.getActiveDataset().selectionRevision.owner;
    const present = createWorkspaceActiveDatasetPresenter({
        getAuthoritativeOwner: () => authoritativeOwner
    });
    const bindings = {
        remember: (value) => published.push(value),
        renderActiveName() {},
        renderToolbar() {}
    };
    assert.equal(present(second, bindings), true);
    assert.equal(present(first, bindings), false, "Delayed broadcasts cannot restore older selection.");
    assert.equal(present(second, bindings), false, "Duplicate delivery cannot repeat effects.");
    assert.equal(present({ status: "none", providerId: host }, bindings), false);
    state.invalidate();
    const restarted = state.getActiveDataset();
    assert.equal(restarted.objectName, "second", "Keep restart restoration intent.");
    assert.ok(restarted.selectionRevision.sequence > second.selectionRevision.sequence);
    assert.equal(present(restarted, bindings), true);
    assert.equal(present(second, bindings), false);

    const replacement = createRuntimeWorkspaceState(host).getActiveDataset();
    assert.notEqual(replacement.selectionRevision.owner, restarted.selectionRevision.owner);
    assert.equal(present(replacement, bindings), false, "Unconfirmed owners cannot replace the baseline.");
    authoritativeOwner = replacement.selectionRevision.owner;
    assert.equal(present(replacement, bindings), true);
    assert.equal(present(restarted, bindings), false, "Never return to a retired owner.");
    assert.equal(present({ ...replacement, selectionRevision: { owner: "bad", sequence: NaN } }, bindings), false);
    assert.equal(published.length, 3);

    const pinned = createWorkspaceActiveDatasetPresenter();
    assert.equal(pinned(second, bindings), true);
    assert.equal(pinned(replacement, bindings), false,
        "A stable manager owner cannot be replaced by an unfamiliar broadcast.");

    for (const status of ["selected", "none", "invalid", "unavailable"]) {
        const snapshot = { status, providerId: host, objectName: "data" };
        const calls = [];
        presentWorkspaceActiveDataset(snapshot, {
            remember: (value) => calls.push(["remember", value]),
            renderActiveName: (name) => calls.push(["name", name]),
            renderToolbar: () => calls.push(["toolbar"]),
            updated: (value, name) => calls.push(["updated", value, name])
        });
        const expectedName = status === "selected" ? "data" : "";
        assert.deepEqual(calls, [
            ["remember", snapshot], ["name", expectedName], ["toolbar"],
            ["updated", snapshot, expectedName]
        ]);
    }
}

const remembered = [];
let toolbarUpdates = 0;
const native = createMainWorkspacePaneCoordinator({
    getWorkspaceSnapshot: () => null,
    setActiveDatasetSnapshot: (snapshot) => remembered.push(snapshot),
    renderConsoleToolbar: () => { toolbarUpdates += 1; }
});
native.renderActiveDataset({ status: "invalid", objectName: "not-selected", providerId: "r" });
assert.equal(remembered[0].status, "invalid");
assert.equal(toolbarUpdates, 1);

for (const file of [
    "src/base-app/features/workspace-pane/mainWorkspacePaneCoordinator.ts",
    "src/shell-web/pages/shell.js"
]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.ok(source.includes("createWorkspaceActiveDatasetPresenter(")
        && source.includes("presentActiveDataset(snapshot, {"),
        "Both hosts must use the same active snapshot presentation source.");
}

const checkRejectedPublication = async function() {
    let selectedEffects = 0;
    const delivery = createWorkspaceActiveDatasetDelivery({
        getSessionScope: () => "runtime",
        readActiveDataset: async () => ({ status: "none" }),
        requestActiveDataset: async () => ({ status: "selected", objectName: "old" }),
        publish: () => false,
        selected: () => { selectedEffects += 1; }
    });
    assert.equal(await delivery.select("old"), null);
    assert.equal(selectedEffects, 0, "Rejected publication must not trigger selected-only effects.");
};
checkRejectedPublication().then(() => {
    console.log("Shared active snapshot presentation cases passed; rendered badge/toolbar acceptance remains open.");
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
