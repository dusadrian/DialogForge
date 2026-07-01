"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");


const projectRoot = path.resolve(__dirname, "../..");
const serverModule = require("../../scripts/web-dialogr-dev-server");


const request = function(port, pathname) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: "127.0.0.1",
            port,
            path: pathname,
            method: "GET"
        }, (response) => {
            const chunks = [];

            response.on("data", (chunk) => {
                chunks.push(chunk);
            });
            response.on("end", () => {
                resolve({
                    statusCode: response.statusCode,
                    headers: response.headers,
                    body: Buffer.concat(chunks)
                });
            });
        });

        req.on("error", reject);
        req.end();
    });
};


const listen = function(server) {
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            resolve(server.address().port);
        });
    });
};


const close = function(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
};


const assertSourceContracts = function() {
    const html = fs.readFileSync(
        path.join(projectRoot, "shared/shell-web/pages/dialogr.html"),
        "utf8"
    );
    const script = fs.readFileSync(
        path.join(projectRoot, "shared/shell-web/pages/dialogr.js"),
        "utf8"
    );
    const browserDialogRuntime = fs.readFileSync(
        path.join(projectRoot, "shared/shell-web/pages/browserDialogRuntime.js"),
        "utf8"
    );
    const summaryBindings = fs.readFileSync(
        path.join(projectRoot, "shared/dialog-runtime/custom-js/summaryBindings.ts"),
        "utf8"
    );
    const copyStatic = fs.readFileSync(
        path.join(projectRoot, "scripts/copy-static.js"),
        "utf8"
    );
    const packageJson = fs.readFileSync(
        path.join(projectRoot, "package.json"),
        "utf8"
    );
    const webServer = fs.readFileSync(
        path.join(projectRoot, "scripts/web-dialogr-dev-server.js"),
        "utf8"
    );
    const transcriptIsland = fs.readFileSync(
        path.join(projectRoot, "shared/console/views/consoleTranscriptIsland.ts"),
        "utf8"
    );
    const consoleEditorCommandController = fs.readFileSync(
        path.join(projectRoot, "shared/console/terminal/consoleEditorCommandController.ts"),
        "utf8"
    );
    const consoleEditorInputStateController = fs.readFileSync(
        path.join(projectRoot, "shared/console/terminal/consoleEditorInputStateController.ts"),
        "utf8"
    );
    const terminalEditorInputView = fs.readFileSync(
        path.join(projectRoot, "shared/console/views/terminalEditorInputView.ts"),
        "utf8"
    );
    const helpPage = fs.readFileSync(
        path.join(projectRoot, "shared/base-app/pages/help.html"),
        "utf8"
    );

    assert.ok(html.includes("/shared/shell-web/pages/dialogr.js"));
    assert.ok(html.includes("id=\"webMenuBar\""));
    assert.ok(html.includes("id=\"webDesktop\""));
    assert.ok(html.includes("id=\"webWorkbenchWindow\""));
    assert.ok(html.includes("WebR console"));
    assert.ok(html.includes("resize: both"));
    assert.ok(html.includes("web-workbench-resize-handle"));
    assert.ok(html.includes('data-resize-direction="corner"'));
    assert.ok(!html.includes("id=\"dialogList\""));
    assert.ok(!html.includes("id=\"consoleToolbarStart\" type=\"button\" data-tooltip=\"Start runtime\" aria-label=\"Start runtime\"><span class=\"codicon codicon-debug-start\""));
    assert.ok(!html.includes("codicon-debug-stop"));
    assert.ok(!html.includes("codicon-sync"));
    assert.ok(html.includes("dm-stop-square"));
    assert.ok(html.includes("dm-toolbar-svg-icon-restart"));
    assert.ok(html.includes("dm-toolbar-svg-icon-restartworkspace"));
    assert.ok(script.includes("prewarmPlotViewerModal()"));
    assert.ok(script.includes("prewarmWebRGraphicsCapture(runtime)"));
    assert.ok(script.includes("prewarmPlotInfrastructure(runtime)"));
    assert.ok(script.includes("waitForPlotWarmup"));
    assert.ok(script.includes("openPlotViewerModal(null, { hidden: true })"));
    assert.ok(
        !script.includes("await waitForPlotViewerRender(renderToken);"),
        "DialogR browser plot commands must not wait for a hidden iframe render before showing the plot modal"
    );
    assert.ok(
        !script.includes("Waiting for WebR plot output..."),
        "DialogR browser plot commands must not reveal a waiting plot modal before an image is captured"
    );
    assert.ok(html.includes("codicon-chevron-left"));
    assert.ok(html.includes("body.console-runtime-busy .dm-console-toolbar .dm-toolbar-btn.dm-toolbar-btn-stop"));
    assert.ok(html.includes("height: 29px"));
    assert.ok(html.includes("workspace-pane-shell"));
    assert.ok(html.includes("workspace-broom-icon"));
    assert.ok(html.includes("workspace-variable-row"));
    assert.ok(html.includes("workspace-variable-delete"));
    assert.ok(html.includes("dialogforge-web-script-editor-window"));
    assert.ok(html.includes("web-script-editor__monaco"));
    assert.ok(html.includes(".dm-script-toolbar"));
    assert.ok(html.includes(".dm-script-tabs"));
    assert.ok(
        html.includes(".dialogforge-web-data-editor-window .dataset-grid th.row-index,\n        .dialogforge-web-data-editor-window .dataset-grid td.row-index")
            && html.includes("position: sticky;\n            left: 0;\n            z-index: 2;"),
        "DialogR browser data editor must keep the row-number gutter and its top-left header cell fixed together"
    );
    assert.ok(
        !html.includes(".dialogforge-web-data-editor-window .dataset-grid tbody td.row-index {\n            position: sticky;"),
        "DialogR browser data editor must not make only body row headers sticky"
    );
    assert.ok(
        !html.includes(".dialogforge-web-data-editor-window .dataset-grid--data th[data-data-header],\n        .dialogforge-web-data-editor-window .dataset-grid--data td[data-row-name]"),
        "DialogR browser data editor must not override row-name cells back to non-sticky positioning"
    );
    assert.ok(html.includes("No objects in workspace"));
    assert.ok(html.includes("id=\"commandPane\""));
    assert.ok(html.includes("id=\"commandActions\""));
    assert.ok(html.includes("id=\"command\""));
    assert.ok(html.includes("id=\"mainSplitter\""));
    assert.ok(html.includes("id=\"consoleArea\""));
    assert.ok(html.includes("id=\"commandPreviewToConsole\""));
    assert.ok(html.includes("id=\"commandPreviewToScriptEditor\""));
    assert.ok(html.includes("body.command-pane-hidden #commandPane"));
    assert.ok(html.includes("<body class=\"command-pane-hidden\">"));
    assert.ok(html.includes("id=\"consoleTerminal\""));
    assert.ok(html.includes("id=\"visibleCommandInput\""));
    assert.ok(script.includes('import("/webr/webr.js")'));
    assert.ok(script.includes("readMoodleLaunchCode()"));
    assert.ok(script.includes("/api/launch/"));
    assert.ok(script.includes("dataset <- readRDS(${JSON.stringify(launchDatasetPath)})"));
    assert.ok(script.includes("window.history.replaceState"));
    assert.ok(
        script.includes("webr::shim_install()"),
        "DialogR browser WebR startup must shim install.packages() for wasm package installs"
    );
    assert.ok(
        !script.includes("data(iris)"),
        "DialogR browser WebR startup must not seed a default iris dataset"
    );
    assert.ok(
        script.includes("if (!workspaceObjectNames().length && state.runtimeReady)")
            && script.includes("await refreshWebRWorkspaceSurfaces();")
            && script.includes("message.type === \"getActiveDataset\"")
            && script.includes("value = state.activeDatasetName || \"\";")
            && script.includes("if (datasetName && !value.length && state.runtimeReady)")
            && script.includes("notifyBrowserDialogsWorkspaceChanged();"),
        "DialogR browser host must refresh stale WebR workspace state before answering dialog object/column requests"
    );
    assert.ok(
        browserDialogRuntime.includes("buildSummaryCommand"),
        "Browser dialog runtime must use the shared/DialogR summary command builder"
    );
    assert.ok(
        browserDialogRuntime.includes("\"bindFrequenciesWorkspace\"")
            && browserDialogRuntime.includes("\"bindCrosstabsWorkspace\"")
            && browserDialogRuntime.includes("\"bindSummaryWorkspaceUpdates\"")
            && browserDialogRuntime.includes("\"getDatasetVariablesForDialog\"")
            && browserDialogRuntime.includes("return await requestParent(\"listColumns\", parameters);")
            && browserDialogRuntime.includes("return await bindDatasetControls("),
        "Browser dialog runtime must route live workspace bindings through the browser/WebR parent state"
    );
    assert.ok(
        browserDialogRuntime.includes("markWorkspaceObjectBinding(control, values);")
            && browserDialogRuntime.includes("const shouldTriggerChange = setCustomOptions(control, values);")
            && browserDialogRuntime.includes("Promise.resolve().then(() => trigger(\"change\", control.name));"),
        "Browser dialog runtime must auto-select and trigger workspace dataset containers populated through shared control updates"
    );
    assert.ok(
        browserDialogRuntime.includes("const refreshWorkspaceColumnCache = async function()")
            && browserDialogRuntime.includes("await refreshWorkspaceColumnCache();")
            && browserDialogRuntime.includes("await executeActions(actions);"),
        "Browser dialog runtime must warm column metadata before actions that use synchronous listColumns()"
    );
    assert.ok(
        browserDialogRuntime.includes("let activeDatasetCache = \"\";")
            && browserDialogRuntime.includes("requestParent(\"getActiveDataset\", {})")
            && browserDialogRuntime.includes("datasetName: activeDatasetCache || workspaceObjectCache[0] || \"\"")
            && browserDialogRuntime.includes("dataset: activeDatasetCache || workspaceObjectCache[0] || \"\""),
        "Browser dialog runtime must use the parent active dataset for dataset-editor and Go to context"
    );
    assert.ok(
        browserDialogRuntime.includes("const checked = value.checked && typeof value.checked === \"object\"")
            && browserDialogRuntime.includes("Object.keys(checked).forEach((name) => {")
            && browserDialogRuntime.includes("setValue(name, checked[name]);"),
        "Browser dialog runtime must apply checked-state updates returned by shared dialog external calls"
    );
    assert.ok(
        browserDialogRuntime.includes("if (\"checked\" in control.valueNode)")
            && browserDialogRuntime.includes("syncCheckedControl(control);"),
        "Browser dialog runtime must programmatically update custom DialogR checkbox/radio controls"
    );
    assert.ok(
        browserDialogRuntime.includes("const controlNameFromReference = function(value)")
            && browserDialogRuntime.includes("const active = controlNameFromReference(parameters?.active);"),
        "Browser dialog runtime must accept DialogR control references when syncing summary statistics"
    );
    assert.ok(
        browserDialogRuntime.includes("if (name === \"syncSummaryStatisticSelection\")")
            && browserDialogRuntime.includes("const localValue = syncSummaryStatisticSelection(parameters);")
            && browserDialogRuntime.includes("applySharedControlUpdate(localValue);"),
        "Browser dialog runtime must apply summary statistic sync against live custom checkbox state"
    );
    assert.ok(
        browserDialogRuntime.includes("name === \"refreshSummarySyntax\" && typeof result.value === \"string\"")
            && browserDialogRuntime.includes("type: \"syntaxUpdate\"")
            && browserDialogRuntime.includes("command: result.value"),
        "Browser dialog runtime must update the command constructor when shared refreshSummarySyntax handles a dialog action"
    );
    assert.ok(
        summaryBindings.includes("wsummary(") && summaryBindings.includes("wmeasures("),
        "Browser summaries must keep the DialogR wsummary/wmeasures command contract"
    );
    assert.ok(
        !browserDialogRuntime.includes("summarytools("),
        "Browser summaries must not invent a summarytools() command"
    );
    assert.ok(
        script.includes("readInstallPackagesCommand"),
        "DialogR browser console must detect install.packages() commands"
    );
    assert.ok(
        script.includes("runtime.installPackages(packageNames, { quiet: false })"),
        "DialogR browser console must route package installs through WebR.installPackages()"
    );
    assert.ok(
        script.includes("isBrowserPackageMenuRoot") &&
        script.includes('String(item?.id || "") === "Packages"'),
        "DialogR browser menu must hide the Packages menu root for student launches"
    );
    assert.ok(
        script.includes("isBrowserPackageInstallCommand") &&
        script.includes("return false;"),
        "DialogR browser menu must not expose product package-install commands"
    );
    assert.ok(
        script.includes("ensureDialogRuntimePackages"),
        "DialogR browser must load dialog package requirements when a dialog opens"
    );
    assert.ok(
        script.includes("openScriptEditorModal") &&
        script.includes("runScriptEditorCode") &&
        script.includes("saveScriptEditorAsDownload"),
        "DialogR browser must expose the script editor modal with run and save-as behavior"
    );
    assert.ok(
        script.includes("readDialogRuntimePackageRequirements"),
        "DialogR browser must read package requirements from dialog metadata"
    );
    assert.ok(
        script.includes("frequencies: [\"admisc\", \"declared\"]"),
        "DialogR browser must keep a fallback package requirement map for known DialogR dialogs"
    );
    assert.ok(
        script.includes("is.element(paste0(\"package:\", .pkg), search())"),
        "DialogR browser must check whether a dialog package is already loaded before loading it"
    );
    assert.ok(
        script.includes("pasteTextIntoSelectedDataEditorCell") &&
        script.includes("event.clipboardData?.getData(\"text/plain\")"),
        "DialogR browser data editor must paste from the native paste event instead of forcing clipboard permission prompts"
    );
    assert.ok(
        script.includes("rownames(installed.packages())"),
        "DialogR browser must check whether dialog package requirements are installed"
    );
    assert.ok(
        script.includes("createVisibleCommandActivity(`library(${packageName})`)") &&
            script.includes("activitiesByPackage"),
        "DialogR browser must visibly load missing dialog package requirements"
    );
    assert.ok(
        script.includes("buildCapturedVisibleRCommand"),
        "DialogR browser WebR commands must be captured as whole expressions with console-width options"
    );
    assert.ok(
        transcriptIsland.includes("host.getBoundingClientRect().top") &&
        transcriptIsland.includes("viewport.getBoundingClientRect().top"),
        "DialogR browser console virtualization must calculate transcript scroll positions from the actual viewport geometry"
    );
    assert.ok(
        !consoleEditorCommandController.includes("navigator?.clipboard?.readText"),
        "DialogR browser console paste must not read navigator.clipboard on Cmd/Ctrl+V because that triggers browser paste permission UI"
    );
    assert.ok(
        !consoleEditorCommandController.includes("KeyMod.CtrlCmd | KeyCode.KeyV"),
        "DialogR browser console must leave Cmd/Ctrl+V to the native paste event"
    );
    assert.ok(
        consoleEditorInputStateController.includes("bindings.scrollToPrompt?.()") &&
        terminalEditorInputView.includes("scrollToPrompt: deps.scrollToPrompt"),
        "DialogR browser console must scroll the transcript viewport after multiline paste grows the Monaco prompt"
    );
    assert.ok(
        script.includes("options(width ="),
        "DialogR browser WebR command output must set R's output width from the console"
    );
    assert.ok(
        script.includes("renderMenu(composition.menu || [])"),
        "DialogR browser shell must render the composed top menu"
    );
    assert.ok(
        !html.includes("Start WebR")
            && !html.includes("id=\"startRuntime\"")
            && !html.includes("id=\"runtimeStatus\"")
            && !html.includes("id=\"productName\"")
            && !html.includes("id=\"compositionMeta\""),
        "DialogR browser shell must not render the removed top WebR information header"
    );
    assert.ok(
        script.includes("await ensureRuntime();"),
        "DialogR browser shell must start WebR automatically after composition"
    );
    assert.ok(
        script.includes("commandPreviewDialogId")
            && script.includes("state.commandPreviewDialogId === dialogId"),
        "DialogR browser shell must clear a command preview when its owning dialog closes"
    );
    assert.ok(
        script.includes('item?.type === "separator"')
            && script.includes("createMenuSeparator"),
        "DialogR browser shell must render menu separators as structural separator nodes"
    );
    assert.ok(
        html.includes(".web-menu-separator"),
        "DialogR browser shell must style structural menu separators"
    );
    assert.ok(
        script.includes("installDraggableModal"),
        "DialogR browser shell must make web modals draggable"
    );
    assert.ok(
        script.includes("readDialogContentSize"),
        "DialogR browser shell must size dialog modals from DialogR dialog properties"
    );
    assert.ok(
        script.includes("dialogforge-web-help-window") &&
        script.includes("installResizableWindow(shell, [rightHandle, bottomHandle, cornerHandle]);"),
        "DialogR browser help modal must use the shared explicit resize handles"
    );
    assert.ok(
        script.includes("dialogforge-web-plot-window") &&
        script.includes("dialogforge-web-plot-frame") &&
        script.includes("installResizableWindow(shell, [rightHandle, bottomHandle, cornerHandle]);"),
        "DialogR browser plot modal must use the shared explicit resize handles"
    );
    assert.ok(
        script.includes("installWorkbenchDrag"),
        "DialogR browser shell must make the console/workspace window draggable"
    );
    assert.ok(
        script.includes("installWorkbenchResize"),
        "DialogR browser shell must make the console/workspace window explicitly resizable"
    );
    assert.ok(
        script.includes("installCommandPaneActions"),
        "DialogR browser shell must install command constructor pane actions"
    );
    assert.ok(
        script.includes("installCommandPaneResize"),
        "DialogR browser shell must keep the command constructor pane vertically resizable"
    );
    assert.ok(
        script.includes("openDataEditorValueLabelsModal"),
        "DialogR browser Data Editor must expose the Variables-tab value-label editor"
    );
    assert.ok(
        script.includes("writeDataEditorValueLabels"),
        "DialogR browser Data Editor must write value-label and declared-missing edits back into WebR"
    );
    assert.ok(
        script.includes("declaredMissing"),
        "DialogR browser Data Editor snapshots must carry declared-missing cell state"
    );
    assert.ok(
        script.includes("variableDeclared"),
        "DialogR browser Data Editor snapshots must carry declared variable state"
    );
    assert.ok(
        script.includes("declared::declared(.source, labels = .label_values, na_values = .missing_values, na_range = .missing_range"),
        "DialogR browser Data Editor must rebuild WebR declared metadata through declared"
    );
    assert.ok(
        html.includes("dataset-grid__values-button"),
        "DialogR browser Data Editor must preserve the desktop Values-cell editor affordance"
    );
    assert.ok(
        html.includes("dialogforge-web-value-labels-window"),
        "DialogR browser Data Editor must style the value-label editor modal"
    );
    assert.ok(
        script.includes("measureCommandPaneContentHeight"),
        "DialogR browser command constructor pane must auto-size from rendered command content"
    );
    assert.ok(
        script.includes("setCommandPaneVisible"),
        "DialogR browser command constructor pane must stay hidden until a dialog constructs syntax"
    );
    assert.ok(
        script.includes("commandPaneSizeMode"),
        "DialogR browser command constructor pane must preserve automatic and manual sizing modes"
    );
    assert.ok(
        script.includes("updateCommandPane"),
        "DialogR browser dialogs must render generated syntax in the command constructor pane"
    );
    assert.ok(
        script.includes("/browser-esm/shared/console/consoleSyntax.js"),
        "DialogR browser command constructor pane must reuse shared console syntax coloring"
    );
    assert.ok(
        script.includes("resizeWorkbenchForWorkspace"),
        "DialogR browser workspace toggle must resize the workbench without changing console width"
    );
    assert.ok(
        script.includes("refreshWebRWorkspacePane"),
        "DialogR browser workspace pane must render WebR objects, not session-status text"
    );
    assert.ok(
        script.includes("parseWorkspaceSnapshot"),
        "DialogR browser workspace pane must parse WebR workspace snapshots"
    );
    assert.ok(
        script.includes("updateWorkspacePaneToggle"),
        "DialogR browser workspace toggle must keep the chevron direction in sync"
    );
    assert.ok(
        script.includes("collectInstallProgress"),
        "DialogR browser package installs must forward WebR download progress"
    );
    assert.ok(
        script.includes("flushWebROutputQueue"),
        "DialogR browser startup must drain WebR startup output before install progress is collected"
    );
    assert.ok(
        script.includes("installBrowserHelpBridge") &&
        script.includes("fetchBrowserRHelpHttpdPath") &&
        script.includes("tools:::httpd(.path, list())") &&
        script.includes("Example\\/") &&
        script.includes("fetchBrowserRHelpPage") &&
        !script.includes("createPackageIndexHtml"),
        "DialogR browser help must use R HTTPD pages for topic, examples, and package-index routing"
    );
    assert.ok(
        !helpPage.includes("id=\"helpRunExamples\"") &&
        !helpPage.includes("codicon-run") &&
        helpPage.includes("getDialogForgeApi") &&
        helpPage.includes("window.parent.dialogForge") &&
        helpPage.includes("colorizeConsoleRCodeInto") &&
        helpPage.includes("/browser-esm/shared/console/consoleSyntax.js") &&
        !helpPage.includes(".r-keyword") &&
        !helpPage.includes(".r-call") &&
        !helpPage.includes(".r-string") &&
        !helpPage.includes("app-help-run-examples") &&
        !helpPage.includes("helpRunExamplesOutput") &&
        !helpPage.includes("helpPackageIndexWrap") &&
        !helpPage.includes("target.querySelector?.('.hl')") &&
        helpPage.includes("target.closest?.('.output,.warning,.error,.message')") &&
        helpPage.includes("readHelpUrlMetadata"),
        "shared help page must remove synthetic Run actions while preserving native examples/index navigation"
    );
    assert.ok(
        script.includes("{ quiet: false }"),
        "DialogR browser package installs must keep WebR install progress visible"
    );
    assert.ok(
        script.includes("mountProductPackageLibrary"),
        "DialogR browser WebR startup must mount product package-library bundles"
    );
    assert.ok(
        script.includes('runtime.FS.mount("WORKERFS"'),
        "DialogR browser package-library startup must mount the product VFS through WORKERFS"
    );
    assert.ok(script.includes("createMainConsoleCoordinator"));
    assert.ok(script.includes("/browser-esm/shared/console/renderer/mainConsoleCoordinator.js"));
    assert.ok(script.includes("print.eval = TRUE"));
    assert.ok(script.includes("dialogBuilder.html"));
    assert.ok(script.includes("dialogforge.browser-dialog-runtime"));
    assert.ok(browserDialogRuntime.includes("smart-button"));
    assert.ok(browserDialogRuntime.includes("smart-button-icon"));
    assert.ok(browserDialogRuntime.includes("toCodiconClass"));
    assert.ok(browserDialogRuntime.includes("smart-button-text"));
    assert.ok(browserDialogRuntime.includes("custom-checkbox"));
    assert.ok(browserDialogRuntime.includes("tick-mark"));
    assert.ok(browserDialogRuntime.includes("native-radio"));
    assert.ok(browserDialogRuntime.includes("custom-radio"));
    assert.ok(browserDialogRuntime.includes("dm-input"));
    assert.ok(browserDialogRuntime.includes("textarea"));
    assert.ok(browserDialogRuntime.includes("container-content"));
    assert.ok(browserDialogRuntime.includes("container-item"));
    assert.ok(browserDialogRuntime.includes("preview-container-search"));
    assert.ok(browserDialogRuntime.includes("applyContainerSearchFilter"));
    assert.ok(browserDialogRuntime.includes("openContainerSearch"));
    assert.ok(browserDialogRuntime.includes("hoveredSearchContainer"));
    assert.ok(browserDialogRuntime.includes("autoSearchEnabled = true"));
    assert.ok(browserDialogRuntime.includes("dm-choice-list"));
    assert.ok(browserDialogRuntime.includes("dm-choice-item"));
    assert.ok(copyStatic.includes("shared\", \"shell-web\", \"pages"));
    assert.ok(packageJson.includes("\"dev:web-dialogr\""));
    assert.ok(packageJson.includes("--replace-port --product-path"));
    assert.ok(packageJson.includes("\"build:web-dialogr\""));
    assert.ok(packageJson.includes("\"verify:web-dialogr-deployment\""));
    assert.ok(copyStatic.includes("webRuntimeDependencies"));
    assert.ok(copyStatic.includes("\"webr\""));
    assert.ok(webServer.includes("replaceListeningPort(options.port)"));
    assert.ok(webServer.includes("lsof"));
    assert.ok(webServer.includes("https://github.com/dusadrian/binaries/releases/download/WebR"));
    assert.ok(webServer.includes("ensureProductWebRLibrary(productPath)"));
    assert.ok(webServer.includes("api.github.com/repos/dusadrian/binaries/releases/tags/WebR"));
    assert.ok(webServer.includes("isLocalReleaseAssetCurrent(targetPath, releaseAsset)"));
    assert.ok(webServer.includes("findRuntimeDependencyRoot(rootDir, sourceRoot, \"webr\", \"dist\")"));
    assert.ok(webServer.includes("using the existing local DialogR WebR package library"));
    assert.ok(webServer.includes("pathname === \"/webr/loader.js\""));
    assert.ok(webServer.includes("pathname === \"/start\""));
    assert.ok(webServer.includes("DIALOGFORGE_LAUNCH_DATA_ROOT"));
    assert.ok(webServer.includes("isSafeLaunchToken"));
};


