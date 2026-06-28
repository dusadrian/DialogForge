"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
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
const pagePath = path.join(distDir, "shared/base-app/pages/main.html");
const sourcePagePath = path.join(rootDir, "shared/base-app/pages/main.html");
const sourceMainPath = path.join(rootDir, "shared/base-app/pages/main.ts");
const sourceMainCompositionPath = path.join(rootDir, "shared/base-app/features/main-window/mainCompositionRoot.ts");
const sourceTerminalInputPath = path.join(rootDir, "shared/console/views/terminalEditorInputView.ts");
const sourceCompletionContextPath = path.join(rootDir, "shared/console/terminal/completionContext.ts");
const sourceConsoleSurfacePath = path.join(rootDir, "shared/console/renderer/consoleSurface.ts");
const sourceConsoleCoordinatorPath = path.join(rootDir, "shared/console/renderer/mainConsoleCoordinator.ts");
const sourceConsoleFlowViewPath = path.join(rootDir, "shared/console/views/consoleFlowView.ts");
const sourceConsoleTranscriptIslandPath = path.join(rootDir, "shared/console/views/consoleTranscriptIsland.ts");
const sourceConsoleToolbarPath = path.join(rootDir, "shared/console/renderer/consoleToolbarView.ts");
const sourceAboutWindowFactoryPath = path.join(rootDir, "shared/shell-electron/external/aboutWindowFactory.ts");
const sourceApplicationSupportWindowsPath = path.join(rootDir, "shared/shell-electron/windows/applicationSupportWindowComposition.ts");
const sourceConsoleEditorCommandPath = path.join(rootDir, "shared/console/terminal/consoleEditorCommandController.ts");
const sourceConsoleInputStatePath = path.join(rootDir, "shared/console/terminal/consoleEditorInputStateController.ts");
const sourceConsolePresentationPath = path.join(rootDir, "shared/console/terminal/consoleEditorPresentationController.ts");
const sourceAppCodiconPath = path.join(rootDir, "shared/base-app/pages/shared/appCodicon.css");
const sourceVscodeCodiconPath = path.join(rootDir, "shared/base-app/pages/shared/vscodeCodicon.css");
const preloadPath = path.join(rootDir, "shared/base-app/bootstrap/preload.ts");
const electronMainPath = path.join(rootDir, "scripts/electron-main.js");
const shellApplicationIpcPath = path.join(rootDir, "shared/shell-electron/windows/shellApplicationIpcController.ts");
const workspaceIpcPath = path.join(rootDir, "shared/core/ipc/workspaceIpc.ts");
const globalsPath = path.join(rootDir, "shared/base-app/bootstrap/dialogForgeGlobals.d.ts");
const html = fs.readFileSync(pagePath, "utf8");
const sourceHtml = fs.readFileSync(sourcePagePath, "utf8");
const sourceMain = fs.readFileSync(sourceMainPath, "utf8");
const sourceMainComposition = fs.readFileSync(sourceMainCompositionPath, "utf8");
const sourceDatasetInteraction = fs.readFileSync(path.join(
    rootDir,
    "shared/base-app/features/main-window/mainDatasetInteractionServices.ts"
), "utf8");
const sourceDatasetCommands = fs.readFileSync(path.join(
    rootDir,
    "shared/base-app/features/main-window/mainDatasetCommandServices.ts"
), "utf8");
const sourceTerminalInput = fs.readFileSync(sourceTerminalInputPath, "utf8");
const sourceCompletionContext = fs.readFileSync(sourceCompletionContextPath, "utf8");
const sourceConsoleSurface = fs.readFileSync(sourceConsoleSurfacePath, "utf8");
const sourceConsoleCoordinator = fs.readFileSync(sourceConsoleCoordinatorPath, "utf8");
const sourceConsoleFlowView = fs.readFileSync(sourceConsoleFlowViewPath, "utf8");
const sourceConsoleTranscriptIsland = fs.readFileSync(sourceConsoleTranscriptIslandPath, "utf8");
const sourceConsoleToolbar = fs.readFileSync(sourceConsoleToolbarPath, "utf8");
const sourceAboutWindowFactory = fs.readFileSync(sourceAboutWindowFactoryPath, "utf8");
const sourceApplicationSupportWindows = fs.readFileSync(sourceApplicationSupportWindowsPath, "utf8");
const sourceConsoleEditorCommand = fs.readFileSync(sourceConsoleEditorCommandPath, "utf8");
const sourceConsoleInputState = fs.readFileSync(sourceConsoleInputStatePath, "utf8");
const sourceConsolePresentation = fs.readFileSync(sourceConsolePresentationPath, "utf8");
const sourceAppCodicon = fs.readFileSync(sourceAppCodiconPath, "utf8");
const sourceVscodeCodicon = fs.readFileSync(sourceVscodeCodiconPath, "utf8");
const preloadScript = fs.readFileSync(preloadPath, "utf8");
const electronMainScript = fs.readFileSync(electronMainPath, "utf8");
const shellApplicationIpcScript = fs.readFileSync(shellApplicationIpcPath, "utf8");
const workspaceIpcScript = fs.readFileSync(workspaceIpcPath, "utf8");
const typeScript = fs.readFileSync(globalsPath, "utf8");
const mainScript = fs.readFileSync(path.resolve(path.dirname(pagePath), "./main.js"), "utf8");
const rendererSource = [
    sourceMain,
    readTypeScriptTree(path.join(rootDir, "shared/base-app/features")),
    readTypeScriptTree(path.join(rootDir, "shared/dataset-editor")),
    readTypeScriptTree(path.join(rootDir, "shared/console")),
    readTypeScriptTree(path.join(rootDir, "shared/runtime/providers/r/files"))
].join("\n");
const mainProcessSource = [
    electronMainScript,
    readTypeScriptTree(path.join(rootDir, "shared/runtime")),
    readTypeScriptTree(path.join(rootDir, "shared/shell-electron"))
].join("\n");
const workspacePaneScript = fs.readFileSync(path.resolve(path.dirname(pagePath), "../features/workspace-pane/workspacePane.js"), "utf8");
assert.ok(sourceHtml.includes("require(candidate);"), "main page must load its CommonJS renderer entry point");
assert.ok(!sourceHtml.includes("browserRequireShim"), "main page must not use the browser require shim");
assert.ok(!sourceMain.includes("window.dialogForgeDatasetEditorState"), "main renderer must import feature modules directly");
assert.ok(sourceDatasetCommands.includes("toggleTab: options.toggleDatasetEditorPane"), "main renderer must handle the dataset.toggleTab command route");
assert.ok(sourceDatasetInteraction.includes("toggleDatasetEditorPane"), "main renderer must expose the compact data/variables pane toggle");
assert.ok(sourceDatasetInteraction.includes("const layoutController") &&
    sourceDatasetInteraction.includes("getState: options.getState") &&
    sourceDatasetInteraction.includes("renderPreview: function(preview)"), "main renderer must pass dataset editor layout state into table rendering");
