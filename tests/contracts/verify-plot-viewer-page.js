"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const rootDir = process.cwd();
const pagePath = path.join(rootDir, "shared/base-app/pages/plotViewer.html");
const distPagePath = path.join(rootDir, "dist/shared/base-app/pages/plotViewer.html");
const preloadPath = path.join(rootDir, "shared/base-app/bootstrap/preload.ts");
const mainPath = path.join(rootDir, "build/scripts/electron-main.ts");
const plotIpcPath = path.join(rootDir, "shared/shell-electron/external/plotExternalIpcController.ts");
const plotRoutesPath = path.join(rootDir, "shared/shell-electron/external/plotExternalIpc.ts");
const plotControllerPath = path.join(rootDir, "shared/shell-electron/external/plotViewerController.ts");
const externalCompositionPath = path.join(rootDir, "shared/shell-electron/external/externalWindowComposition.ts");
const rendererPath = path.join(rootDir, "shared/base-app/features/composition-panels/mainApplicationPanelController.ts");
const page = fs.readFileSync(pagePath, "utf8");
const preload = fs.readFileSync(preloadPath, "utf8");
const main = fs.readFileSync(mainPath, "utf8");
const plotIpc = fs.readFileSync(plotIpcPath, "utf8");
const plotRoutes = fs.readFileSync(plotRoutesPath, "utf8");
const plotController = fs.readFileSync(plotControllerPath, "utf8");
const renderer = fs.readFileSync(rendererPath, "utf8");
const mainProcess = [
    main,
    plotIpc,
    plotRoutes,
    plotController,
    fs.readFileSync(externalCompositionPath, "utf8")
].join("\n");
assert.ok(page.includes("id=\"frame\""), "plot viewer page must contain the DialogR image plot host");
assert.ok(page.includes("id=\"saveButton\""), "plot viewer page must expose the DialogR Save action");
assert.ok(page.includes("id=\"copyPlotButton\""), "plot viewer page must expose the DialogR Copy action");
assert.ok(page.includes("id=\"zoomButton\""), "plot viewer page must expose the DialogR zoom menu");
assert.ok(page.includes("id=\"squareToggle\""), "plot viewer page must expose the DialogR 1:1 action");
assert.ok(page.includes("id=\"historyToggle\""), "plot viewer page must expose the DialogR history toggle");
assert.ok(page.includes("id=\"historyList\""), "plot viewer page must expose DialogR local plot history");
assert.ok(page.includes("id=\"clearHistoryButton\""), "plot viewer page must expose DialogR clear-history action");
assert.ok(page.includes("plot-broom-icon"), "plot viewer clear-history action must use the DialogR broom icon structure");
assert.ok(page.includes("../../assets/icons/save.svg"), "plot viewer Save action must use shared DialogR save.svg");
assert.ok(page.includes("../../assets/icons/fit.svg"), "plot viewer zoom menu must use shared DialogR fit.svg");
assert.ok(page.includes(".plot-zoom-button-arrow::before"), "plot viewer zoom menu must draw its arrow without a dedicated asset");
assert.strictEqual(page.includes("../../assets/icons/dropdown.svg"), false, "plot viewer zoom menu must not require dropdown.svg");
assert.ok(page.includes("window.dialogForge.onPlotViewerUpdate(function"), "plot viewer must subscribe to plot state updates");
assert.ok(page.includes("window.dialogForge.savePlot({"), "plot viewer must route Save through preload");
assert.ok(page.includes("window.dialogForge.copyPlot(exportUrl);"), "plot viewer must route Copy through preload");
assert.ok(page.includes("window.dialogForge.executeInvisibleMutation"), "plot viewer Reset action must route through the runtime bridge");
assert.ok(preload.includes("openPlotViewer: function(url: string)"), "preload must expose openPlotViewer");
assert.ok(preload.includes("savePlot: function(input:"), "preload must expose savePlot");
assert.ok(preload.includes("copyPlot: function(url: string)"), "preload must expose copyPlot");
assert.ok(preload.includes("onPlotViewerUpdate: function(callback)"), "preload must expose plot viewer update subscription");
assert.ok(mainProcess.includes('openPlotViewer: "base-app:openPlotViewer"'), "main process must handle openPlotViewer");
assert.ok(mainProcess.includes('savePlot: "base-app:savePlot"'), "main process must handle savePlot");
assert.ok(mainProcess.includes('copyPlot: "base-app:copyPlot"'), "main process must handle copyPlot");
assert.ok(mainProcess.includes("shared/base-app/pages/plotViewer.html"), "main process must load the plot viewer page");
assert.ok(mainProcess.includes("base-app:plot-viewer-update"), "main process must send plot viewer updates");
assert.ok(main.includes("presentRuntimeEvents(snapshot)"), "main process must route runtime events to the plot viewer composition");
assert.ok(plotController.includes("const nextWindow = options.createWindow();"), "main process must create the plot viewer window from plot events");
assert.ok(renderer.includes("bindings.openPlotViewer(url)"), "runtime event renderer must open the internal plot viewer");
assert.ok(fs.existsSync(distPagePath), "build output must include plotViewer.html");
assert.ok(fs.existsSync(path.join(rootDir, "dist/shared/base-app/pages/shared/appCodicon.css")), "build output must include DialogR appCodicon.css");
assert.ok(fs.existsSync(path.join(rootDir, "dist/shared/assets/icons/fit.svg")), "build output must include shared fit.svg");
assert.strictEqual(fs.existsSync(path.join(rootDir, "dist/shared/assets/icons/dropdown.svg")), false, "build output must not include unused dropdown.svg");
console.log("Plot viewer page contract verified.");