const assertServerContracts = async function() {
    const previousLaunchDataRoot = process.env.DIALOGFORGE_LAUNCH_DATA_ROOT;
    const launchDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-launch-"));
    const launchToken = "EN-DS-26-0001";

    fs.writeFileSync(path.join(launchDataRoot, `${launchToken}.rds`), Buffer.from("rds"));
    fs.writeFileSync(path.join(launchDataRoot, `${launchToken}.json`), JSON.stringify({
        course: "contract-test",
        exercise: "launch-dataset"
    }));
    process.env.DIALOGFORGE_LAUNCH_DATA_ROOT = launchDataRoot;

    const server = serverModule.createWebDialogRDevServer({
        productPath: "/Users/dusadrian/Documents/GitHub/DialogR"
    });
    const port = await listen(server);

    try {
        const page = await request(port, "/");

        assert.strictEqual(page.statusCode, 200);
        assert.match(String(page.headers["content-type"]), /text\/html/);
        assert.ok(page.headers["cross-origin-opener-policy"]);
        assert.ok(page.headers["cross-origin-embedder-policy"]);
        assert.ok(page.body.toString("utf8").includes("DialogR Web"));

        const startPage = await request(port, "/start?k=EN-DS-26-0001");

        assert.strictEqual(startPage.statusCode, 200);
        assert.match(String(startPage.headers["content-type"]), /text\/html/);
        assert.ok(startPage.body.toString("utf8").includes("DialogR Web"));

        const launchMetadata = await request(port, `/api/launch/${launchToken}/metadata`);
        const launchMetadataJson = JSON.parse(launchMetadata.body.toString("utf8"));

        assert.strictEqual(launchMetadata.statusCode, 200);
        assert.strictEqual(launchMetadataJson.ok, true);
        assert.strictEqual(launchMetadataJson.token, launchToken);
        assert.strictEqual(launchMetadataJson.datasetName, "dataset");
        assert.strictEqual(launchMetadataJson.datasetFile, `${launchToken}.rds`);
        assert.strictEqual(launchMetadataJson.hasDataset, true);
        assert.strictEqual(launchMetadataJson.datasetUrl, `/api/launch/${launchToken}/dataset.rds`);

        const launchDataset = await request(port, launchMetadataJson.datasetUrl);

        assert.strictEqual(launchDataset.statusCode, 200);
        assert.strictEqual(launchDataset.body.toString("utf8"), "rds");
        assert.match(String(launchDataset.headers["content-type"]), /application\/octet-stream/);
        assert.match(String(launchDataset.headers["cache-control"]), /no-store/);

        const invalidLaunch = await request(port, "/api/launch/%2e%2e/dataset.rds");

        assert.strictEqual(invalidLaunch.statusCode, 400);

        const script = await request(port, "/shared/shell-web/pages/dialogr.js");

        assert.strictEqual(script.statusCode, 200);
        assert.match(String(script.headers["content-type"]), /javascript/);
        assert.ok(script.body.toString("utf8").includes("ensureRuntime"));
        assert.ok(script.body.toString("utf8").includes("/shared/shell-web/build/dialogr-web-manifest.json"));

        const composition = await request(port, "/api/composition");
        const compositionJson = JSON.parse(composition.body.toString("utf8"));

        assert.strictEqual(composition.statusCode, 200);
        assert.strictEqual(compositionJson.product.id, "DialogR");
        assert.strictEqual(compositionJson.runtime.id, "webr");
        assert.ok(compositionJson.menu.some((item) => {
            return item.id === "Analyze" || item.label === "Analyze";
        }));
        assert.ok(compositionJson.productDialogs.some((dialog) => {
            return dialog.id === "frequencies";
        }));

        const library = await request(port, "/api/webr-package-library");
        const libraryJson = JSON.parse(library.body.toString("utf8"));

        assert.strictEqual(library.statusCode, 200);
        assert.strictEqual(libraryJson.available, true);
        assert.strictEqual(libraryJson.mountpoint, "/dialogr-library");
        assert.deepStrictEqual(libraryJson.requiredForNativeHelpExamples, [
            "knitr",
            "evaluate",
            "highr",
            "xfun",
            "yaml"
        ]);
        assert.ok(libraryJson.recommendedPackages.includes("knitr"));
        assert.ok(!libraryJson.recommendedPackages.includes("webrmoodle"));

        const libraryData = await request(port, libraryJson.dataUrl);

        assert.strictEqual(libraryData.statusCode, 200);
        assert.ok(libraryData.body.length > 1000);

        const dialog = await request(port, "/api/dialog/frequencies");
        const dialogJson = JSON.parse(dialog.body.toString("utf8"));

        assert.strictEqual(dialog.statusCode, 200);
        assert.strictEqual(dialogJson.definition.id, "frequencies");
        assert.ok(dialogJson.source);
        assert.deepStrictEqual(dialogJson.runtimeRequirements.rPackages, ["admisc", "declared"]);

        const webr = await request(port, "/webr/webr.js");

        assert.strictEqual(webr.statusCode, 200);
        assert.match(String(webr.headers["content-type"]), /javascript/);
        assert.ok(webr.body.length > 1000);

        const webrLoaderAlias = await request(port, "/webr/loader.js");

        assert.strictEqual(webrLoaderAlias.statusCode, 200);
        assert.match(String(webrLoaderAlias.headers["content-type"]), /javascript/);
        assert.ok(webrLoaderAlias.body.includes("WebR"));

        const monaco = await request(port, "/monaco/vs/loader.js");

        assert.strictEqual(monaco.statusCode, 200);
        assert.match(String(monaco.headers["content-type"]), /javascript/);
        assert.ok(monaco.body.length > 1000);
    }
    finally {
        await close(server);
        fs.rmSync(launchDataRoot, {
            force: true,
            recursive: true
        });

        if (typeof previousLaunchDataRoot === "string") {
            process.env.DIALOGFORGE_LAUNCH_DATA_ROOT = previousLaunchDataRoot;
        }
        else {
            delete process.env.DIALOGFORGE_LAUNCH_DATA_ROOT;
        }
    }
};