assert.ok(sourceDatasetInteraction.includes("syncColumnOrder: layoutController.syncColumnOrder"), "main renderer must synchronize dataset column order from tabular previews");
assert.ok(sourceCompletionContext.includes("mode: \"path\"") &&
    sourceCompletionContext.includes("replaceText: stringContent"), "main renderer completion model must expose DialogR-style path completion context");
assert.ok(sourceConsoleEditorCommand.includes("context.mode === \"path\"") &&
    sourceConsoleEditorCommand.includes("getRuntimeCompletionSuggestions?.(") &&
    sourceConsoleEditorCommand.includes("items.length === 1") &&
    sourceConsoleEditorCommand.includes("dm.pathCompletion"), "console input must apply a single runtime filename completion on first Tab");
assert.ok(sourceConsoleSurface.includes('from "../views/terminalEditorInputView"') &&
    preloadScript.includes("openHelpTopic") &&
    sourceConsoleInputState.includes("buildContextualHelpRequest") &&
    sourceConsoleEditorCommand.includes("KeyCode.F1") &&
    sourceTerminalInput.includes("showHelpTopic?:") &&
    sourceConsoleCoordinator.includes("source: \"base-app.console-help\""), "console input must preserve DialogR F1 contextual help through the shared help window");
assert.ok(preloadScript.includes("const onAppEvent = function<Channel extends ApplicationEventChannel>") &&
    preloadScript.includes("const invokeDatasetEditor = function<") &&
    preloadScript.includes("const invokeScriptEditor = function<") &&
    preloadScript.includes("const sendScriptEditor = function<"), "preload must keep owner-typed local IPC wrappers instead of repeating raw transport plumbing");
