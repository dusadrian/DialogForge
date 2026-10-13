"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "../..");
const read = function(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
};

const surface = read("src/shell-web/browserHelpViewerSurface.ts");
const bridge = read("src/shell-web/browserSharedPageBridge.ts");
const dialogRBrowserHost = read("src/shell-web/pages/shell.js");
const tsconfig = read("tsconfig.shell-web.json");

assert.ok(
    surface.includes("createBrowserHelpViewerSurface")
        && surface.includes("../runtime/help/helpViewerDocument")
        && surface.includes("/src/base-app/pages/help.html?")
        && surface.includes("createHelpViewerOpenEntry({")
        && surface.includes('"app-help-complete"')
        && surface.includes("options.frameSurfaces.open({"),
    "browser help viewer surface must host the shared help page and browser frame lifecycle"
);
assert.ok(
    dialogRBrowserHost.includes("/browser-esm/src/shell-web/browserHelpViewerSurface.js")
        && dialogRBrowserHost.includes("createBrowserHelpViewerSurface({")
        && dialogRBrowserHost.includes("browserHelpViewerSurface().open({")
        && dialogRBrowserHost.includes("browserHelpViewerSurface().handleMessage(event)"),
    "DialogR browser host must delegate Help iframe hosting to the browser help viewer surface"
);
assert.ok(
    bridge.includes("installBrowserSharedPageBridge")
        && bridge.includes("openHelpCommandUrl: options.openHelpCommandUrl")
        && bridge.includes("fetchRHelpPage: options.fetchHelpPage")
        && bridge.includes("getConsoleSyntaxModule: options.getConsoleSyntaxModule")
        && bridge.includes("waitForBrowserPageFullyLoaded")
        && bridge.includes("waitForBrowserAnimationFrameSettled"),
    "browser shared-page bridge must own the window.dialogForge method surface for shared iframes"
);
assert.ok(
    dialogRBrowserHost.includes("/browser-esm/src/shell-web/browserSharedPageBridge.js")
        && dialogRBrowserHost.includes("installBrowserSharedPageBridge(window, {")
        && !dialogRBrowserHost.includes("window.dialogForge = Object.assign(existing"),
    "DialogR browser host must install the shared-page bridge instead of assigning window.dialogForge inline"
);
assert.ok(
    !dialogRBrowserHost.includes("encodeHelpDocumentHtml"),
    "DialogR browser host must not duplicate Help document URL encoding after surface extraction"
);
assert.ok(
    tsconfig.includes("src/shell-web/browserHelpViewerSurface.ts")
        && tsconfig.includes("src/shell-web/browserSharedPageBridge.ts"),
    "browser help viewer surface and shared-page bridge must be included in the browser ESM build"
);

console.log("Browser help viewer surface verified.");
