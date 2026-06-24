"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const rootDir = process.cwd();
const pagePath = path.join(rootDir, "shared/base-app/pages/devDiagnostics.html");
const distPagePath = path.join(rootDir, "dist/shared/base-app/pages/devDiagnostics.html");
const preloadPath = path.join(rootDir, "shared/base-app/bootstrap/preload.ts");
const mainPath = path.join(rootDir, "scripts/electron-main.js");
const devDiagnosticsWindowPath = path.join(
    rootDir,
    "shared/shell-electron/windows/devDiagnosticsWindowController.ts"
);
const externalCompositionPath = path.join(
    rootDir,
    "shared/shell-electron/external/externalWindowComposition.ts"
);
const rendererPath = path.join(rootDir, "shared/base-app/features/main-window/mainCompositionRoot.ts");
const shellIpcPath = path.join(rootDir, "shared/shell-electron/windows/shellApplicationIpcController.ts");
const shellRoutesPath = path.join(rootDir, "shared/shell-electron/windows/shellWindowIpc.ts");
const menuPath = path.join(rootDir, "shared/base-app/menu/base-menu.json");
const page = fs.readFileSync(pagePath, "utf8");
const preload = fs.readFileSync(preloadPath, "utf8");
const main = [
    fs.readFileSync(mainPath, "utf8"),
    fs.readFileSync(devDiagnosticsWindowPath, "utf8"),
    fs.readFileSync(externalCompositionPath, "utf8"),
    fs.readFileSync(shellIpcPath, "utf8"),
    fs.readFileSync(shellRoutesPath, "utf8")
].join("\n");
const renderer = fs.readFileSync(rendererPath, "utf8");
const menu = fs.readFileSync(menuPath, "utf8");
[
    "runtimeSession",
    "runtimeEvents",
    "runtimePrompts",
    "workspace",
    "settings",
    "composition"
].forEach((elementId) => {
    assert.ok(page.includes(`id="${elementId}"`), "diagnostics page must include " + elementId);
});
assert.ok(preload.includes("openDevDiagnostics: function()"), "preload must expose openDevDiagnostics");
assert.ok(main.includes("createDevDiagnosticsWindow"), "main process must create diagnostics window");
assert.ok(main.includes("shared/base-app/pages/devDiagnostics.html"), "main process must load diagnostics page");
assert.ok(main.includes('openDevDiagnostics: "base-app:openDevDiagnostics"'), "main process must expose diagnostics IPC");
assert.ok(renderer.includes("window.dialogForge.openDevDiagnostics()"), "renderer must expose diagnostics shortcut");
assert.ok(renderer.includes("openDeveloperDiagnostics"), "renderer must route diagnostics menu command");
assert.ok(menu.includes("\"command\": \"app.openDevDiagnostics\""), "base menu must expose diagnostics command");
assert.ok(menu.includes("\"accelerator\": \"CmdOrCtrl+Alt+D\""), "base menu must expose diagnostics shortcut");
assert.ok(fs.existsSync(distPagePath), "build output must include devDiagnostics.html");
console.log("Developer diagnostics page contract verified.");