assert.ok(sourceConsoleToolbar.includes("formatConsoleWorkingDirectory") &&
    sourceConsoleToolbar.includes("return \"~\"") &&
    sourceConsoleToolbar.includes("return \"~/\" + normalized.slice(home.length + 1)") &&
    shellApplicationIpcScript.includes("home: os.homedir()"), "main renderer must display home-relative working directories with DialogR-style ~ shortening");
assert.ok(sourceMainComposition.includes("consoleToolbar.refreshWorkingDirectory") &&
    sourceConsoleToolbar.includes("homeDirectory"), "built main renderer must preserve working-directory ~ shortening for production");
const datasetTablesScript = fs.readFileSync(path.resolve(path.dirname(pagePath), "../features/dataset-editor/datasetTables.js"), "utf8");
[
    "dataPreviewHeaderTools",
    "callbacks.moveColumn",
    "callbacks.resizeColumn"
].forEach((expected) => {
    assert.ok(datasetTablesScript.includes(expected), "dataset table renderer must expose header layout affordance: " + expected);
});
[
    "applyDatasetViewportControls",
    "shiftDatasetViewport",
    "applySelectedColumnWidth",
    "resizeSelectedColumn",
    "moveSelectedColumn",
    "applyVariableViewportControls",
    "shiftVariableViewport"
].forEach((functionName) => {
    assert.ok(sourceMainComposition.includes(functionName), "main renderer must expose dataset layout handler: " + functionName);
});
[
    "consoleToolbar",
    "consoleCwdText",
    "consoleActiveDatasetName",
    "consoleUiCommandVisibility",
    "runtimeEventList"
].forEach((elementId) => {
    assert.ok(sourceHtml.includes(`id="${elementId}"`), "main page must include console toolbar element: " + elementId);
});
assert.ok(sourceHtml.includes('class="dm-console-active-dataset" id="consoleActiveDataset" hidden'), "main page must use the DialogR active dataset pill, not the generic console chip");
assert.ok(sourceHtml.includes('class="dm-console-active-dataset-label" id="consoleActiveDatasetLabel">Active:</span>') &&
    sourceHtml.includes('class="dm-console-active-dataset-name" id="consoleActiveDatasetName"'), "main page must render DialogR-style Active: dataset text");
const activeDatasetStyleSource = sourceHtml + "\n" + sourceAppCodicon;
assert.ok(activeDatasetStyleSource.includes(".dm-console-active-dataset") &&
    activeDatasetStyleSource.includes("border: 1px solid rgba(47, 125, 79, 0.28);") &&
    activeDatasetStyleSource.includes("background: rgba(47, 125, 79, 0.08);"), "main page must preserve DialogR active dataset pill styling");
assert.ok(!sourceHtml.includes('<span class="consoleChip" id="consoleActiveDataset" hidden>'), "active dataset must not use the generic consoleChip styling");
assert.ok(sourceConsoleToolbar.includes('const activeDatasetLabel = elementById(document, "consoleActiveDatasetLabel");') &&
    sourceConsoleToolbar.includes('activeDatasetLabel.textContent = state.translate("Active") + ":";') &&
    sourceConsoleToolbar.includes('state.translate("Active dataset") + ": " + datasetName'), "main renderer must maintain the DialogR active dataset label and accessibility text");
