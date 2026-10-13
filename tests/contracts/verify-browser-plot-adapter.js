"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const browserPlotAdapter = fs.readFileSync(
    path.join(rootDir, "src/shell-web/browserPlotAdapter.ts"),
    "utf8"
);
const plotViewerState = fs.readFileSync(
    path.join(rootDir, "src/base-app/features/plot-viewer/plotViewerState.ts"),
    "utf8"
);
const dialogRBrowserHost = fs.readFileSync(
    path.join(rootDir, "src/shell-web/pages/shell.js"),
    "utf8"
);
const presentation = fs.readFileSync(path.join(rootDir, "src/base-app/features/plot-viewer/plotViewerPresentationState.ts"), "utf8");
const shellWebTsconfig = fs.readFileSync(
    path.join(rootDir, "tsconfig.shell-web.json"),
    "utf8"
);

assert.ok(
    browserPlotAdapter.includes("saveBrowserPlot")
        && browserPlotAdapter.includes("copyBrowserPlot")
        && browserPlotAdapter.includes("createBrowserPlotObjectUrl")
        && browserPlotAdapter.includes("revokeBrowserPlotObjectUrls")
        && browserPlotAdapter.includes("showSaveFilePicker")
        && browserPlotAdapter.includes("ClipboardItem"),
    "browser plot adapter must own browser save, copy, and object URL operations"
);
assert.ok(
    plotViewerState.includes("createPlotViewerPayload")
        && plotViewerState.includes("createEmptyPlotViewerPayload")
        && !browserPlotAdapter.includes("const createPlotViewerPayload"),
    "shared plot viewer state must own captured plot payload shaping"
);
assert.ok(
    dialogRBrowserHost.includes("/browser-esm/src/shell-web/browserPlotAdapter.js")
        && browserPlotAdapter.includes("../base-app/features/plot-viewer/plotViewerState")
        && dialogRBrowserHost.includes("createBrowserPlotViewerHost")
        && browserPlotAdapter.includes("createBrowserPlotObjectUrl(image")
        && browserPlotAdapter.includes("revokeBrowserPlotObjectUrls(presentation.retireImages())")
        && presentation.includes("createPlotViewerPayload")
        && browserPlotAdapter.includes("createPlotViewerPresentationState")
        && !dialogRBrowserHost.includes("const plotFormatMimeTypes")
        && !dialogRBrowserHost.includes("const imageBitmapToObjectUrl = function")
        && !dialogRBrowserHost.includes("const copyBrowserPlot = async function")
        && !dialogRBrowserHost.includes("const saveBrowserPlot = async function"),
    "DialogR browser host must delegate plot browser-media operations to the adapter"
);
assert.ok(
    shellWebTsconfig.includes("src/shell-web/browserPlotAdapter.ts"),
    "browser plot adapter must be included in the browser ESM build"
);

console.log("Browser plot adapter verified.");
