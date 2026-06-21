"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { getRunnableStartupTasks, shouldRefreshWorkspaceAfterStartupTask } = require("../../shared/base-app/features/runtime-panels/startupPromptPanel");
assert.deepStrictEqual(getRunnableStartupTasks([
    {
        id: "ready",
        enabled: true
    },
    {
        id: "disabled",
        enabled: false
    },
    {
        id: "also-ready",
        enabled: true
    }
]).map((task) => {
    return task.id;
}), ["ready", "also-ready"]);
assert.strictEqual(shouldRefreshWorkspaceAfterStartupTask({
    id: "workspace",
    enabled: true,
    requiredRuntime: ["workspace.objects"]
}, {
    status: "ready"
}), true);
assert.strictEqual(shouldRefreshWorkspaceAfterStartupTask({
    id: "packages",
    enabled: true,
    requiredRuntime: ["dependencies.packages"]
}, {
    status: "ready"
}), false);
assert.strictEqual(shouldRefreshWorkspaceAfterStartupTask({
    id: "workspace",
    enabled: true,
    requiredRuntime: ["workspace.objects"]
}, {
    status: "partial"
}), false);
console.log("Startup prompt panel helpers verified.");