[
    "id=\"workspacePane\"",
    "workspace-pane-hidden",
    "<section class=\"content\">",
    "</section>\n            <aside id=\"workspacePane\"",
    ".main {\n            display: flex;",
    "#workspacePane {\n            flex: 0 0 var(--main-workspace-width);",
    "body.workspace-pane-hidden #workspacePane",
    "require(candidate);"
].forEach((expected) => {
    assert.ok(sourceHtml.includes(expected), "main page must expose DialogR-style workspace pane marker: " + expected);
});
[
    "html,\n        body",
    "overflow: hidden;",
    "flex-direction: row;",
    ".sidebar {\n            display: none;",
    ".topbar {\n            display: none;",
    ".stack.secondary {\n            display: none;",
    ".consoleTerminal",
    ".consolePanel .commandInput",
    "font-family: \"Dialog Mono\"",
    "font-src 'self' data:",
    ".consolePanel {\n            min-height: 0;\n            height: 100%;\n            display: flex;",
    ".consoleTerminal {\n            flex: 1 1 auto;"
].forEach((expectedCss) => {
    assert.ok(sourceHtml.includes(expectedCss), "main page must keep the console-first UX marker: " + expectedCss);
});
[
    "consoleToolbarStart",
    "consoleToolbarStop",
    "consoleToolbarRestart",
    "consoleToolbarRestartWorkspace",
    "consoleToolbarClear",
    "consoleHistoryPrevious",
    "consoleHistoryNext",
    "consoleToolbarInfo",
    "workspacePaneToggle",
    "consoleCwd",
    "consoleUiCommandVisibility",
    "datasetViewportApply",
    "datasetViewportForward",
    "datasetViewportRight",
    "columnWidthApply",
    "columnMoveLeft",
    "columnMoveRight",
    "variableViewportApply"
].forEach((elementId) => {
    assert.ok(sourceHtml.includes(`id="${elementId}"`), "main page must include dataset layout control: " + elementId);
    assert.ok(rendererSource.includes(`"${elementId}"`), "main renderer must bind renderer control: " + elementId);
});
assert.ok(sourceHtml.includes('class="dm-toolbar-btn dm-toolbar-btn-stop" id="consoleToolbarStop"') &&
    sourceHtml.includes('data-tooltip="Interrupt"') &&
    sourceHtml.includes('class="dm-stop-square"'), "console toolbar stop affordance must be a DialogR-style icon-only Interrupt control");
assert.ok(!/class="[^"]*\bdm-toolbar-btn\b[^"]*"[^>]*\bdata-tooltip="[^"]+"[^>]*\btitle="/.test(sourceHtml) &&
    !/class="[^"]*\bdm-toolbar-btn\b[^"]*"[^>]*\btitle="[^"]+"[^>]*\bdata-tooltip="/.test(sourceHtml), "console icon toolbar buttons must not combine data-tooltip with native title tooltips");
assert.ok(!sourceMain.includes("button.title = workspacePaneVisible"), "workspace pane toggle must not recreate a native title tooltip at runtime");
assert.ok(sourceHtml.includes(".consoleToolbarLeft {\n            gap: 8px;") &&
    sourceHtml.includes("padding-left: 2px;") &&
    sourceHtml.includes(".dm-console-toolbar-left .dm-toolbar-btn::after") &&
    sourceHtml.includes("left: 0;\n            right: auto;"), "working-directory icon and tooltip must stay visually close and inside the left edge");
