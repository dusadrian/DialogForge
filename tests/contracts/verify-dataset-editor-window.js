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
const pagePath = path.join(rootDir, "shared/base-app/pages/datasetEditor.html");
const distPagePath = path.join(rootDir, "dist/shared/base-app/pages/datasetEditor.html");
const interfacePath = path.join(rootDir, "shared/base-app/modules/datasetEditorInterface.ts");
const clientPath = path.join(rootDir, "shared/base-app/modules/datasetViewerClient.ts");
const electronMainPath = path.join(rootDir, "build/scripts/electron-main.ts");
const runtimeBroadcastBridgePath = path.join(
    rootDir,
    "shared/shell-electron/runtime/runtimeBroadcastBridge.ts"
);
const workspacePanePath = path.join(rootDir, "shared/base-app/features/workspace-pane/workspacePane.ts");
const page = fs.readFileSync(pagePath, "utf8");
const distPage = fs.existsSync(distPagePath) ? fs.readFileSync(distPagePath, "utf8") : "";
const renderer = [
    fs.readFileSync(interfacePath, "utf8"),
    readTypeScriptTree(path.join(rootDir, "shared/dataset-editor"))
].join("\n");
const client = fs.readFileSync(clientPath, "utf8");
const electronMain = [
    fs.readFileSync(electronMainPath, "utf8"),
    fs.readFileSync(runtimeBroadcastBridgePath, "utf8"),
    readTypeScriptTree(path.join(rootDir, "shared/dataset-editor/main-process"))
].join("\n");
const workspacePane = fs.readFileSync(workspacePanePath, "utf8");
assert.ok(page.includes("id=\"datasetEditorDatasetSelect\""), "dataset editor must keep DialogR dataset selector");
assert.ok(page.includes("id=\"datasetEditorHeaderMenu\""), "dataset editor must keep DialogR header context menu");
assert.ok(page.includes("id=\"datasetEditorRowMenu\""), "dataset editor must keep DialogR row context menu");
assert.ok(page.includes("id=\"datasetEditorVariableRowMenu\""), "dataset editor must keep DialogR variable-row context menu");
assert.ok(page.includes("id=\"datasetEditorCellMenu\""), "dataset editor must keep DialogR cell context menu");
assert.ok(page.includes("id=\"datasetEditorPanelData\""), "dataset editor must keep DialogR Data panel id");
assert.ok(page.includes("id=\"datasetEditorPanelVariables\""), "dataset editor must keep DialogR Variables panel id");
assert.ok(page.includes("id=\"datasetEditorDataScroll\""), "dataset editor must keep DialogR data viewport");
assert.ok(page.includes("id=\"datasetEditorVariablesScroll\""), "dataset editor must keep DialogR variables viewport");
assert.ok(page.includes("id=\"datasetValueLabelsModal\""), "dataset editor must keep DialogR value-label modal");
assert.ok(page.indexOf("class=\"dataset-editor__body\"") < page.indexOf("class=\"dataset-editor__footer\""), "dataset editor tabs must stay below editor panels");
assert.ok(page.includes("path.join(process.cwd(), 'dist', 'shared', 'base-app', 'modules', 'datasetEditorInterface.js')"), "dataset editor must load DialogForge's compiled DialogR parity renderer");
assert.ok(page.includes("dist', 'shared', 'base-app', 'modules', 'datasetEditorInterface.js"), "dataset editor packaged loader must target DialogForge renderer path");
assert.ok(page.includes("font-family: 'Inter'"), "dataset editor must preserve DialogR Inter font styling");
assert.ok(page.includes("--de-bg: #f2f2f2;"), "dataset editor must preserve DialogR background token");
assert.ok(page.includes("--de-line: #7b7f85;"), "dataset editor must preserve DialogR grid line token");
assert.ok(page.includes("background-color: rgba(110, 110, 110, 0.35);"), "dataset editor loading cover must preserve DialogR backdrop");
assert.ok(page.includes("box-shadow: 0 10px 28px rgba(32, 42, 56, 0.18);"), "dataset editor loading label must preserve DialogR shadow");
assert.ok(!page.includes("Dialog Mono"), "dataset editor must not use console monospace font");
assert.ok(renderer.includes("DATASET_EDITOR_ROW_HEIGHT = 26;"), "renderer must preserve DialogR virtualized row geometry");
assert.ok(renderer.includes("INITIAL_DATA_ROW_COUNT = 40;"), "renderer must preserve DialogR initial data row count");
assert.ok(renderer.includes("INITIAL_DATA_MINIMUM_COLUMNS = 16;") &&
    renderer.includes("INITIAL_DATA_MAXIMUM_COLUMNS = 32;"), "renderer must preserve the approved warmed first-screen column sizing");
