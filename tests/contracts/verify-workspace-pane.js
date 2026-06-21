"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { workspacePaneApi } = require("../../shared/base-app/features/workspace-pane/workspacePane");
const rootDir = process.cwd();
const sourceText = fs.readFileSync(path.join(rootDir, "shared/base-app/features/workspace-pane/workspacePane.ts"), "utf8");
const snapshot = workspacePaneApi.normalizeWorkspaceSnapshot({
    status: "ready",
    providerId: "r",
    objects: [
        {
            name: "mtcars",
            kind: "table",
            detail: "32 x 11",
            hasViewer: true,
            provenance: null,
            capabilities: ["tabular.read", "workspace.remove"]
        },
        {
            name: ".hidden",
            kind: "number",
            detail: "42",
            hasViewer: false,
            provenance: null,
            capabilities: []
        },
        {
            name: "scores",
            kind: "number",
            detail: "1, 2, 3",
            hasViewer: false,
            provenance: null,
            capabilities: ["workspace.remove"]
        },
        {
            name: "model",
            kind: "function",
            detail: "function",
            hasViewer: false,
            provenance: null,
            capabilities: []
        }
    ],
    message: "3 objects",
    refreshedAt: "2026-06-05T00:00:00.000Z"
});
assert.strictEqual(snapshot.objectCount, 3);
assert.deepStrictEqual(snapshot.variables.map((variable) => variable.access_key), [
    "mtcars",
    "scores",
    "model"
]);
const groups = workspacePaneApi.buildWorkspaceGroups(snapshot.variables, new Map());
const byId = new Map(groups.map((group) => {
    return [group.id, group];
}));
assert.strictEqual(byId.get("datasets").items[0].access_key, "mtcars");
assert.strictEqual(byId.get("vectors").items[0].access_key, "scores");
assert.strictEqual(byId.get("functions").items[0].access_key, "model");
assert.strictEqual(workspacePaneApi.formatWorkspaceLead(byId.get("datasets").items[0]), "mtcars");
assert.strictEqual(workspacePaneApi.formatWorkspaceSummary(byId.get("datasets").items[0]), "[32 rows x 11 columns]");
assert.strictEqual(workspacePaneApi.formatWorkspaceLead(byId.get("vectors").items[0]), "scores: 1, 2, 3");
assert.strictEqual(workspacePaneApi.formatWorkspaceSummary(byId.get("functions").items[0]), "fn");
[
    "const isVisibleWorkspaceName = function",
    "!name.startsWith(\".\")",
    "workspace-broom-icon",
    "dataset.workspaceContextAction = \"make-active\"",
    "container.addEventListener(\"contextmenu\"",
    "options.onMakeActiveDataset?.(item)",
    "container.addEventListener(\"dblclick\"",
    "options.onOpenVariable?.(item)",
    "options.onInsertVariable?.(name)",
    "dataset.workspaceDelete",
    "document.addEventListener(\"click\"",
    "document.addEventListener(\"keydown\"",
    "event.key === \"Escape\""
].forEach((expected) => {
    assert.ok(sourceText.includes(expected), "workspace pane must preserve DialogR interaction behavior: " + expected);
});
console.log("Workspace pane contract verified.");