assert.ok(rendererSource.includes('buttonById(document, "consoleToolbarStop").disabled = !state.runtimeBusy;'), "console toolbar interrupt must only be enabled while the runtime is busy");
assert.ok(sourceHtml.includes('id="consoleCover" aria-live="polite"') &&
    sourceHtml.includes("body.console-cover-visible #consoleCover") &&
    sourceMainComposition.includes('runtimeStatus === "failed"') &&
    sourceMainComposition.includes('failure || "Unknown startup error."'), "console startup failures must remain visible when the runtime prompt is unavailable");
assert.ok(sourceAboutWindowFactory.includes("autoHideMenuBar: true") &&
    sourceApplicationSupportWindows.includes("hideMenuBar: true"), "the informative About window must not expose application menus on any platform");
assert.ok(rendererSource.includes('requiredElement("consoleToolbarStop").addEventListener("click", bindings.interruptRuntime);'), "console toolbar stop button must interrupt the running command, not stop the runtime");
assert.ok(!rendererSource.includes('requiredElement("consoleToolbarStop").addEventListener("click", bindings.stopRuntime);'), "console toolbar stop button must not stop the runtime session");
assert.ok(rendererSource.includes('method: "reply_prompt"') &&
    rendererSource.includes('source: "base-app.console-prompt"'), "console prompt replies must route through the runtime reply_prompt method");
assert.ok(rendererSource.includes('options.transcript.recordRuntimeMessagePrompt') &&
    rendererSource.includes('createConsoleRequestInputView'), "runtime prompt requests must be rendered and answered through the console flow");
assert.ok(rendererSource.includes('event.type === "prompt_state"') &&
    rendererSource.includes('options.transcript.recordRuntimePromptState'), "runtime prompt_state events must update the DialogR-style console prompt state");
[
    "renderConsoleToolbar",
    "refreshConsoleWorkingDirectory",
    "clearConsoleTranscript",
    "resetConsoleInput",
    "restartRuntimeClean",
    "restartRuntimeRestoreWorkspace",
    "initializeVisibleCommandEditor",
    "ensureConsoleMonacoLoaded",
    "registerConsoleRLanguage",
    "ensureConsoleTheme",
    "mainZoomScaling.readZoomFactor",
    "mainZoomScaling.scaleLayoutSize",
    "updateUiCommandVisibility",
    "openPlotViewer",
    "refreshRuntimeEvents"
].forEach((functionName) => {
    assert.ok(rendererSource.includes(functionName), "main renderer must expose console toolbar handler: " + functionName);
});
[
    "const maximumItems = Math.max(1, Number(options.maximumItems || 500));",
    "readHistory: (scope: ConsoleHistoryScope) => Promise<unknown>",
    "writeHistory:",
    "runtimeId: String(nextScope.runtimeId || \"none\")",
    "return newestFirst.slice().reverse();",
    "options.dialogForge.readConsoleHistory",
    "options.dialogForge.writeConsoleHistory"
].forEach((expected) => {
    assert.ok(rendererSource.includes(expected), "main renderer must persist DialogR-style visible command history: " + expected);
});
[
    "const navigateHistory = (direction: 'up' | 'down')",
    "editor.addCommand(KeyCode.UpArrow",
    "editor.addCommand(KeyCode.DownArrow",
    "editor.addCommand(KeyMod.CtrlCmd | KeyCode.UpArrow",
    "editor.addCommand(KeyMod.CtrlCmd | KeyCode.DownArrow, scrollToPrompt)",
    "\"!suggestWidgetVisible\"",
    "historyPrevious: () => historyController.previous()",
    "historyNext: () => historyController.next()"
].forEach((expected) => {
    assert.ok(rendererSource.includes(expected), "terminal Monaco input must bind command history navigation: " + expected);
});
[
    "request.uiCommandVisibility = bindings.getUiCommandVisibility();",
    "uiCommandVisibility: bindings.getCommandVisibility()"
].forEach((expected) => {
    assert.ok(rendererSource.includes(expected), "renderer import paths must honor DialogR UI action command visibility: " + expected);
});
[
    "initializeWorkspacePane",
    "toggleWorkspacePane",
    "openRuntimeWorkspaceFile",
    "saveRuntimeWorkspaceFile",
    "selectWorkspaceOpenFile",
    "selectWorkspaceSaveFile",
    "method: \"runtime.load_workspace_file\"",
    "method: \"runtime.save_workspace_file\"",
    "source: \"base-app.workspace-open\"",
    "source: \"base-app.workspace-save\"",
    "window.dialogForge.setWorkspacePaneVisible",
    "const readTargetWidth = function(): number",
    "DEFAULT_SETTINGS_KEY = \"app.main.workspacePaneVisible\"",
    "readPersisted",
    "writePersisted",
    "restoreExistingExpansion: restoredWorkspacePaneVisible",
    "pane?.setSnapshot",
    "pane?.setActiveDataset",
    "createWorkspacePane",
    "applyWorkspaceRuntimeEvents: applyWorkspaceRuntimeEventsToPane",
    "event.type !== \"workspace.update\"",
    "const appliedEventKeys = new Set<string>();",
    "void bindings.setActiveDataset(latestAddedDataset)",
    "window.dialogForge.removeWorkspaceObjects([",
    "const snapshot = await window.dialogForge.clearWorkspace();",
    "sourceButton?.blur()",
    "focusVisibleCommandInput()"
].forEach((expected) => {
    assert.ok(rendererSource.includes(expected), "main renderer must wire the DialogR-style workspace pane: " + expected);
});
assert.ok(rendererSource.includes("await bindings.readPersistedWorkspacePaneVisible()") &&
    rendererSource.includes("persist: false,") &&
    rendererSource.includes("restoreExistingExpansion: restoredWorkspacePaneVisible"), "workspace pane initialization must not overwrite persisted visibility before startup restore");
