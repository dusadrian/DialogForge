"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createRHelpPageProxy } = require("../../shared/runtime/providers/r/help/rHelpPageProxy");
const rootDir = process.cwd();
const pagePath = path.join(rootDir, "shared/base-app/pages/help.html");
const distPagePath = path.join(rootDir, "dist/shared/base-app/pages/help.html");
const preloadPath = path.join(rootDir, "shared/base-app/bootstrap/preload.ts");
const mainPath = path.join(rootDir, "scripts/electron-main.js");
const helpIpcPath = path.join(rootDir, "shared/runtime/help/helpIpcController.ts");
const helpRoutesPath = path.join(rootDir, "shared/runtime/help/helpIpc.ts");
const helpWindowPath = path.join(rootDir, "shared/shell-electron/external/helpWindowController.ts");
const externalCompositionPath = path.join(rootDir, "shared/shell-electron/external/externalWindowComposition.ts");
const rendererPath = path.join(rootDir, "shared/console/renderer/mainConsoleCoordinator.ts");
const globalsPath = path.join(rootDir, "shared/base-app/bootstrap/dialogForgeGlobals.d.ts");
const rToolControllerPath = path.join(rootDir, "shared/runtime/providers/r/controllers/rToolController.ts");
const page = fs.readFileSync(pagePath, "utf8");
const preload = fs.readFileSync(preloadPath, "utf8");
const main = fs.readFileSync(mainPath, "utf8");
const helpIpc = fs.readFileSync(helpIpcPath, "utf8");
const helpRoutes = fs.readFileSync(helpRoutesPath, "utf8");
const helpWindow = fs.readFileSync(helpWindowPath, "utf8");
const externalComposition = fs.readFileSync(externalCompositionPath, "utf8");
const renderer = fs.readFileSync(rendererPath, "utf8");
const globals = fs.readFileSync(globalsPath, "utf8");
const rToolController = fs.readFileSync(rToolControllerPath, "utf8");
const mainProcess = [
    main,
    helpIpc,
    helpRoutes,
    helpWindow,
    externalComposition
].join("\n");
assert.ok(page.includes("id=\"helpFrame\""), "help page must include a body host");
assert.ok(page.includes("app-help-navigate"), "help page must classify and route R help links");
assert.ok(page.includes("window.dialogForge?.openHelpCommandUrl"), "help page must route app help command URLs through preload");
assert.ok(page.includes("window.dialogForge?.fetchRHelpPage"), "help page must fetch local R help through preload");
assert.ok(page.includes("isLocalHelpUrl(nextUrl) && window.dialogForge?.fetchRHelpPage"), "local R help URLs must use the main-process fetch bridge");
assert.ok(page.includes("font-family:\"Dialog Mono\""), "help page must preserve R code typography");
assert.ok(preload.includes("openHelpTopic: function(input:"), "preload must expose openHelpTopic");
assert.ok(preload.includes("getHelpDocument: function()"), "preload must expose getHelpDocument");
assert.ok(preload.includes("openHelpCommandUrl: function(url:"), "preload must expose help command URL routing");
assert.ok(preload.includes("fetchRHelpPage: function(url:"), "preload must expose R help page fetching");
assert.ok(preload.includes("runHelpExample: function(input:"), "preload must expose help example routing");
assert.ok(globals.includes("openHelpTopic(input:"), "global types must expose openHelpTopic");
assert.ok(globals.includes("getHelpDocument()"), "global types must expose getHelpDocument");
assert.ok(globals.includes("openHelpCommandUrl(url:"), "global types must expose help command URL routing");
assert.ok(globals.includes("fetchRHelpPage(url:"), "global types must expose R help page fetching");
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
assert.ok(
    externalComposition.includes("if (hasChooser || (!hasBody && hasPath))"),
    "single-topic HTML-body help must render without starting the dynamic help server"
);
assert.ok(
    externalComposition.includes("const hasPath = result.status === \"ready\" && result.path;"),
    "path-only help results must still open a help window"
);
assert.ok(
    externalComposition.includes("if (hasBody || hasChooser || hasPath)"),
    "help window loading must include path-only R help results"
);
assert.ok(
    externalComposition.includes("if (hasChooser || (!hasBody && hasPath))"),
    "path-only R help results must start the main-process help server without delaying direct HTML-body help"
);
assert.ok(
    rToolController.includes("body: String(payload.body || \"\")"),
    "R help controller must not treat a path as HTML body"
);

const fetchedUrls = [];
const proxy = createRHelpPageProxy({
    rewriteUrl: async function(value) {
        return String(value || "").replace("localhost:9999", "127.0.0.1:1234");
    },
    resourceClient: {
        loadText: async function(url) {
            fetchedUrls.push(url);

            return {
                ok: true,
                status: 200,
                url,
                text: "<html><body>wtable</body></html>",
                contentType: "text/html"
            };
        }
    }
});

proxy.fetchPage("http://localhost:9999/library/declared/html/weighted.html").then((result) => {
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(fetchedUrls, [
        "http://127.0.0.1:1234/library/declared/html/weighted.html"
    ]);
    assert.ok(String(result.text || "").includes("wtable"));
    console.log("Help window page contract verified.");
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
