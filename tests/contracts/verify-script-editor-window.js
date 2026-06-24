"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const rootDir = process.cwd();
const readTypeScriptTree = (directoryPath) => {
    return fs.readdirSync(directoryPath, { withFileTypes: true })
        .map((entry) => {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            return readTypeScriptTree(entryPath);
        }
        if (entry.isFile() && entry.name.endsWith(".ts")) {
            return fs.readFileSync(entryPath, "utf8");
        }
        return "";
    })
        .join("\n");
};
const pagePath = path.join(rootDir, "shared/base-app/pages/scriptEditor.html");
const distPagePath = path.join(rootDir, "dist/shared/base-app/pages/scriptEditor.html");
const mainPagePath = path.join(rootDir, "shared/base-app/pages/main.html");
const preloadPath = path.join(rootDir, "shared/base-app/bootstrap/preload.ts");
const hostBridgePath = path.join(rootDir, "shared/base-app/bootstrap/dialogForgeHostBridge.ts");
const globalsPath = path.join(rootDir, "shared/base-app/bootstrap/dialogForgeGlobals.d.ts");
const electronMainPath = path.join(rootDir, "scripts/electron-main.js");
const page = fs.readFileSync(pagePath, "utf8");
const mainPage = fs.readFileSync(mainPagePath, "utf8");
const preload = fs.readFileSync(preloadPath, "utf8");
const hostBridge = fs.readFileSync(hostBridgePath, "utf8");
const globals = fs.readFileSync(globalsPath, "utf8");
const scriptEditorIpc = fs.readFileSync(path.join(rootDir, "shared/script-editor/scriptEditorIpc.ts"), "utf8");
const renderer = [
    readTypeScriptTree(path.join(rootDir, "shared/script-editor/renderer")),
    scriptEditorIpc
].join("\n");
const mainRenderer = readTypeScriptTree(path.join(rootDir, "shared/base-app/features"));
const mainProcess = [
    fs.readFileSync(electronMainPath, "utf8"),
    readTypeScriptTree(path.join(rootDir, "shared/script-editor/main-process")),
    scriptEditorIpc
].join("\n");
assert.ok(page.includes("id=\"root\"") &&
    page.includes("scriptEditorInterface.js"), "script editor page must bootstrap the modular renderer");
[
    ".dm-script-toolbar",
    ".dm-script-tabs",
    ".dm-script-pathbar",
    ".dm-script-breadcrumbs",
    ".dm-script-crumb-popup",
    ".dm-script-outline-popup"
].forEach((marker) => {
    assert.ok(page.includes(marker), "script editor page must preserve DialogR styling marker: " + marker);
});
[
    "createScriptEditorShell",
    "createScriptToolbarView",
    "\"codicon-folder-opened\"",
    "\"codicon-symbol-function\"",
    "\"codicon-question\"",
    "\"codicon-save\"",
    "\"codicon-save-as\"",
    "createScriptEditorWorkspaceView",
    "options.monaco.editor.create",
    "ensureConsoleSyntaxReady",
    "CONSOLE_THEME_NAME",
    "createScriptEditorTabController",
    "sessionStorageKey = \"app.scriptEditor.tabs.v1\"",
    "localStorage.getItem(sessionStorageKey)",
    "createScriptBreadcrumbView",
    "createScriptOutlineController",
    "parseRFunctionOutline",
    "buildContextualHelpRequest",
    "monaco.KeyCode.F1",
    "monaco.KeyCode.KeyN",
    "monaco.KeyCode.KeyO",
    "monaco.KeyCode.KeyS",
    "\"base-app:checkScriptFragment\"",
    "\"base-app:runScriptCodeBatch\"",
    "monaco.editor.setModelMarkers",
    "bindScriptFileDropHandling",
    "bindGlobalScriptFileDropGuard",
    "createDroppedScriptFilePlan",
    "event.dataTransfer.dropEffect = \"copy\"",
    "createScriptEditorCloseCoordinator",
    "resolveDirtyScriptTabsForClose",
    "\"base-app:script-editor-close-save-result\""
].forEach((marker) => {
    assert.ok(renderer.includes(marker), "script editor renderer must preserve behavior marker: " + marker);
});
assert.ok(!mainPage.includes("id=\"scriptEditorPanel\""), "main page must not include the embedded script editor panel");
[
    "options.dialogForge.openScriptEditor()",
    "const openScriptFile = window.dialogForge.openScriptFileInEditor;",
    "const openScriptFilePath = window.dialogForge.openScriptFilePathInEditor;"
].forEach((marker) => {
    assert.ok(mainRenderer.includes(marker), "main renderer must route scripts to the separate editor: " + marker);
});
[
    "getScriptEditorDocument: function()",
    "openScriptEditor: function()",
    "insertScriptEditorCode: function(input",
    "checkScriptFragment: function(input",
    "runScriptCodeBatch: function(input",
    "openScriptFileInEditor: function()",
    "openScriptFilePathInEditor: function(filePath:",
    "listScriptDirectory: function(input",
    "updateScriptEditorDirtyState: function(input",
    "confirmScriptEditorSave: function(input",
    "sendScriptEditorCloseSaveResult: function(input",
    "onScriptEditorOpenFile: function(callback)",
    "onScriptEditorRequestSaveForClose: function(callback)"
].forEach((marker) => {
    assert.ok(preload.includes(marker), "preload must expose script editor bridge marker: " + marker);
});
[
    "getDroppedFilePaths: function(files",
    "webUtils.getPathForFile"
].forEach((marker) => {
    assert.ok(hostBridge.includes(marker), "host bridge must expose dropped-file path marker: " + marker);
});
[
    "getScriptEditorDocument()",
    "openScriptEditor()",
    "insertScriptEditorCode(input:",
    "checkScriptFragment(input:",
    "runScriptCodeBatch(input:",
    "openScriptFileInEditor()",
    "openScriptFilePathInEditor(filePath:",
    "listScriptDirectory(input:",
    "getDroppedFilePaths(files:",
    "updateScriptEditorDirtyState(input:",
    "confirmScriptEditorSave(input:",
    "sendScriptEditorCloseSaveResult(input:",
    "onScriptEditorOpenFile(callback:",
    "onScriptEditorRequestSaveForClose(callback:"
].forEach((marker) => {
    assert.ok(globals.includes(marker), "global types must expose script editor bridge marker: " + marker);
});
[
    "createScriptEditorWindowController",
    "shared/base-app/pages/scriptEditor.html",
    "\"base-app:openScriptEditor\"",
    "\"base-app:insertScriptEditorCode\"",
    "\"base-app:checkScriptFragment\"",
    "\"base-app:runScriptCodeBatch\"",
    "method: \"check_completeness\"",
    "\"base-app:openScriptFileInEditor\"",
    "\"base-app:openScriptFilePathInEditor\"",
    "\"base-app:listScriptDirectory\"",
    "\"base-app:updateScriptEditorDirtyState\"",
    "\"base-app:script-editor-request-save-for-close\"",
    "\"base-app:script-editor-close-save-result\"",
    "buttons: [\"Save\", \"Don't Save\", \"Cancel\"]"
].forEach((marker) => {
    assert.ok(mainProcess.includes(marker), "main process must preserve script editor behavior marker: " + marker);
});
assert.ok(fs.existsSync(distPagePath), "build output must include scriptEditor.html");
console.log("Script editor window contract verified.");
