"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const rootDir = process.cwd();
const pagePath = path.join(rootDir, "shared/base-app/pages/help.html");
const distPagePath = path.join(rootDir, "dist/shared/base-app/pages/help.html");
const preloadPath = path.join(rootDir, "shared/base-app/bootstrap/preload.ts");
const mainPath = path.join(rootDir, "build/scripts/electron-main.ts");
const helpIpcPath = path.join(rootDir, "shared/runtime/help/helpIpcController.ts");
const helpRoutesPath = path.join(rootDir, "shared/runtime/help/helpIpc.ts");
const helpWindowPath = path.join(rootDir, "shared/shell-electron/external/helpWindowController.ts");
const externalCompositionPath = path.join(rootDir, "shared/shell-electron/external/externalWindowComposition.ts");
const rendererPath = path.join(rootDir, "shared/console/renderer/mainConsoleCoordinator.ts");
const globalsPath = path.join(rootDir, "shared/base-app/bootstrap/dialogForgeGlobals.d.ts");
const page = fs.readFileSync(pagePath, "utf8");
const preload = fs.readFileSync(preloadPath, "utf8");
const main = fs.readFileSync(mainPath, "utf8");
const helpIpc = fs.readFileSync(helpIpcPath, "utf8");
const helpRoutes = fs.readFileSync(helpRoutesPath, "utf8");
const helpWindow = fs.readFileSync(helpWindowPath, "utf8");
const renderer = fs.readFileSync(rendererPath, "utf8");
const globals = fs.readFileSync(globalsPath, "utf8");
const mainProcess = [
    main,
    helpIpc,
    helpRoutes,
    helpWindow,
    fs.readFileSync(externalCompositionPath, "utf8")
].join("\n");
assert.ok(page.includes("id=\"helpFrame\""), "help page must include a body host");
assert.ok(page.includes("app-help-navigate"), "help page must classify and route R help links");
assert.ok(page.includes("window.dialogForge?.openHelpCommandUrl"), "help page must route app help command URLs through preload");
assert.ok(page.includes("font-family:\"Dialog Mono\""), "help page must preserve R code typography");
assert.ok(preload.includes("openHelpTopic: function(input:"), "preload must expose openHelpTopic");
assert.ok(preload.includes("getHelpDocument: function()"), "preload must expose getHelpDocument");
assert.ok(preload.includes("openHelpCommandUrl: function(url:"), "preload must expose help command URL routing");
assert.ok(preload.includes("runHelpExample: function(input:"), "preload must expose help example routing");
assert.ok(globals.includes("openHelpTopic(input:"), "global types must expose openHelpTopic");
assert.ok(globals.includes("getHelpDocument()"), "global types must expose getHelpDocument");
assert.ok(globals.includes("openHelpCommandUrl(url:"), "global types must expose help command URL routing");
assert.ok(globals.includes("runHelpExample(input:"), "global types must expose help example routing");
assert.ok(helpWindow.includes("let win: BrowserWindow | null = null;"), "main process must own a help window");
assert.ok(mainProcess.includes("createHelpWindowController"), "main process must create a help window");
assert.ok(mainProcess.includes("buildHelpChooserDocument"), "main process must render multiple/search help results in the help window");
assert.ok(mainProcess.includes("base-app:openHelpTopic"), "main process must handle openHelpTopic");
assert.ok(mainProcess.includes("base-app:getHelpDocument"), "main process must expose help document state");
assert.ok(mainProcess.includes("base-app:openHelpCommandUrl"), "main process must handle help command URLs");
assert.ok(mainProcess.includes("base-app:runHelpExample"), "main process must handle help example execution");
assert.ok(mainProcess.includes("shared/base-app/pages/help.html"), "main process must load help.html");
assert.ok(renderer.includes("bindings.openHelpTopic"), "renderer help action must open the help window");
assert.ok(fs.existsSync(distPagePath), "build output must include help.html");
console.log("Help window page contract verified.");