[
    "setWorkspacePaneVisible: function(input",
    "shellWindowIpcChannels.setWorkspacePaneVisible"
].forEach((expected) => {
    assert.ok(preloadScript.includes(expected), "preload must expose workspace pane window expansion: " + expected);
});
[
    "renameWorkspaceObject: function(input",
    "workspaceIpcChannels.renameObject"
].forEach((expected) => {
    assert.ok(preloadScript.includes(expected) || mainProcessSource.includes(expected), "workspace rename bridge must be exposed: " + expected);
});
assert.ok(workspaceIpcScript.includes('renameObject: "base-app:renameWorkspaceObject"'), "typed workspace IPC contract must preserve the workspace rename channel");
[
    "setWorkspacePaneVisible(input",
    "addedWidth?: number",
    "restoreExistingExpansion?: boolean",
    "restored?: boolean"
].forEach((expected) => {
    assert.ok(typeScript.includes(expected), "global types must expose workspace pane window expansion: " + expected);
});
assert.ok(typeScript.includes("renameWorkspaceObject(input"), "global types must expose workspace object rename");
assert.ok(mainProcessSource.includes(".renameWorkspaceObject(createWorkspaceRenameRequest(input || {}))"), "main process must route workspace object rename through the runtime session manager");
[
    "const expansions = new Map<number, WorkspacePaneWindowExpansion>();",
    "base-app:setWorkspacePaneVisible",
    "visibilitySettingsKey = \"app.main.workspacePaneVisible\"",
    "options.writeSettings({",
    "restoreExistingExpansion",
    "options.getWorkArea(bounds)",
    "bounds.width + width",
    "win.setBounds",
    "current.width - expansion.addedWidth"
].forEach((expected) => {
    assert.ok(mainProcessSource.includes(expected), "main process must expand the window outside the console for workspace pane: " + expected);
});
[
    "base-app:selectWorkspaceOpenFile",
    "base-app:selectWorkspaceSaveFile",
    "extensions: [\"RData\", \"rdata\", \"rda\"]",
    "defaultPath: \"workspace.RData\""
].forEach((expected) => {
    assert.ok(mainProcessSource.includes(expected), "main process must expose DialogR workspace file dialog behavior: " + expected);
});
[
    "\"csv\"", "\"txt\"", "\"tsv\"", "\"tab\"", "\"dat\"",
    "\"sav\"", "\"zsav\"", "\"por\"", "\"dta\"", "\"sas7bdat\"", "\"xpt\"",
    "\"xls\"", "\"xlsx\"",
    "\"rda\"", "\"rds\""
].forEach((extension) => {
    assert.ok(mainProcessSource.includes(extension), "main process import picker must expose DialogR import extension: " + extension);
});
[
    "buildWorkspaceGroups",
    "formatWorkspaceSummary",
    "No objects in workspace",
    "workspace-variable-row",
    "workspace-context-menu"
].forEach((expected) => {
    assert.ok(workspacePaneScript.includes(expected), "workspace pane script must include parity behavior: " + expected);
});
[
    "../../assets/icons/restart.svg",
    "../../assets/icons/restartworkspace.svg",
    "../../assets/icons/info.svg",
    "../../assets/icons/clear-all.svg"
].forEach((assetPath) => {
    assert.ok(sourceHtml.includes(assetPath), "main page must use shared local SVG toolbar asset: " + assetPath);
});
assert.ok(!sourceHtml.includes("products/") || !sourceHtml.includes("assets/arrow-left.svg"), "workspace toggle must invert to chevron-left, not a product-local arrow-left asset");
assert.ok(sourceHtml.includes("id=\"consoleCwd\"") &&
    sourceHtml.includes("class=\"codicon codicon-folder\""), "console toolbar must keep the clickable working-directory folder icon");