const assertRenderedContracts = async function() {
    const server = serverModule.createWebDialogRDevServer({
        productPath: "/Users/dusadrian/Documents/GitHub/DialogR"
    });
    const port = await listen(server);
    const browser = await chromium.launch();

    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

        await page.goto(`http://127.0.0.1:${port}/`, {
            waitUntil: "domcontentloaded"
        });
        await page.locator("#webMenuBar").waitFor({ state: "visible" });
        assert.strictEqual(await page.locator(".web-toolbar").count(), 0);
        assert.strictEqual(await page.locator("#startRuntime").count(), 0);
        assert.strictEqual(await page.locator("#runtimeStatus").count(), 0);
        await page.locator("#webDesktop").waitFor({ state: "visible" });
        await page.locator("#webWorkbenchWindow").waitFor({ state: "visible" });
        const workbenchBox = await page.locator("#webWorkbenchWindow").boundingBox();

        assert.ok(workbenchBox && workbenchBox.width > 700 && workbenchBox.height > 400);
        assert.strictEqual(
            await page.locator('#webWorkbenchWindow .web-workbench-resize-handle[data-resize-direction="corner"]').isVisible(),
            true
        );
        assert.strictEqual(await page.locator("#commandPane").isVisible(), false);
        assert.strictEqual(await page.locator("#mainSplitter").isVisible(), false);
        assert.strictEqual(await page.locator("#consoleArea").isVisible(), true);
        assert.ok(await page.evaluate(() => {
            const windowEl = document.getElementById("webWorkbenchWindow");
            const consoleEl = document.getElementById("consoleTerminal");
            const workspaceEl = document.getElementById("workspaceSummary");
            const commandEl = document.getElementById("command");
            const commandPane = document.getElementById("commandPane");

            return Boolean(
                windowEl
                && commandEl
                && commandPane
                && consoleEl
                && workspaceEl
                && document.body.classList.contains("command-pane-hidden")
                && getComputedStyle(commandPane).display === "none"
                && windowEl.contains(commandEl)
                && windowEl.contains(consoleEl)
                && windowEl.contains(workspaceEl)
                && getComputedStyle(windowEl).resize === "both"
            );
        }));
        assert.strictEqual(
            await page.locator("#consoleToolbarStart").isVisible(),
            false
        );
        assert.strictEqual(
            await page.locator("#consoleToolbarStop").isVisible(),
            false
        );
        assert.ok(await page.locator("#consoleToolbarRestartWorkspace .dm-toolbar-svg-icon-restartworkspace").count() === 1);
        {
            const beforeDrag = await page.locator("#webWorkbenchWindow").boundingBox();

            await page.mouse.move(beforeDrag.x + 120, beforeDrag.y + 14);
            await page.mouse.down();
            await page.mouse.move(beforeDrag.x + 170, beforeDrag.y + 44);
            await page.mouse.up();

            const afterDrag = await page.locator("#webWorkbenchWindow").boundingBox();

            assert.ok(afterDrag.x > beforeDrag.x + 20);
            assert.ok(afterDrag.y > beforeDrag.y + 10);
        }
        {
            const beforeResize = await page.locator("#webWorkbenchWindow").boundingBox();
            const handle = await page.locator('#webWorkbenchWindow .web-workbench-resize-handle[data-resize-direction="corner"]').boundingBox();

            await page.mouse.move(handle.x + handle.width - 3, handle.y + handle.height - 3);
            await page.mouse.down();
            await page.mouse.move(handle.x + handle.width - 83, handle.y + handle.height - 63);
            await page.mouse.up();

            const afterResize = await page.locator("#webWorkbenchWindow").boundingBox();

            assert.ok(afterResize.width < beforeResize.width - 40);
            assert.ok(afterResize.height < beforeResize.height - 30);
        }
        await page.locator('[data-console-transcript-island="preact"]').waitFor({
            state: "attached",
            timeout: 10000
        });

        await page.waitForFunction(() => {
            return window.dialogForgeWebConsole?.session?.getSessionPhase?.() === "ready";
        }, { timeout: 90000 });
        await page.locator("#consoleTerminal .monaco-editor").waitFor({
            state: "visible",
            timeout: 20000
        });
        await page.evaluate(() => {
            window.__dialogForgeConsoleClipboardReadCount = 0;
            Object.defineProperty(navigator, "clipboard", {
                configurable: true,
                value: {
                    readText: async () => {
                        window.__dialogForgeConsoleClipboardReadCount += 1;
                        return "should-not-be-read";
                    },
                    writeText: async () => {}
                }
            });

            window.dialogForgeWebConsole.coordinator.setText("");
            window.dialogForgeWebConsole.coordinator.focus();
        });
        await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
        assert.strictEqual(
            await page.evaluate(() => window.__dialogForgeConsoleClipboardReadCount),
            0
        );
        await page.evaluate(() => {
            const target = document.querySelector("#consoleTerminal .monaco-editor textarea")
                || document.querySelector("#consoleTerminal .monaco-editor");
            const event = new Event("paste", {
                bubbles: true,
                cancelable: true
            });

            Object.defineProperty(event, "clipboardData", {
                value: {
                    getData: (type) => {
                        return type === "text/plain" ? "paste_probe <- 42" : "";
                    }
                }
            });
            target.dispatchEvent(event);
        });
        await page.waitForFunction(() => {
            return window.dialogForgeWebConsole.coordinator.getText() === "paste_probe <- 42";
        });
        await page.evaluate(() => {
            window.dialogForgeWebConsole.coordinator.setText("");
        });
        await page.locator("#consoleCwdText", {
            hasText: "~/DialogR"
        }).waitFor({ timeout: 10000 });
        await page.evaluate(async () => {
            await window.dialogForgeWebConsole.executeVisibleCommand("data(iris); iris <- as.data.frame(iris)");
        });
        await page.locator("#consoleActiveDataset", {
            hasText: "iris"
        }).waitFor({ timeout: 10000 });
        await page.evaluate(() => {
            const transcript = window.dialogForgeWebConsole?.coordinator?.getTranscript?.();

            for (let index = 1; index <= 140; index += 1) {
                const parentId = `scroll_probe_${index}`;

                transcript.recordRuntimeMessageInput({
                    id: `${parentId}_input`,
                    parent_id: parentId,
                    code: `scroll_probe_${index}`
                });
                transcript.recordRuntimeMessageStream({
                    id: `${parentId}_output`,
                    parent_id: parentId,
                    text: `scroll probe line ${index}\n`
                });
                transcript.recordRuntimeMessageState({
                    parent_id: parentId,
                    state: "idle"
                });
            }
        });
        await page.locator("#consoleTerminal", {
            hasText: "scroll probe line 140"
        }).waitFor({ timeout: 10000 });
        {
            const scrollGeometry = await page.evaluate(async () => {
                const island = document.querySelector('[data-console-transcript-island="preact"]');
                const viewport = island?.parentElement?.parentElement?.parentElement;

                if (!(viewport instanceof HTMLElement)) {
                    return null;
                }

                viewport.scrollTop = Math.floor(viewport.scrollHeight * 0.45);
                await new Promise((resolve) => {
                    requestAnimationFrame(() => requestAnimationFrame(resolve));
                });

                const viewportRect = viewport.getBoundingClientRect();
                const rows = Array.from(document.querySelectorAll("[data-console-transcript-row]"))
                    .filter((row) => {
                        const rect = row.getBoundingClientRect();

                        return rect.bottom > viewportRect.top
                            && rect.top < viewportRect.bottom;
                    });
                const firstRect = rows[0]?.getBoundingClientRect();

                return {
                    visibleRows: rows.length,
                    firstVisibleGap: firstRect ? firstRect.top - viewportRect.top : null,
                    viewportHeight: viewportRect.height,
                    scrollTop: viewport.scrollTop
                };
            });

            assert.ok(scrollGeometry, "console transcript viewport must be discoverable");
            assert.ok(scrollGeometry.visibleRows > 0, "scrolled console viewport must contain transcript rows");
            assert.ok(
                scrollGeometry.firstVisibleGap !== null
                    && scrollGeometry.firstVisibleGap < Math.max(80, scrollGeometry.viewportHeight * 0.2),
                `scrolled console text must not be cut away from the top of the viewport: ${JSON.stringify(scrollGeometry)}`
            );
            await page.evaluate(() => {
                const viewport = document.querySelector("#consoleTerminal")?.firstElementChild;

                if (viewport instanceof HTMLElement) {
                    viewport.scrollTop = viewport.scrollHeight;
                }

                window.dialogForgeWebConsole.coordinator.setText("");
                window.dialogForgeWebConsole.coordinator.focus();
            });
            await page.evaluate(() => {
                const target = document.querySelector("#consoleTerminal .monaco-editor textarea")
                    || document.querySelector("#consoleTerminal .monaco-editor");
                const event = new Event("paste", {
                    bubbles: true,
                    cancelable: true
                });
                const text = [
                    "DF <- data.frame(",
                    "    Area = declared(",
                    "        sample(1:2, 215, replace = TRUE, prob = c(0.45, 0.55)),",
                    "        labels = c(Rural = 1, Urban = 2)",
                    "    ),",
                    "    Gender = declared(",
                    "        sample(1:2, 215, replace = TRUE, prob = c(0.55, 0.45)),",
                    "        labels = c(Males = 1, Females = 2)",
                    "    ),",
                    "    Age = sample(18:90, 215, replace = TRUE),",
                    "    Children = sample(0:5, 215, replace = TRUE)",
                    ")"
                ].join("\n");

                Object.defineProperty(event, "clipboardData", {
                    value: {
                        getData: (type) => {
                            return type === "text/plain" ? text : "";
                        }
                    }
                });
                target.dispatchEvent(event);
            });
            await page.waitForFunction(() => {
                return window.dialogForgeWebConsole.coordinator.getText().includes("Children = sample(0:5");
            });
            await page.waitForFunction(() => {
                const viewport = document.querySelector("#consoleTerminal")?.firstElementChild;
                const editor = document.querySelector("#consoleTerminal .monaco-editor");

                if (!(viewport instanceof HTMLElement) || !(editor instanceof HTMLElement)) {
                    return false;
                }

                const viewportRect = viewport.getBoundingClientRect();
                const editorRect = editor.getBoundingClientRect();

                return editorRect.bottom <= viewportRect.bottom + 2;
            });
            await page.evaluate(() => {
                window.dialogForgeWebConsole.coordinator.setText("");
            });
            await page.evaluate(() => {
                window.dialogForgeWebConsole?.coordinator?.getTranscript?.()?.clear?.();
            });
        }
        await page.locator("#workspaceSummary .workspace-variable-row.active-dataset", {
            hasText: "iris"
        }).waitFor({ timeout: 10000 });
        await page.locator("#workspaceSummary .workspace-group-header", {
            hasText: "Datasets"
        }).waitFor({ timeout: 10000 });
        await page.locator("#workspaceSummary .workspace-variable-summary", {
            hasText: "[150 rows x 5 columns]"
        }).waitFor({ timeout: 10000 });
        assert.deepStrictEqual(
            await page.evaluate(() => {
                return Array.from(document.querySelectorAll("[data-console-input-line]")).map((line) => {
                    return String(line.dataset.consoleInputCode || "");
                });
            }),
            []
        );
        assert.strictEqual(await page.locator("#workspaceSummary .workspace-broom-icon").count(), 1);
        assert.strictEqual(await page.locator("#workspaceSummary .workspace-variable-delete .codicon-trash").count(), 1);
        assert.strictEqual(await page.locator("#workspaceSummary [data-workspace-clear]").isDisabled(), false);
        assert.strictEqual(await page.locator("#workspaceSummary .workspace-variable-delete").isVisible(), false);
        await page.locator("#workspaceSummary .workspace-variable-row", {
            hasText: "iris"
        }).hover();
        assert.strictEqual(await page.locator("#workspaceSummary .workspace-variable-delete").isVisible(), true);
        assert.strictEqual(
            await page.locator("#workspaceSummary", {
                hasText: "WebR session"
            }).count(),
            0
        );
        await page.evaluate(async () => {
            await window.dialogForgeWebConsole.executeVisibleCommand("mtcars <- as.data.frame(mtcars)");
        });
        await page.locator("#workspaceSummary [data-workspace-variable=\"mtcars\"]").waitFor({ timeout: 30000 });
        await page.locator("#workspaceSummary [data-workspace-variable=\"mtcars\"]").click();
        await page.locator("#workspaceSummary .workspace-variable-row.active-dataset", {
            hasText: "mtcars"
        }).waitFor({ timeout: 10000 });
        await page.locator("#consoleToolbar", {
            hasText: "Active: mtcars"
        }).waitFor({ timeout: 10000 });
        await page.locator("#workspaceSummary [data-workspace-variable=\"iris\"]").click();
        await page.locator("#workspaceSummary .workspace-variable-row.active-dataset", {
            hasText: "iris"
        }).waitFor({ timeout: 10000 });
        await page.evaluate(async () => {
            await window.dialogForgeWebConsole.executeVisibleCommand([
                "iris$Sepal.Width <- declared::declared(",
                "    iris$Sepal.Width,",
                "    na_range = c(3, 4)",
                ")"
            ].join("\n"));
        });
        await page.locator("#workspaceSummary [data-workspace-variable=\"iris\"]").dblclick();
        await page.locator(".dialogforge-web-data-editor-window", {
            hasText: "Data editor: iris"
        }).waitFor({ state: "visible", timeout: 30000 });
        await page.locator("#datasetEditorPanelData.is-active #datasetEditorDataScroll", {
            hasText: "Sepal.Length"
        }).waitFor({ timeout: 30000 });
        await page.locator("#datasetEditorDataScroll", {
            hasText: "setosa"
        }).waitFor({ timeout: 30000 });
        await page.locator('#datasetEditorDataScroll td[data-row-index="1"][data-column-name="Sepal.Width"].is-declared-missing').waitFor({
            timeout: 30000
        });
        await page.locator('#datasetEditorDataScroll td[data-row-index="1"][data-column-name="Sepal.Length"]').dblclick();
        await page.locator('#datasetEditorDataScroll td[data-row-index="1"][data-column-name="Sepal.Length"] input').fill("42.5");
        await page.keyboard.press("Enter");
        await page.locator('#datasetEditorDataScroll td[data-row-index="1"][data-column-name="Sepal.Length"]', {
            hasText: "42.5"
        }).waitFor({ timeout: 30000 });
        await page.evaluate(() => {
            window.__dialogForgeClipboardText = "";
            Object.defineProperty(navigator, "clipboard", {
                configurable: true,
                value: {
                    writeText: async (text) => {
                        window.__dialogForgeClipboardText = String(text || "");
                    },
                    readText: async () => {
                        return String(window.__dialogForgeClipboardText || "");
                    }
                }
            });
        });
        await page.locator('#datasetEditorDataScroll td[data-row-index="1"][data-column-name="Sepal.Length"]').click();
        await page.keyboard.press(process.platform === "darwin" ? "Meta+C" : "Control+C");
        assert.strictEqual(
            await page.evaluate(() => window.__dialogForgeClipboardText),
            "42.5"
        );
        await page.locator('#datasetEditorDataScroll td[data-row-index="1"][data-column-name="Sepal.Width"]').click();
        await page.evaluate(() => {
            const target = document.querySelector(
                '#datasetEditorDataScroll td[data-row-index="1"][data-column-name="Sepal.Width"]'
            );
            const event = new Event("paste", {
                bubbles: true,
                cancelable: true
            });

            Object.defineProperty(event, "clipboardData", {
                value: {
                    getData: (type) => {
                        return type === "text/plain" ? "7.25" : "";
                    }
                }
            });
            target.dispatchEvent(event);
        });
        await page.locator('#datasetEditorDataScroll td[data-row-index="1"][data-column-name="Sepal.Width"]', {
            hasText: "7.25"
        }).waitFor({ timeout: 30000 });
        await page.locator("#datasetEditorTabVariables").click();
        await page.locator("#datasetEditorPanelVariables.is-active #datasetEditorVariablesScroll").waitFor({ timeout: 30000 });
        {
            const nameHeader = page.locator('#datasetEditorVariablesScroll th[data-variable-column="name"]');
            const resizeHandle = page.locator('#datasetEditorVariablesScroll [data-variable-column-resize="name"]');
            const before = await nameHeader.boundingBox();

            assert.ok(before && before.width > 0);
            await resizeHandle.hover();
            await page.mouse.down();
            await page.mouse.move(before.x + before.width + 48, before.y + before.height / 2);
            await page.mouse.up();

            const after = await nameHeader.boundingBox();

            assert.ok(after && after.width > before.width + 30);
        }
        assert.strictEqual(
            await page.locator('#datasetEditorVariablesScroll input[data-variable-field="name"][data-variable-index="5"]').inputValue(),
            "Species"
        );
        await page.locator("#datasetEditorVariablesScroll", {
            hasText: "factor"
        }).waitFor({ timeout: 30000 });
        await page.locator('#datasetEditorVariablesScroll tr[data-variable-index="2"] td[data-column="values"]', {
            hasText: "range 3:4"
        }).waitFor({ timeout: 30000 });
        await page.locator('#datasetEditorVariablesScroll tr[data-variable-index="2"] td[data-column="values"]').hover();
        await page.locator('#datasetEditorVariablesScroll [data-variable-values-editor="2"]').click();
        await page.locator(".dialogforge-web-value-labels-window", {
            hasText: "Sepal.Width"
        }).waitFor({ state: "visible", timeout: 30000 });
        assert.strictEqual(
            await page.locator("#datasetValueLabelsRangeEnabled").isChecked(),
            true
        );
        assert.strictEqual(
            await page.locator("#datasetValueLabelsRangeMin").inputValue(),
            "3"
        );
        assert.strictEqual(
            await page.locator("#datasetValueLabelsRangeMax").inputValue(),
            "4"
        );
        await page.locator(".dialogforge-web-value-labels-window .dialogforge-web-dialog__close").click();
        await page.locator(".dialogforge-web-value-labels-layer").waitFor({ state: "detached", timeout: 30000 });
        await page.locator('#datasetEditorVariablesScroll input[data-variable-field="label"][data-variable-index="5"]').fill("Flower species");
        await page.keyboard.press("Enter");
        await page.locator('#datasetEditorVariablesScroll input[data-variable-field="label"][data-variable-index="5"]').waitFor({ state: "attached", timeout: 30000 });
        assert.strictEqual(
            await page.locator('#datasetEditorVariablesScroll input[data-variable-field="label"][data-variable-index="5"]').inputValue(),
            "Flower species"
        );
        await page.locator('#datasetEditorVariablesScroll select[data-variable-field="measure"][data-variable-index="5"]').selectOption("ordinal");
        assert.strictEqual(
            await page.locator('#datasetEditorVariablesScroll select[data-variable-field="measure"][data-variable-index="5"]').inputValue(),
            "ordinal"
        );
        await page.locator('#datasetEditorVariablesScroll tr[data-variable-index="5"] td[data-column="values"]').hover();
        await page.locator('#datasetEditorVariablesScroll [data-variable-values-editor="5"]').click();
        await page.locator(".dialogforge-web-value-labels-window", {
            hasText: "Species"
        }).waitFor({ state: "visible", timeout: 30000 });
        await page.locator('.dialogforge-web-value-labels-window input[data-value-label-label="0"]').fill("Setosa");
        await page.locator('.dialogforge-web-value-labels-window input[data-value-label-missing="0"]').check();
        await page.locator(".dialogforge-web-value-labels-action--primary").click();
        await page.locator(".dialogforge-web-value-labels-layer").waitFor({ state: "detached", timeout: 30000 });
        await page.locator('#datasetEditorVariablesScroll td[data-column="values"]', {
            hasText: "Setosa"
        }).waitFor({ timeout: 30000 });
        await page.locator('#datasetEditorVariablesScroll tr[data-variable-index="5"] td[data-column="values"]').hover();
        await page.locator('#datasetEditorVariablesScroll [data-variable-values-editor="5"]').click();
        await page.locator('.dialogforge-web-value-labels-window input[data-value-label-missing="0"]').waitFor({ timeout: 30000 });
        assert.strictEqual(
            await page.locator('.dialogforge-web-value-labels-window input[data-value-label-missing="0"]').isChecked(),
            true
        );
        await page.locator('.dialogforge-web-value-labels-window input[data-value-label-missing="0"]').uncheck();
        await page.locator('.dialogforge-web-value-labels-window input[data-value-label-label="0"]').fill("setosa");
        await page.locator(".dialogforge-web-value-labels-action--primary").click();
        await page.locator(".dialogforge-web-value-labels-layer").waitFor({ state: "detached", timeout: 30000 });
        await page.locator('#datasetEditorVariablesScroll td[data-column="values"]', {
            hasText: "setosa"
        }).waitFor({ timeout: 30000 });
        await page.locator(".dialogforge-web-data-editor-window .dialogforge-web-dialog__close").click();
        await page.locator(".dialogforge-web-data-editor-layer").waitFor({ state: "detached", timeout: 10000 });
        await page.evaluate(() => {
            window.dialogForgeWebConsole?.coordinator?.focus?.();
        });
        assert.strictEqual(
            await page.locator("#consoleToolbarRestart").isDisabled(),
            false
        );
        assert.ok(
            String(await page.locator("#consoleTerminal .margin-view-overlays").textContent())
                .includes(">")
        );
        assert.strictEqual(
            await page.evaluate(() => window.dialogForgeWebConsole.coordinator.getText()),
            ""
        );
        await page.evaluate(() => {
            window.dialogForgeWebConsole.coordinator.setText("1 + 1");
            window.dialogForgeWebConsole.coordinator.focus();
        });
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => {
            return document.body.classList.contains("console-runtime-busy")
                || document.querySelector("#consoleTerminal")?.textContent?.includes("[1] 2");
        });
        assert.ok(await page.evaluate(() => {
            if (!document.body.classList.contains("console-runtime-busy")) {
                return true;
            }

            return Boolean(document.querySelector("#consoleToolbarStop")?.offsetParent);
        }));
        await page.locator("#consoleTerminal", {
            hasText: "[1] 2"
        }).waitFor({ timeout: 30000 });
        assert.ok(await page.evaluate(() => {
            return window.dialogForgeWebConsole.commandHistory
                .getInputHistory()
                .includes("1 + 1");
        }));
        await page.evaluate(() => {
            window.dialogForgeWebConsole.coordinator.setText("iris$");
        });
        assert.ok(await page.evaluate(async () => {
            const model = window.dialogForgeWebConsole.completionModel;
            const context = model.getCompletionContext("iris$");
            const suggestions = await model.getRuntimeCompletionSuggestions(
                context,
                "iris$",
                6,
                1000
            );

            return suggestions.some((item) => {
                return String(item.label || "") === "Species";
            });
        }));
        await page.evaluate(() => {
            window.dialogForgeWebConsole.coordinator.setText("mean");
            window.dialogForgeWebConsole.coordinator.focus();
        });
        await page.waitForFunction(() => {
            return document.activeElement?.classList?.contains("native-edit-context");
        }, null, { timeout: 10000 });
        await page.keyboard.press("F1");
        await page.locator(".dialogforge-web-help-window", {
            hasText: "R Help"
        }).waitFor({ state: "visible", timeout: 30000 });
        {
            const beforeHelpResize = await page.locator(".dialogforge-web-help-window").boundingBox();
            const helpResizeHandle = await page.locator('.dialogforge-web-help-window .web-workbench-resize-handle[data-resize-direction="corner"]').boundingBox();

            assert.ok(beforeHelpResize && helpResizeHandle);
            await page.mouse.move(
                helpResizeHandle.x + helpResizeHandle.width - 3,
                helpResizeHandle.y + helpResizeHandle.height - 3
            );
            await page.mouse.down();
            await page.mouse.move(
                helpResizeHandle.x + helpResizeHandle.width - 83,
                helpResizeHandle.y + helpResizeHandle.height - 63
            );
            await page.mouse.up();

            const afterHelpResize = await page.locator(".dialogforge-web-help-window").boundingBox();

            assert.ok(afterHelpResize && afterHelpResize.width < beforeHelpResize.width - 40);
            assert.ok(afterHelpResize && afterHelpResize.height < beforeHelpResize.height - 30);
        }
        const helpShell = page.frameLocator(".dialogforge-web-help-frame");
        const helpDocument = helpShell.frameLocator("#helpFrame");

        await helpDocument.locator("body", {
            hasText: "mean"
        }).waitFor({ timeout: 30000 });
        await page.locator(".dialogforge-web-help-window", {
            hasText: "R Help - R:"
        }).waitFor({ state: "visible", timeout: 30000 });
        assert.strictEqual(await helpShell.locator("#helpRunExamples").count(), 0);
        await helpDocument.locator("[class^='mtk'], [class*=' mtk']").first().waitFor({ timeout: 30000 });
        assert.ok(await page.evaluate(async () => {
            const result = await window.dialogForge.fetchRHelpPage(
                `${window.location.origin}/library/base/html/mean.html`
            );

            return result
                && result.ok === true
                && /Arithmetic Mean|mean/.test(String(result.text || ""));
        }));
        assert.ok(await page.evaluate(async () => {
            const result = await window.dialogForge.fetchRHelpPage(
                `${window.location.origin}/library/base/html/00Index.html`
            );

            return result
                && result.ok === true
                && String(result.text || "").includes("The R Base Package")
                && String(result.text || "").includes("mean.html");
        }));
        const exampleFetch = await page.evaluate(async () => {
            const result = await window.dialogForge.fetchRHelpPage(
                `${window.location.origin}/library/base/Example/mean`
            );

            return {
                ok: Boolean(result && result.ok === true),
                text: String(result?.text || "")
            };
        });
        const hasNativeExamplePage = exampleFetch.ok
            && exampleFetch.text.includes("Examples for")
            && exampleFetch.text.includes("class=\"source\"");

        assert.strictEqual(exampleFetch.ok, true);
        assert.strictEqual(exampleFetch.text.includes("mean>"), false);
        if (!hasNativeExamplePage) {
            assert.ok(
                exampleFetch.text.includes("knitr"),
                "WebR help examples must either render the native R examples page or explain that knitr is missing"
            );
        }
        await helpDocument.locator("a", { hasText: "Run examples" }).click();
        if (hasNativeExamplePage) {
            await helpDocument.locator("body", {
                hasText: "Examples for"
            }).waitFor({ timeout: 30000 });
            await helpDocument.locator(".source").first().waitFor({ timeout: 30000 });
            await helpDocument.locator("[class^='mtk'], [class*=' mtk']").first().waitFor({ timeout: 30000 });
        }
        else {
            await helpDocument.locator("body", {
                hasText: "knitr"
            }).waitFor({ timeout: 30000 });
        }
        assert.strictEqual(await helpDocument.locator("body", { hasText: "mean>" }).count(), 0);
        assert.strictEqual(
            await page.locator("#consoleTerminal", {
                hasText: 'example("mean", package = "base")'
            }).count(),
            0
        );
        await page.locator(".dialogforge-web-help-window .dialogforge-web-dialog__close").click();
        await page.locator(".dialogforge-web-help-layer").waitFor({ state: "detached" });
        await page.evaluate(async () => {
            await window.dialogForgeWebConsole.executeVisibleCommand("library(declared)");
            window.dialogForgeWebConsole.coordinator.setText("?wtable");
            window.dialogForgeWebConsole.coordinator.focus();
        });
        await page.keyboard.press("Enter");
        await page.locator(".dialogforge-web-help-window", {
            hasText: "R Help"
        }).waitFor({ state: "visible", timeout: 30000 });
        await page.frameLocator(".dialogforge-web-help-frame").frameLocator("#helpFrame").locator("body", {
            hasText: "Compute weighted summaries for declared objects"
        }).waitFor({ timeout: 30000 });
        await page.locator(".dialogforge-web-help-window .dialogforge-web-dialog__close").click();
        await page.locator(".dialogforge-web-help-layer").waitFor({ state: "detached" });
        await page.evaluate(() => {
            window.dialogForgeWebConsole.coordinator.setText("?plot");
            window.dialogForgeWebConsole.coordinator.focus();
        });
        await page.keyboard.press("Enter");
        await page.locator(".dialogforge-web-help-window", {
            hasText: "R Help: plot"
        }).waitFor({ state: "visible", timeout: 30000 });
        await page.frameLocator(".dialogforge-web-help-frame").frameLocator("#helpFrame").locator("body", {
            hasText: "plot"
        }).waitFor({ timeout: 30000 });
        await page.locator("#consoleTerminal", {
            hasText: "No default value"
        }).waitFor({ state: "detached", timeout: 1000 }).catch(() => {});
        await page.locator(".dialogforge-web-help-window .dialogforge-web-dialog__close").click();
        await page.locator(".dialogforge-web-help-layer").waitFor({ state: "detached" });
        const plotWarmup = await page.evaluate(async () => {
            return window.dialogForgeWebConsole.waitForPlotWarmup();
        });
        assert.strictEqual(plotWarmup.frameReady, true);
        assert.strictEqual(plotWarmup.graphicsWarm, true);
        await page.evaluate(() => {
            window.dialogForgeWebConsole.coordinator.setText("plot(1:11)");
            window.dialogForgeWebConsole.coordinator.focus();
        });
        const firstPlotStartedAt = Date.now();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => {
            const layer = document.querySelector(".dialogforge-web-plot-layer");

            return layer
                && getComputedStyle(layer).display !== "none"
                && layer.classList.contains("dialogforge-web-dialog-layer");
        }, null, { timeout: 30000 });
        const firstPlotVisibleAt = Date.now();
        const plotFrame = page.frameLocator(".dialogforge-web-plot-frame");
        await plotFrame.locator("#frame").waitFor({ state: "visible", timeout: 30000 });
        await page.waitForFunction(() => {
            const frame = document.querySelector(".dialogforge-web-plot-frame");
            const image = frame?.contentDocument?.querySelector("#frame");

            return image
                && String(image.getAttribute("src") || "").startsWith("blob:")
                && image.naturalWidth > 0
                && image.naturalHeight > 0;
        }, null, { timeout: 30000 });
        const firstPlotImageReadyAt = Date.now();
        assert.ok(
            firstPlotImageReadyAt - firstPlotVisibleAt < 500,
            `First plot should render quickly after modal visibility; observed ${firstPlotImageReadyAt - firstPlotVisibleAt}ms after ${firstPlotVisibleAt - firstPlotStartedAt}ms command latency.`
        );
        assert.ok(
            firstPlotImageReadyAt - firstPlotStartedAt < 1800,
            `First warmed plot should not move the startup wait to the console; observed ${firstPlotImageReadyAt - firstPlotStartedAt}ms from command submission to rendered image.`
        );
        await page.evaluate(async () => {
            await window.dialogForgeWebConsole.executeVisibleCommand("plot(1:7)");
        });
        await page.waitForFunction(() => {
            const frame = document.querySelector(".dialogforge-web-plot-frame");
            const history = frame?.contentDocument?.querySelectorAll(".plot-thumb");
            const image = frame?.contentDocument?.querySelector("#frame");

            return history
                && history.length >= 2
                && image
                && String(image.getAttribute("src") || "").startsWith("blob:")
                && image.naturalWidth > 0
                && image.naturalHeight > 0;
        }, null, { timeout: 30000 });
        await plotFrame.locator("#saveButton").click();
        assert.deepStrictEqual(
            await plotFrame.locator("#saveFormatSelect option").evaluateAll((options) => {
                return options.map((option) => option.value);
            }),
            ["png"]
        );
        await plotFrame.locator("#saveCancelButton").click();
        await plotFrame.locator(".plot-thumb").first().click();
        await plotFrame.locator(".plot-thumb.is-active").waitFor({ state: "visible", timeout: 30000 });
        {
            const beforePlotResize = await page.locator(".dialogforge-web-plot-window").boundingBox();
            const plotResizeHandle = await page.locator('.dialogforge-web-plot-window .web-workbench-resize-handle[data-resize-direction="corner"]').boundingBox();

            assert.ok(beforePlotResize && plotResizeHandle);
            await page.mouse.move(
                plotResizeHandle.x + plotResizeHandle.width - 3,
                plotResizeHandle.y + plotResizeHandle.height - 3
            );
            await page.mouse.down();
            await page.mouse.move(
                plotResizeHandle.x + plotResizeHandle.width - 83,
                plotResizeHandle.y + plotResizeHandle.height - 63
            );
            await page.mouse.up();

            const afterPlotResize = await page.locator(".dialogforge-web-plot-window").boundingBox();

            assert.ok(afterPlotResize && afterPlotResize.width < beforePlotResize.width - 40);
            assert.ok(afterPlotResize && afterPlotResize.height < beforePlotResize.height - 30);
        }
        await page.locator(".dialogforge-web-plot-window .dialogforge-web-dialog__close").click();
        await page.locator(".dialogforge-web-plot-layer").waitFor({ state: "detached" });
        await page.locator("#workspacePaneToggle").click();
        assert.ok(await page.evaluate(() => {
            return document.body.classList.contains("web-workspace-collapsed");
        }));
        assert.ok(await page.evaluate(() => {
            return Boolean(document.querySelector("#workspacePaneToggle .codicon-chevron-right"));
        }));
        await page.locator("#workspacePaneToggle").click();
        assert.ok(await page.evaluate(() => {
            return Boolean(document.querySelector("#workspacePaneToggle .codicon-chevron-left"));
        }));
        {
            const beforeToggle = await page.evaluate(() => {
                return {
                    consoleWidth: document.querySelector(".web-console").getBoundingClientRect().width,
                    toolbarHeight: document.getElementById("consoleToolbar").getBoundingClientRect().height,
                    workspaceHeaderHeight: document.querySelector(".workspace-pane-header").getBoundingClientRect().height
                };
            });

            await page.locator("#workspacePaneToggle").click();
            const collapsedToggle = await page.evaluate(() => {
                return {
                    consoleWidth: document.querySelector(".web-console").getBoundingClientRect().width,
                    workbenchWidth: document.getElementById("webWorkbenchWindow").getBoundingClientRect().width
                };
            });

            await page.locator("#workspacePaneToggle").click();
            const expandedToggle = await page.evaluate(() => {
                return {
                    consoleWidth: document.querySelector(".web-console").getBoundingClientRect().width,
                    workbenchWidth: document.getElementById("webWorkbenchWindow").getBoundingClientRect().width
                };
            });

            assert.ok(Math.abs(beforeToggle.consoleWidth - collapsedToggle.consoleWidth) < 2);
            assert.ok(Math.abs(beforeToggle.consoleWidth - expandedToggle.consoleWidth) < 2);
            assert.ok(expandedToggle.workbenchWidth > collapsedToggle.workbenchWidth + 200);
            assert.ok(Math.abs(beforeToggle.toolbarHeight - beforeToggle.workspaceHeaderHeight) < 1);
        }
        await page.locator("#consoleToolbarRestart").click();
        await page.waitForFunction(() => {
            return window.dialogForgeWebConsole?.session?.getSessionPhase?.() === "ready";
        }, { timeout: 90000 });
        await page.evaluate(async () => {
            await window.dialogForgeWebConsole.executeVisibleCommand("data(iris); iris <- as.data.frame(iris)");
        });
        await page.locator("#consoleActiveDataset", {
            hasText: "iris"
        }).waitFor({ timeout: 30000 });
        await page.waitForFunction(async () => {
            const model = window.dialogForgeWebConsole?.completionModel;
            const context = model?.getCompletionContext("iris$");

            if (!model || context?.objectName !== "iris") {
                return false;
            }

            const suggestions = await model.getRuntimeCompletionSuggestions(
                context,
                "iris$",
                6,
                1000
            );

            return suggestions.some((item) => String(item.label || "") === "Species");
        }, null, { timeout: 30000 });
        await page.evaluate(() => {
            window.dialogForgeWebConsole.coordinator.setText("if (TRUE) {");
            window.dialogForgeWebConsole.coordinator.focus();
        });
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => {
            return window.dialogForgeWebConsole.coordinator.getText().endsWith("\n");
        });
        assert.ok(
            String(await page.locator("#consoleTerminal .margin-view-overlays").textContent())
                .includes("+")
        );
        await page.evaluate(() => {
            window.dialogForgeWebConsole.coordinator.setText("");
        });
        await page.evaluate(() => {
            window.dialogForgeWebConsole.coordinator.setText("mean(x = 1:3)");
        });
        assert.ok(await page.evaluate(() => {
            const tokens = window.monaco.editor.tokenize("mean(x = 1:3)", "r")[0] || [];

            return tokens.some((token) => {
                return String(token.type || "").includes("function.call");
            });
        }));

        await page.locator("#webMenuBar .web-menu-button", {
            hasText: "Analyze"
        }).waitFor({ state: "visible" });
        await page.locator("#webMenuBar .web-menu-button", {
            hasText: "Edit"
        }).click();
        await page.locator('#webMenuBar .web-menu-separator[data-menu-separator="EditNavigationSeparator"]').waitFor({
            state: "visible"
        });
        assert.strictEqual(
            await page.locator("#webMenuBar .web-menu-item", {
                hasText: "EditNavigationSeparator"
            }).count(),
            0
        );
        await page.keyboard.press("Escape");
        await page.locator("#webMenuBar .web-menu-button", {
            hasText: "Analyze"
        }).click();
        await page.locator("#webMenuBar .web-menu-item", {
            hasText: "Descriptive statistics"
        }).waitFor({ state: "visible" });
        await page.keyboard.press("Escape");

        const openDialogFromMenu = async function(label, menuLabel = label) {
            await page.evaluate((targetLabel) => {
                const normalize = (value) => String(value || "").replace(/>$/, "").trim();
                const buttons = Array.from(document.querySelectorAll("#webMenuBar .web-menu-item"));
                const button = buttons.find((entry) => normalize(entry.textContent) === targetLabel);

                if (!button) {
                    throw new Error(`Menu item not found: ${targetLabel}`);
                }

                button.click();
            }, menuLabel);
        };

        await openDialogFromMenu("Script editor");
        await page.locator(".dialogforge-web-script-editor-window", {
            hasText: "Script editor"
        }).waitFor({ state: "visible", timeout: 30000 });
        await page.locator(".dialogforge-web-script-editor-window .monaco-editor").waitFor({ state: "visible", timeout: 30000 });
        await page.evaluate(() => {
            const models = window.monaco.editor.getModels();
            const scriptModel = models[models.length - 1];

            scriptModel.setValue("3 + 4");
        });
        await page.locator(".dialogforge-web-script-editor-window .dialogforge-web-dialog__title", {
            hasText: "•"
        }).waitFor({ timeout: 10000 });
        await page.locator(".dialogforge-web-script-editor-window .dm-script-btn", {
            hasText: "Run"
        }).click();
        await page.locator("#consoleTerminal", {
            hasText: "[1] 7"
        }).waitFor({ timeout: 30000 });
        await page.locator(".dialogforge-web-script-editor-window .dm-script-btn-new").click();
        await page.locator(".dialogforge-web-script-editor-window .dm-script-tab").nth(1).waitFor({ timeout: 10000 });
        assert.strictEqual(await page.locator(".dialogforge-web-script-editor-window .dm-script-tab").count(), 2);
        await page.evaluate(() => {
            const models = window.monaco.editor.getModels();
            const scriptModel = models[models.length - 1];

            scriptModel.setValue("10 + 5");
        });
        await page.locator(".dialogforge-web-script-editor-window .dm-script-btn", {
            hasText: "Run"
        }).click();
        await page.locator("#consoleTerminal", {
            hasText: "[1] 15"
        }).waitFor({ timeout: 30000 });
        await page.locator(".dialogforge-web-script-editor-window .dm-script-tab").first().click();
        await page.locator(".dialogforge-web-script-editor-window .dm-script-tab.active", {
            hasText: "Untitled.R •"
        }).waitFor({ timeout: 10000 });
        await page.locator(".dialogforge-web-script-editor-window .dialogforge-web-dialog__close").click();
        await page.locator("[data-script-editor-close-decision='dont-save']").click();
        await page.locator(".dialogforge-web-script-editor-layer").waitFor({ state: "detached", timeout: 10000 });

        const runDialog = async function(plan) {
            await openDialogFromMenu(plan.label);
            await page.locator(".dialogforge-web-dialog-layer").waitFor({ state: "visible" });
            await page.locator(".dialogforge-web-dialog__frame").waitFor({ state: "attached" });

            const frame = page.frameLocator(".dialogforge-web-dialog__frame");

            await frame.locator("#paper").waitFor({ state: "attached" });
            await frame.locator("#paper .dm-el").first().waitFor({ state: "visible" });
            await frame.locator(".smart-button").first().waitFor({ state: "visible" });

            const modalTitle = await page.locator(".dialogforge-web-dialog__title").textContent();
            const frameSource = await page.locator(".dialogforge-web-dialog__frame").getAttribute("src");
            const modalBox = await page.locator(".dialogforge-web-dialog").boundingBox();
            const frameBox = await page.locator(".dialogforge-web-dialog__frame").boundingBox();

            assert.strictEqual(modalTitle, plan.label);
            assert.ok(frameSource.includes(`dialog=${plan.id}`));
            assert.ok(modalBox && modalBox.width > 300 && modalBox.height > 200);
            if (plan.contentWidth && plan.contentHeight) {
                assert.ok(Math.abs(frameBox.width - plan.contentWidth) < 2);
                assert.ok(Math.abs(frameBox.height - plan.contentHeight) < 2);
            }

            const datasetSelection = (plan.selections || []).find((selection) => {
                return selection.name === "c_datasets";
            });

            if (datasetSelection) {
                await selectControl(frame, datasetSelection.name, datasetSelection.value);
            }

            if (plan.expectedOptions) {
                for (const expected of plan.expectedOptions) {
                    for (const value of expected.values) {
                        try {
                            await frame.locator(
                                `[data-control-name="${expected.name}"] .container-item`,
                                { hasText: value }
                            ).waitFor({ state: "visible", timeout: 30000 });
                        }
                        catch (error) {
                            const rendered = await frame.locator(`[data-control-name="${expected.name}"]`).evaluateAll((nodes) => {
                                return nodes.map((node) => {
                                    return {
                                        tag: node.tagName,
                                        classes: node.getAttribute("class"),
                                        text: node.textContent
                                    };
                                });
                            });

                            throw new Error(`Control ${expected.name} did not render expected option ${value}: ${JSON.stringify(rendered)}`);
                        }
                    }

                    const options = await frame.locator(
                        `[data-control-name="${expected.name}"] .container-item`
                    ).evaluateAll((rows) => {
                        return rows.map((row) => String(row.textContent || "").trim()).filter(Boolean);
                    });

                    assert.deepStrictEqual(options, expected.values);

                    if (expected.disabledValues) {
                        const disabledOptions = await frame.locator(
                            `[data-control-name="${expected.name}"] .container-item-disabled`
                        ).evaluateAll((rows) => {
                            return rows.map((row) => String(row.textContent || "").trim()).filter(Boolean);
                        });

                        assert.deepStrictEqual(disabledOptions, expected.disabledValues);
                    }
                }
            }

            if (plan.expectedLoadedPackages) {
                for (const packageName of plan.expectedLoadedPackages) {
                    await page.locator("#consoleTerminal", {
                        hasText: `library(${packageName})`
                    }).waitFor({ timeout: 30000 });
                }
            }

            if (plan.expectedSearch) {
                await frame.locator(
                    `[data-control-name="${plan.expectedSearch.name}"] .container-item`,
                    { hasText: plan.expectedSearch.beforeVisible }
                ).waitFor({ state: "visible" });
                await frame.locator(`.dm-el.container[data-control-name="${plan.expectedSearch.name}"]`).hover();
                await page.keyboard.press("Control+F");
                await frame.locator(".preview-container-search-input").waitFor({ state: "visible" });
                await frame.locator(".preview-container-search-input").fill(plan.expectedSearch.query);
                await frame.locator(
                    `[data-control-name="${plan.expectedSearch.name}"] .container-item`,
                    { hasText: plan.expectedSearch.afterVisible }
                ).waitFor({ state: "visible" });
                assert.strictEqual(
                    await frame.locator(
                        `[data-control-name="${plan.expectedSearch.name}"] .container-item`,
                        { hasText: plan.expectedSearch.afterHidden }
                    ).isVisible(),
                    false
                );
                await page.keyboard.press("Escape");
                await frame.locator(".preview-container-search-input").waitFor({ state: "detached" });
                await frame.locator(
                    `[data-control-name="${plan.expectedSearch.name}"] .container-item`,
                    { hasText: plan.expectedSearch.afterHidden }
                ).waitFor({ state: "visible" });
            }

            await page.mouse.move(modalBox.x + 120, modalBox.y + 14);
            await page.mouse.down();
            await page.mouse.move(modalBox.x + 160, modalBox.y + 42);
            await page.mouse.up();

            const draggedModalBox = await page.locator(".dialogforge-web-dialog").boundingBox();

            assert.ok(draggedModalBox.x > modalBox.x + 10);
            assert.ok(draggedModalBox.y > modalBox.y + 10);

            if (plan.expectRememberedPosition) {
                await page.locator(".dialogforge-web-dialog__close").click();
                await page.locator(".dialogforge-web-dialog-layer").waitFor({ state: "detached" });
                await openDialogFromMenu(plan.label);
                await page.locator(".dialogforge-web-dialog-layer").waitFor({ state: "visible" });
                await page.locator(".dialogforge-web-dialog__frame").waitFor({ state: "attached" });
                await page.locator(".dialogforge-web-dialog__title", {
                    hasText: plan.label
                }).waitFor({ state: "visible" });

                const restoredModalBox = await page.locator(".dialogforge-web-dialog").boundingBox();

                assert.ok(Math.abs(restoredModalBox.x - draggedModalBox.x) < 2);
                assert.ok(Math.abs(restoredModalBox.y - draggedModalBox.y) < 2);
            }

            for (const selection of plan.selections) {
                if (selection.name) {
                    await selectControl(frame, selection.name, selection.value);
                }
                else {
                    await frame.locator("select").nth(selection.index).selectOption(selection.value);
                }
            }

            await page.locator("#command", {
                hasText: plan.expectedCommand
            }).waitFor({ timeout: 10000 });
            assert.strictEqual(
                await page.locator("#command").evaluate((node) => {
                    return String(node.textContent || "").endsWith("\n");
                }),
                false
            );
            assert.strictEqual(await page.locator("#commandPane").isVisible(), true);
            assert.strictEqual(await page.locator("#mainSplitter").isVisible(), true);
            {
                const commandPaneBox = await page.locator("#commandPane").boundingBox();

                assert.ok(commandPaneBox && commandPaneBox.height >= 56);
                assert.ok(commandPaneBox.height < 180);
            }
            await clickSmartButton(frame, "Run");
            await page.locator("#consoleTerminal", {
                hasText: plan.expectedCommand
            }).waitFor({ timeout: 30000 });
            {
                const inputCodes = await page.evaluate(() => {
                    return Array.from(
                        document.querySelectorAll("#consoleTerminal [data-console-input-line=\"true\"]")
                    ).map((line) => String(line.dataset.consoleInputCode || ""));
                });
                const finalInputLine = inputCodes[inputCodes.length - 1] || "";

                assert.notStrictEqual(finalInputLine, "");
                if (plan.expectedFinalInputLine) {
                    assert.strictEqual(finalInputLine, plan.expectedFinalInputLine);
                }
            }
            await page.locator("#commandPane").waitFor({ state: "hidden", timeout: 10000 });
            if (plan.expectedOutput) {
                for (const expectedOutput of plan.expectedOutput) {
                    await page.locator("#consoleTerminal", {
                        hasText: expectedOutput
                    }).waitFor({ timeout: 30000 });
                }
            }
            await page.locator(".dialogforge-web-dialog-layer").waitFor({ state: "detached" });
        };

        const openDialogFrame = async function(plan) {
            await openDialogFromMenu(plan.label, plan.menuLabel);
            await page.locator(".dialogforge-web-dialog-layer").waitFor({ state: "visible" });
            await page.locator(".dialogforge-web-dialog__frame").waitFor({ state: "attached" });

            const frame = page.frameLocator(".dialogforge-web-dialog__frame");

            await frame.locator("#paper").waitFor({ state: "attached" });
            await page.locator(".dialogforge-web-dialog__title", {
                hasText: plan.label
            }).waitFor({ state: "visible" });

            return frame;
        };

        const selectControl = async function(frame, name, value) {
            const select = frame.locator(`select[data-control-name="${name}"]`);

            if (await select.count()) {
                await select.selectOption(value);
                return;
            }

            const row = frame.locator(
                `[data-control-name="${name}"] .container-item[data-value="${value}"], `
                + `[data-control-name="${name}"] .dm-choice-item[data-value="${value}"]`
            ).first();

            try {
                await row.waitFor({ state: "visible", timeout: 30000 });
            }
            catch (error) {
                const rendered = await frame.locator(`[data-control-name="${name}"]`).evaluateAll((nodes) => {
                    return nodes.map((node) => node.textContent || "").join("\n---\n");
                });

                throw new Error(`Control ${name} did not render value ${value}. Rendered content: ${rendered}`);
            }
            if (await row.evaluate((node) => {
                return node.classList.contains("active")
                    || node.classList.contains("is-asc")
                    || node.classList.contains("is-desc");
            })) {
                return;
            }

            await row.click();
        };

        const fillControl = async function(frame, name, value) {
            await frame.locator(`[data-control-name="${name}"]`).last().fill(value);
        };

        const clickControl = async function(frame, name) {
            await frame.locator(`[data-control-name="${name}"]`).last().click();
        };

        const clickSmartButton = async function(frame, label) {
            await frame.locator(".smart-button", { hasText: label }).click();
        };

        {
            const frame = await openDialogFrame({
                id: "frequencies",
                label: "Frequency table"
            });

            await frame.locator(".smart-button").first().waitFor({ state: "visible" });
            await selectControl(frame, "c_datasets", "iris");
            await selectControl(frame, "c_variables", "Species");
            await page.locator("#command", {
                hasText: "wtable(Species)"
            }).waitFor({ timeout: 10000 });
            await page.locator(".dialogforge-web-dialog__close").click();
            await page.locator(".dialogforge-web-dialog-layer").waitFor({ state: "detached" });
            await page.locator("#commandPane").waitFor({ state: "hidden", timeout: 10000 });
        }

        const runStatefulDialog = async function(plan) {
            await openDialogFromMenu(plan.label);
            await page.locator(".dialogforge-web-dialog-layer").waitFor({ state: "visible" });
            await page.locator(".dialogforge-web-dialog__frame").waitFor({ state: "attached" });

            const frame = page.frameLocator(".dialogforge-web-dialog__frame");

            await frame.locator("#paper").waitFor({ state: "attached" });
            await frame.locator("#paper .dm-el").first().waitFor({ state: "visible" });
            await frame.locator(".smart-button").first().waitFor({ state: "visible" });

            for (const selection of plan.selections) {
                if (selection.name) {
                    await selectControl(frame, selection.name, selection.value);
                }
                else {
                    await frame.locator("select").nth(selection.index).selectOption(selection.value);
                }
            }

            await clickSmartButton(frame, "Button");
            if (plan.targetControl && plan.targetValue) {
                await frame.locator(
                    `[data-control-name="${plan.targetControl}"] .container-item[data-value="${plan.targetValue}"], `
                    + `[data-control-name="${plan.targetControl}"] .dm-choice-item[data-value="${plan.targetValue}"]`
                ).first().waitFor({ state: "visible", timeout: 10000 });
                await selectControl(frame, plan.targetControl, plan.targetValue);
                await frame.locator(".smart-button-icon.codicon-arrow-left").waitFor({ state: "visible", timeout: 10000 });
                await clickSmartButton(frame, "Button");
                await frame.locator(
                    `[data-control-name="${plan.sourceControl}"] .container-item[data-value="${plan.targetValue}"], `
                    + `[data-control-name="${plan.sourceControl}"] .dm-choice-item[data-value="${plan.targetValue}"]`
                ).first().waitFor({ state: "visible", timeout: 10000 });
                await frame.locator(".smart-button-icon.codicon-arrow-right").waitFor({ state: "visible", timeout: 10000 });
                await selectControl(frame, plan.sourceControl, plan.targetValue);
                await clickSmartButton(frame, "Button");
            }
            await clickSmartButton(frame, "OK");
            await page.locator(".dialogforge-web-dialog-layer").waitFor({ state: "detached" });
            await page.locator(
                `[data-product-state-chip="${plan.expectedChipId}"] .dm-console-state-chip-value`,
                { hasText: plan.expectedChipValue }
            ).waitFor({ timeout: 30000 });
        };

        await runDialog({
            id: "frequencies",
            label: "Frequency table",
            contentWidth: 340,
            contentHeight: 260,
            expectRememberedPosition: true,
            expectedOptions: [
                {
                    name: "c_variables",
                    values: ["Sepal.Length", "Sepal.Width", "Petal.Length", "Petal.Width", "Species"],
                    disabledValues: ["Sepal.Length", "Sepal.Width", "Petal.Length", "Petal.Width"]
                }
            ],
            expectedSearch: {
                name: "c_variables",
                query: "spec",
                beforeVisible: "Sepal.Length",
                afterVisible: "Species",
                afterHidden: "Sepal.Length"
            },
            expectedLoadedPackages: ["admisc", "declared"],
            selections: [
                { name: "c_datasets", value: "iris" },
                { name: "c_variables", value: "Species" }
            ],
            expectedCommand: "wtable(Species)",
            expectedFinalInputLine: ")",
            expectedOutput: [
                "setosa",
                "versicolor",
                "virginica",
                "150  1.000 100.0"
            ]
        });
        await runDialog({
            id: "crosstable",
            label: "Contingency table",
            expectedOptions: [
                {
                    name: "c_rows",
                    values: ["Sepal.Length", "Sepal.Width", "Petal.Length", "Petal.Width", "Species"],
                    disabledValues: ["Sepal.Length", "Sepal.Width", "Petal.Length", "Petal.Width"]
                },
                {
                    name: "c_cols",
                    values: ["Sepal.Length", "Sepal.Width", "Petal.Length", "Petal.Width", "Species"],
                    disabledValues: ["Sepal.Length", "Sepal.Width", "Petal.Length", "Petal.Width"]
                }
            ],
            selections: [
                { name: "c_datasets", value: "iris" },
                { name: "c_rows", value: "Species" },
                { name: "c_cols", value: "Species" }
            ],
            expectedCommand: "wtable(Species, Species)"
        });
        await runDialog({
            id: "onesamplettest",
            label: "One-sample t-test",
            expectedOptions: [
                {
                    name: "c_variables",
                    values: ["Sepal.Length", "Sepal.Width", "Petal.Length", "Petal.Width", "Species"],
                    disabledValues: ["Species"]
                }
            ],
            selections: [
                { name: "c_datasets", value: "iris" },
                { name: "c_variables", value: "Sepal.Length" }
            ],
            expectedCommand: "t.test(Sepal.Length"
        });
        await runStatefulDialog({
            id: "splitby",
            label: "Split by groups",
            selections: [
                { name: "c_datasets", value: "iris" },
                { name: "c_variables", value: "Species" }
            ],
            sourceControl: "c_variables",
            targetControl: "c_grouping",
            targetValue: "Species",
            expectedChipId: "split-variables",
            expectedChipValue: "Species"
        });
        await runStatefulDialog({
            id: "weightby",
            label: "Apply frequency weighting",
            selections: [
                { name: "c_datasets", value: "iris" },
                { name: "c_variables", value: "Petal.Width" }
            ],
            sourceControl: "c_variables",
            targetControl: "c_weighting",
            targetValue: "Petal.Width",
            expectedChipId: "weight-variable",
            expectedChipValue: "Petal.Width"
        });
        {
            const frame = await openDialogFrame({
                id: "goto",
                label: "Go to...",
                menuLabel: "Go to variable..."
            });

            await frame.locator('[data-control-name="c_variables"] .container-item').first().waitFor({ state: "visible" });
            await selectControl(frame, "c_variables", "Species");
            await clickSmartButton(frame, "Go");
            await page.locator('[data-dialog-id="goto"]').waitFor({ state: "detached" });
            await page.locator(".dialogforge-web-data-editor-window", {
                hasText: "Data editor: iris"
            }).waitFor({ state: "visible", timeout: 30000 });
            await page.locator("#datasetEditorPanelVariables.is-active #datasetEditorVariablesScroll tr.is-selected").waitFor({ timeout: 30000 });
            assert.strictEqual(
                await page.locator("#datasetEditorPanelVariables.is-active #datasetEditorVariablesScroll tr.is-selected input[data-variable-field=\"name\"]").inputValue(),
                "Species"
            );
            await page.locator(".dialogforge-web-data-editor-window .dialogforge-web-dialog__close").click();
            await page.locator(".dialogforge-web-data-editor-layer").waitFor({ state: "detached", timeout: 10000 });
        }
        {
            const frame = await openDialogFrame({
                id: "recode",
                label: "Recode",
                menuLabel: "Recode variables"
            });

            await selectControl(frame, "c_datasets", "iris");
            await selectControl(frame, "c_variables", "Species");
            await clickControl(frame, "i_value_old");
            await fillControl(frame, "i_value_old", "setosa");
            await clickControl(frame, "i_value_new");
            await fillControl(frame, "i_value_new", "flower");
            await clickSmartButton(frame, "add");
            await clickSmartButton(frame, "Run");
            await page.locator("#consoleTerminal", {
                hasText: "rules = \"setosa=flower\""
            }).waitFor({ timeout: 30000 });
            await page.locator(".dialogforge-web-dialog-layer").waitFor({ state: "detached" });
        }
        {
            const frame = await openDialogFrame({
                id: "summaries",
                label: "Numerical summaries"
            });

            await selectControl(frame, "c_datasets", "iris");
            await page.locator("#commandPane").waitFor({ state: "hidden", timeout: 10000 });
            assert.strictEqual(await page.locator("#commandPane").isVisible(), false);
            await selectControl(frame, "c_variables", "Sepal.Length");
            await page.locator("#commandPane").waitFor({ state: "hidden", timeout: 10000 });
            assert.strictEqual(await page.locator("#commandPane").isVisible(), false);
            await clickControl(frame, "cb_mode");
            await clickControl(frame, "cb_mean");
            await page.locator("#commandPane", {
                hasText: "wmeasures(Sepal.Length, what = c(\"mode\", \"mean\"), wt = Petal.Width)"
            }).waitFor({ timeout: 30000 });
            await page.locator("#commandPane", {
                hasText: "split.by = Species"
            }).waitFor({ timeout: 30000 });
            await clickSmartButton(frame, "Run");
            await page.locator("#consoleTerminal", {
                hasText: "wmeasures(Sepal.Length, what = c(\"mode\", \"mean\"), wt = Petal.Width)"
            }).waitFor({ timeout: 30000 });
            await page.locator("#consoleTerminal", {
                hasText: "split.by = Species"
            }).waitFor({ timeout: 30000 });
            await page.locator(".dialogforge-web-dialog-layer").waitFor({ state: "detached" });
        }
        {
            const frame = await openDialogFrame({
                id: "sortby",
                label: "Sort cases"
            });

            await selectControl(frame, "c_datasets", "iris");
            await selectControl(frame, "c_variables", "Species");
            await frame.locator(".custom-checkbox").first().waitFor({ state: "visible" });
            await frame.locator(".dm-input textarea").first().waitFor({ state: "visible" });
            await frame.locator(".container-item", { hasText: "Species" }).waitFor({ state: "visible" });
            await frame.locator(".dm-choice-list").first().waitFor({ state: "visible" });
            await frame.locator(".smart-button .smart-button-icon.codicon.codicon-arrow-right").waitFor({ state: "visible" });
            await clickSmartButton(frame, "Button");
            await frame.locator(".dm-choice-item", { hasText: "Species" }).waitFor({ state: "visible" });
            await clickSmartButton(frame, "OK");
            await page.locator("#consoleTerminal", {
                hasText: "iris <- iris[order(iris$Species), ]"
            }).waitFor({ timeout: 30000 });
            await page.locator(".dialogforge-web-dialog-layer").waitFor({ state: "detached" });
        }
        {
            const frame = await openDialogFrame({
                id: "select",
                label: "Subset cases and variables"
            });

            await selectControl(frame, "c_datasets", "iris");
            await clickControl(frame, "cb_allvars");
            await selectControl(frame, "c_variables", "Species");
            await clickControl(frame, "rd_new");
            await fillControl(frame, "newname", "iris_selected");
            await frame.locator(".native-radio").first().waitFor({ state: "attached" });
            await frame.locator(".custom-radio").first().waitFor({ state: "visible" });
            await clickSmartButton(frame, "OK");
            await page.locator("#consoleTerminal", {
                hasText: "iris_selected <- subset("
            }).waitFor({ timeout: 30000 });
            await page.locator(".dialogforge-web-dialog-layer").waitFor({ state: "detached" });
        }
        {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-web-import-"));
            const csvPath = path.join(tempDir, "survey.csv");

            fs.writeFileSync(csvPath, "case,value\nA,1\nB,2\n", "utf8");
            await page.locator("#webMenuBar .web-menu-button", {
                hasText: "File"
            }).click();
            const importMenuItem = page.locator("#webMenuBar .web-menu-item", {
                hasText: "Import data"
            });

            await importMenuItem.waitFor({ state: "visible", timeout: 10000 });
            assert.strictEqual(
                await importMenuItem.evaluate((node) => node.disabled),
                false
            );
            await importMenuItem.click();
            await page.locator(".dialogforge-web-dialog__title", {
                hasText: "Import data"
            }).waitFor({ state: "visible", timeout: 30000 });
            const frame = page.frameLocator(".dialogforge-web-dialog__frame");

            await frame.locator("#paper .dm-el").first().waitFor({ state: "visible", timeout: 20000 });
            const fileChooser = page.waitForEvent("filechooser");

            await frame.locator(".smart-button", { hasText: "Browse" }).click();
            await (await fileChooser).setFiles(csvPath);
            await frame.locator("body", { hasText: "case" }).waitFor({ timeout: 30000 });
            await page.locator("#command", {
                hasText: "survey <- read.csv"
            }).waitFor({ timeout: 30000 });
            await frame.locator(".smart-button", { hasText: "Import" }).click();
            await page.locator("#consoleTerminal", {
                hasText: "survey <- read.csv"
            }).waitFor({ timeout: 30000 });
            await page.locator("#workspaceSummary", {
                hasText: "survey"
            }).waitFor({ timeout: 30000 });
            await page.locator(".dialogforge-web-dialog-layer").waitFor({ state: "detached" });
        }

        const screenshot = await page.screenshot();

        assert.strictEqual(title, "DialogR");
        assert.ok(meta.includes("runtime: webr"));
        assert.ok(screenshot.length > 2000);
    }
    finally {
        await browser.close();
        await close(server);
    }
};


(async () => {
    assertSourceContracts();
    await assertServerContracts();
    await assertRenderedContracts();
    console.log("Browser-runnable DialogR web entry verified.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
