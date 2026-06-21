"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_process_1 = __importDefault(require("node:process"));
const verifierGroups = {
    "engine-contract": [
        "verify:architecture-boundaries",
        "verify:settings-storage",
        "verify:runtime-session-ipc",
        "verify:runtime-command-ipc",
        "verify:tabular-ipc",
        "verify:workspace-ipc",
        "verify:runtime-lifecycle-controller",
        "verify:runtime-restart-controller",
        "verify:runtime-command-controller",
        "verify:runtime-extension-controller",
        "verify:process-tree",
        "verify:process-lifecycle-controller",
        "verify:runtime-quit-controller",
        "verify:workspace-mutations",
        "verify:r-readonly-adapter",
        "verify:r-runtime-launch-plan",
        "verify:r-runtime-source-bundle",
        "verify:r-process-lifecycle",
        "verify:r-visible-command",
        "verify:r-workspace-runtime-control",
        "verify:package-install-workflow",
        "verify:packaging-policy",
        "verify:product-contribution-registry",
        "verify:python-readonly-adapter",
        "verify:verifier-groups",
        "verify:renderer-scripts",
        "verify:shared-assets",
        "verify:shared-dialog-sources",
        "verify:console-history-persistence",
        "verify:workspace-pane",
        "verify:runtime-panels",
        "verify:external-url",
        "verify:plot-viewer-state",
        "verify:plot-viewer-page",
        "verify:help-window-page",
        "verify:script-editor-window",
        "verify:dataset-editor-window",
        "verify:dev-diagnostics-page",
        "verify:electron-main-runtime-refresh",
        "verify:composition-panels",
        "verify:feature-entrypoint-commands",
        "verify:startup-prompt-panel",
        "verify:dialog-source-renderer",
        "verify:dataset-editor-state",
        "verify:copy-payload",
        "verify:clipboard-result",
        "verify:paste-payload",
        "verify:paste-mapping",
        "verify:clipboard-commands",
        "verify:keyboard-commands",
        "verify:command-router",
        "verify:structural-commands",
        "verify:metadata-commands",
        "verify:edit-commands",
        "verify:selection-controls",
        "verify:selection-highlights",
        "verify:selection-diagnostics",
        "verify:table-descriptors",
        "verify:context-menu-actions",
        "verify:open-file-result",
        "verify:script-file-result",
        "verify:import-format",
        "verify:import-plan",
        "verify:import-preview",
        "verify:import-panel"
    ]
};
const runVerifierGroup = function (groupName) {
    const scripts = verifierGroups[groupName];
    if (!scripts) {
        throw new Error("Unknown verifier group: "
            + JSON.stringify(groupName));
    }
    const npmCommand = node_process_1.default.platform === "win32" ? "npm.cmd" : "npm";
    scripts.forEach((script) => {
        const result = (0, node_child_process_1.spawnSync)(npmCommand, ["run", script], {
            cwd: node_process_1.default.cwd(),
            env: node_process_1.default.env,
            stdio: "inherit"
        });
        if (result.error) {
            throw result.error;
        }
        if (result.status !== 0) {
            node_process_1.default.exit(result.status ?? 1);
        }
    });
};
if (require.main === module) {
    runVerifierGroup(String(node_process_1.default.argv[2] || ""));
}
module.exports = {
    verifierGroups,
    runVerifierGroup
};
