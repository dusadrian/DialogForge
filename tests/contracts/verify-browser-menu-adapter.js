"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "../..");
const read = function(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
};

const adapter = read("src/shell-web/browserMenuAdapter.ts");
const dialogRBrowserHost = read("src/shell-web/pages/shell.js");
const packagePolicy = read("src/base-app/features/menu-commands/mainProductCommandController.ts");
const tsconfig = read("tsconfig.shell-web.json");

assert.ok(
    adapter.includes("createBrowserMenuAdapter")
        && adapter.includes("web-menu-root")
        && adapter.includes("web-menu-popup")
        && adapter.includes("web-menu-separator")
        && adapter.includes("options.isActionSupported(item)")
        && adapter.includes("Promise.resolve(options.execute(item))"),
    "browser menu adapter must own browser DOM rendering while delegating support and execution policy"
);
assert.ok(
    dialogRBrowserHost.includes("/browser-esm/src/shell-web/browserMenuAdapter.js")
        && dialogRBrowserHost.includes("/browser-esm/src/base-app/features/menu-commands/mainMenuCommandRouter.js")
        && dialogRBrowserHost.includes("/browser-esm/src/base-app/i18n/localeDisplayName.js")
        && dialogRBrowserHost.includes("/browser-esm/src/base-app/features/menu-commands/mainProductCommandController.js")
        && dialogRBrowserHost.includes("createBrowserMenuAdapter({")
        && dialogRBrowserHost.includes("createMainMenuCommandHandler({")
        && dialogRBrowserHost.includes("insertLanguageMenu(menu || [])")
        && dialogRBrowserHost.includes("persistLocale: writeSelectedLocale")
        && dialogRBrowserHost.includes(
            "loadComposition = async function (locale = readSelectedLocale())"
        )
        && dialogRBrowserHost.includes("isActionSupported: isMenuActionSupported")
        && dialogRBrowserHost.includes("execute: executeMenuItem")
        && dialogRBrowserHost.includes("browserRuntimeFileWorkflow().openWorkspaceFile()")
        && dialogRBrowserHost.includes("browserRuntimeFileWorkflow().saveWorkspaceFile()")
        && dialogRBrowserHost.includes("browserRuntimeFileWorkflow().runScriptFile()")
        && dialogRBrowserHost.includes("browserRuntimeFileWorkflow().setWorkingDirectory()")
        && dialogRBrowserHost.includes("showSettings() {\n        openSettingsModal();\n    }")
        && !dialogRBrowserHost.includes("showSettings() {}")
        && !dialogRBrowserHost.includes("openWorkspaceFile() {}")
        && !dialogRBrowserHost.includes("saveWorkspaceFile() {}")
        && !dialogRBrowserHost.includes("runScriptFile() {}")
        && dialogRBrowserHost.includes('homeDirectoryPath: ""')
        && dialogRBrowserHost.includes("const cleanupWebRDefaultPlotFile = async function (runtime)")
        && dialogRBrowserHost.includes('createWebRFilePath(state.workingDirectoryPath, "Rplots.pdf")')
        && dialogRBrowserHost.includes("const openSettingsModal = function ()")
        && dialogRBrowserHost.includes("dialogforge-web-settings-window"),
    "DialogR browser host must use the browser menu adapter, language-menu composition, and shared base command router without moving command semantics into browser rendering code"
);
assert.ok(
    !fs.existsSync(path.join(rootDir, "src/runtime/providers/webr/webRPackageMenuPolicy.ts"))
        && packagePolicy.includes('command.endsWith(".packages.installRequired")')
        && packagePolicy.includes('command.endsWith(".packages.updateRequired")')
        && packagePolicy.includes("await bindings.installRequired(packages)")
        && packagePolicy.includes("await bindings.updateRequired(packages)")
        && dialogRBrowserHost.includes("createMainProductCommandController({")
        && dialogRBrowserHost.includes("installRequired: (packages) => browserRuntimePackages().installSessionPackages(packages)")
        && !packagePolicy.includes("dependencies = TRUE"),
    "Both hosts must route active package menu commands through the shared product command policy"
);

assert.ok(
    tsconfig.includes("src/shell-web/browserMenuAdapter.ts")
        && tsconfig.includes("src/base-app/i18n/localeDisplayName.ts")
        && tsconfig.includes("src/base-app/features/menu-commands/mainMenuCommandRouter.ts")
        && tsconfig.includes("src/base-app/features/menu-commands/mainProductCommandController.ts"),
    "browser menu adapter, locale display names, shared menu command router, and WebR package menu policy must be included in the browser ESM build"
);

console.log("Browser menu adapter verified.");