assert.ok(!sourceHtml.includes("<span class=\"consoleChip dm-console-cwd\" id=\"consoleWorkingDirectory\">\n                                    <span class=\"codicon codicon-folder\""), "console working-directory text chip must not duplicate the clickable folder icon");
[
    "<link rel=\"stylesheet\" href=\"./shared/appCodicon.css\">",
    "class=\"consoleToolbar dm-console-toolbar\"",
    "class=\"consoleToolbarLeft dm-console-toolbar-left\"",
    "class=\"consoleToolbarRight dm-console-toolbar-right\"",
    "class=\"dm-toolbar-btn dm-toolbar-btn-stop\"",
    "class=\"dm-toolbar-svg-icon dm-toolbar-svg-icon-restart\"",
    "class=\"dm-toolbar-svg-icon dm-toolbar-svg-icon-restartworkspace\"",
    "class=\"codicon codicon-clear-all\"",
    "class=\"codicon codicon-info\"",
    "class=\"codicon codicon-chevron-right\""
].forEach((expected) => {
    assert.ok(sourceHtml.includes(expected), "main console toolbar must use DialogR icon-only toolbar structure: " + expected);
});
[
    "\n        #consoleCwd::before",
    "\n        #consoleToolbarRestart::before",
    "\n        #consoleToolbarRestartWorkspace::before",
    "\n        #consoleToolbarClear::before",
    "\n        #consoleToolbarInfo::before",
    "\n        #workspacePaneToggle::before"
].forEach((unexpected) => {
    assert.ok(!sourceHtml.includes(unexpected), "legacy fallback toolbar pseudo-icon must not overlay DialogR toolbar button content: " + unexpected);
});
[
    ".codicon-folder",
    ".codicon-info",
    ".codicon-clear-all",
    ".dm-console-toolbar .dm-toolbar-btn",
    "body.console-runtime-busy .dm-console-toolbar .dm-toolbar-btn.dm-toolbar-btn-stop"
].forEach((expected) => {
    assert.ok(sourceAppCodicon.includes(expected) ||
        sourceVscodeCodicon.includes(expected) ||
        sourceHtml.includes(expected), "main console toolbar must use shared DialogR toolbar/icon styling: " + expected);
});
assert.ok(rendererSource.includes("\"console-runtime-busy\"") &&
    rendererSource.includes("const labelKey = visible ? \"Hide Workspace\" : \"Show Workspace\";") &&
    rendererSource.includes("options.translate(labelKey)") &&
    rendererSource.includes("icon.classList.toggle(\"codicon-chevron-left\", visible)") &&
    rendererSource.includes("icon.classList.toggle(\"codicon-chevron-right\", !visible)"), "main renderer must keep toolbar busy state and workspace chevron state in sync with DialogR behavior");