assert.ok(renderer.includes("const loadDatasetWindow = viewportReloadController.loadWindow;"), "renderer must preserve DialogR lazy viewport loader");
assert.ok(renderer.includes("datasetViewerClient.getContent"), "renderer must load data through DialogR dataset viewer client");
assert.ok(renderer.includes("datasetViewerClient.getVariablesBatch"), "renderer must preserve DialogR batched variable metadata loading");
assert.ok(renderer.includes("datasetViewerClient.getFilterMask"), "renderer must preserve DialogR filter-mask integration point");
assert.ok(renderer.includes("datasetViewerClient.updateCell"), "renderer must preserve DialogR cell edit path");
assert.ok(renderer.includes("datasetViewerClient.updateVariable"), "renderer must preserve DialogR variable edit path");
assert.ok(renderer.includes("Sortable.create"), "renderer must preserve DialogR value-label row reordering hook");
assert.ok(renderer.includes('init: "datasetEditor:init"'), "renderer must preserve DialogR init event");
assert.ok(renderer.includes('applyChanges: "datasetEditor:applyChanges"'), "renderer must preserve DialogR runtime change event");
[
    ["getSchema", "datasetViewer:getSchema"],
    ["getContent", "datasetViewer:getContent"],
    ["getFilterMask", "datasetViewer:getFilterMask"],
    ["getVariables", "datasetViewer:getVariables"],
    ["getVariablesBatch", "datasetViewer:getVariablesBatch"],
    ["updateCell", "datasetViewer:updateCell"],
    ["updateColumnName", "datasetViewer:updateColumnName"],
    ["updateRowName", "datasetViewer:updateRowName"],
    ["insertRow", "datasetViewer:insertRow"],
    ["removeRow", "datasetViewer:removeRow"],
    ["insertColumn", "datasetViewer:insertColumn"],
    ["removeColumn", "datasetViewer:removeColumn"],
    ["sortRows", "datasetViewer:sortRows"],
    ["updateVariable", "datasetViewer:updateVariable"]
].forEach(([routeName, channel]) => {
    assert.ok(electronMain.includes(`datasetEditorIpcChannels.${routeName}`), `main process must handle ${channel}`);
});
assert.ok(electronMain.includes("nodeIntegration: true"), "dataset editor window must allow the DialogR renderer module loader");
assert.ok(electronMain.includes("contextIsolation: false"), "dataset editor window must run the DialogR renderer module in page context");
assert.ok(electronMain.includes("datasetEditorEventChannels.init"), "main process must send DialogR dataset editor init event");
assert.ok(electronMain.includes("datasetEditorEventChannels.setDatasetList"), "main process must keep DialogR dataset selector synchronized");
assert.ok(electronMain.includes("datasetEditorEventChannels.applyChanges"), "main process must forward runtime changes to DialogR renderer");
assert.ok(workspacePane.includes("container.addEventListener(\"dblclick\""), "workspace pane must keep double-click dataset opening");
assert.ok(distPage === "" ||
    distPage.includes("dist', 'shared', 'base-app', 'modules', 'datasetEditorInterface.js"), "built dataset editor must load DialogForge renderer path");
console.log("Dataset editor window contract verified.");