assert.ok(sourceHtml.includes(".workspace-pane-action .workspace-broom-icon"), "workspace pane clear action must use the DialogR broom icon structure");
assert.ok(workspacePaneScript.includes("workspace-broom-icon"), "workspace pane renderer must emit the broom icon");
assert.ok(!workspacePaneScript.includes("deleteButton.textContent = \"×\""), "workspace pane delete action must not use a text x marker");
assert.ok(preloadScript.includes("onMainZoomFactor"), "preload must expose main zoom notifications");
assert.ok(typeScript.includes("onMainZoomFactor"), "global types must expose main zoom notifications");
assert.ok(rendererSource.includes("onMainZoomFactor"), "main renderer must listen for zoom notifications");
assert.ok(fs.existsSync(path.join(distDir, "node_modules/monaco-editor/min/vs/loader.js")), "build output must include the Monaco AMD loader");
const visibleCommandTextHandler = sourceConsoleCoordinator.slice(sourceConsoleCoordinator.indexOf("const executeText = function"), sourceConsoleCoordinator.indexOf("const getSurface = function"));
assert.ok(!visibleCommandTextHandler.includes("await refreshWorkspace();"), "visible command renderer path must not synchronously refresh the full workspace");
assert.ok(!visibleCommandTextHandler.includes("await refreshRuntimeEvents();"), "visible command renderer path must not synchronously refresh runtime events");
assert.ok(sourceConsoleSurface.includes('import { createTerminalConsoleEditorInputView } from "../views/terminalEditorInputView";'), "main page must load the DialogR terminal editor input view");
assert.ok(rendererSource.includes("createTerminalConsoleEditorInputView"), "main renderer must mount the visible command input through the DialogR terminal editor input view");
assert.ok(sourceConsolePresentation.includes("promptVisible") &&
    sourceConsolePresentation.includes("&& editor") &&
    sourceConsolePresentation.includes("requestAnimationFrame(function(): void") &&
    sourceConsolePresentation.includes("editor?.hasTextFocus?.()") &&
    sourceConsolePresentation.includes("editor?.render?.();") &&
    sourceConsoleInputState.includes("editor.render?.();") &&
    sourceConsolePresentation.includes("editor?.focus?.();") &&
    sourceConsoleSurface.includes("const returningToCommandPrompt = Boolean(activePromptId);") &&
    sourceConsoleSurface.includes("if (returningToCommandPrompt)"), "console prompt must enforce missing Monaco focus without refocusing on every transcript render");
assert.ok(sourceConsoleFlowView.includes("inputStyle.display !== 'none' && inputHost.offsetHeight > 0") &&
    sourceConsoleFlowView.includes("itemsHost.lastElementChild"), "console scrolling must target transcript rows while the live prompt host has no layout");
assert.ok(sourceConsoleTranscriptIsland.includes("estimateActivityLineCount") &&
    sourceConsoleTranscriptIsland.includes("String(activityItem.code || \"\")") &&
    sourceConsoleTranscriptIsland.includes(".split(\"\\n\").length"), "console transcript virtualization must estimate multiline input height before DOM measurement");
assert.ok(rendererSource.includes("const checkCodeFragmentComplete = async function") &&
    rendererSource.includes('method: "check_completeness"'), "main renderer must use runtime-backed completeness checks for console input");
assert.ok(!sourceHtml.includes(">1 + 1</div>"), "main console must not seed the visible command input with smoke-test code");
console.log("Renderer script loading contract verified.");
