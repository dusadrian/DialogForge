"use strict";

const childProcess = require("child_process");
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const sourceRoot = path.resolve(process.env.DIALOGFORGE_SOURCE_ROOT || rootDir);
const outputRoot = path.resolve(process.env.DIALOGFORGE_DIST_DIR || path.join(sourceRoot, "dist"));
const tscPath = path.join(sourceRoot, "node_modules/typescript/bin/tsc");

childProcess.execFileSync(process.execPath, [
    tscPath,
    "-p",
    path.join(sourceRoot, "tsconfig.shell-web.json"),
    "--outDir",
    path.join(outputRoot, "browser-esm")
], {
    cwd: sourceRoot,
    stdio: "inherit"
});

const browserModuleOutput = path.join(outputRoot, "browser-esm");
const browserReferenceRoots = [
    path.join(sourceRoot, "src", "shell-web", "pages"),
    path.join(sourceRoot, "src", "base-app", "pages")
];

const listTextFiles = function(root) {
    if (!fs.existsSync(root)) {
        return [];
    }

    return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(root, entry.name);

        if (entry.isDirectory()) {
            return listTextFiles(entryPath);
        }

        return /\.(?:html|js|ts)$/.test(entry.name) ? [entryPath] : [];
    });
};

const missingBrowserModules = [];
const browserModulePattern = /["']\/browser-esm\/([^"'?#]+\.js)(?:[?#][^"']*)?["']/g;

browserReferenceRoots.flatMap(listTextFiles).forEach((sourcePath) => {
    const source = fs.readFileSync(sourcePath, "utf8");

    if (sourcePath.endsWith(".js")) {
        esbuild.transformSync(source, {
            loader: "js",
            format: "esm",
            sourcefile: path.relative(sourceRoot, sourcePath)
        });
    }

    for (const match of source.matchAll(browserModulePattern)) {
        const modulePath = match[1];
        const outputPath = path.join(browserModuleOutput, modulePath);

        if (!fs.existsSync(outputPath)) {
            missingBrowserModules.push(
                `${path.relative(sourceRoot, sourcePath)} -> /browser-esm/${modulePath}`
            );
        }
    }
});

if (missingBrowserModules.length) {
    throw new Error(
        "Browser pages reference modules that were not emitted:\n"
        + missingBrowserModules.map((entry) => `- ${entry}`).join("\n")
    );
}

// Shared iframe renderers run unchanged in Electron and the browser. Keep the
// browser postMessage host exhaustive for every statically named route those
// renderers can send. A missing route must fail the web build instead of
// degrading to an undefined result at runtime.
const browserPreloadSource = fs.readFileSync(
    path.join(sourceRoot, "src", "shell-web", "browserPreloadBridge.ts"),
    "utf8"
);
const browserHostDispatchSource = fs.readFileSync(
    path.join(sourceRoot, "src", "shell-web", "browserPreloadChannelBridge.ts"),
    "utf8"
);
const dialogRendererRoots = [
    path.join(sourceRoot, "src", "dialog-runtime", "renderer", "modules"),
    path.join(sourceRoot, "src", "dialog-runtime", "renderer", "library")
];
const browserHostRouteCallPatterns = [
    /invokeHost\(\s*([A-Za-z_$][\w$]*(?:Ipc|Event)Channels\.[A-Za-z_$][\w$]*)/g,
    /sendHost\(\s*([A-Za-z_$][\w$]*(?:Ipc|Event)Channels\.[A-Za-z_$][\w$]*)/g,
    /coms\.invoke\(\s*([A-Za-z_$][\w$]*(?:Ipc|Event)Channels\.[A-Za-z_$][\w$]*)/g,
    /coms\.sendTo\(\s*[^,]+,\s*([A-Za-z_$][\w$]*(?:Ipc|Event)Channels\.[A-Za-z_$][\w$]*)/g,
    /options\.sendTo\(\s*([A-Za-z_$][\w$]*(?:Ipc|Event)Channels\.[A-Za-z_$][\w$]*)/g
];
const browserHostRouteReferences = new Set();
const browserRouteSources = [
    browserPreloadSource,
    ...dialogRendererRoots.flatMap(listTextFiles).map((sourcePath) => {
        return fs.readFileSync(sourcePath, "utf8");
    })
];

browserRouteSources.forEach((source) => {
    browserHostRouteCallPatterns.forEach((pattern) => {
        for (const match of source.matchAll(pattern)) {
            browserHostRouteReferences.add(match[1]);
        }
    });
});

const missingBrowserHostRoutes = Array.from(browserHostRouteReferences)
    .filter((reference) => !browserHostDispatchSource.includes(reference))
    .sort();

if (missingBrowserHostRoutes.length) {
    throw new Error(
        "Shared renderer routes are missing from the browser host dispatch:\n"
        + missingBrowserHostRoutes.map((entry) => `- ${entry}`).join("\n")
    );
}

const requireSourceContract = function(source, required, message) {
    const missing = required.filter((entry) => !source.includes(entry));

    if (missing.length > 0) {
        throw new Error(
            `${message}\n`
            + missing.map((entry) => `- ${entry}`).join("\n")
        );
    }
};
const browserShellSource = fs.readFileSync(
    path.join(sourceRoot, "src", "shell-web", "pages", "shell.js"),
    "utf8"
);
const dialogDatasetResolverSource = fs.readFileSync(
    path.join(
        sourceRoot,
        "src",
        "dialog-runtime",
        "custom-js",
        "runtimeDatasetResolver.ts"
    ),
    "utf8"
);
const datasetWarmCacheSource = fs.readFileSync(
    path.join(
        sourceRoot,
        "src",
        "dataset-editor",
        "datasetEditorWarmCache.ts"
    ),
    "utf8"
);
const sharedDialogCustomRuntimeSource = fs.readFileSync(
    path.join(
        sourceRoot,
        "src",
        "dialog-runtime",
        "renderer",
        "library",
        "customJSRuntime.ts"
    ),
    "utf8"
);
const sharedDialogContainerSource = fs.readFileSync(
    path.join(
        sourceRoot,
        "src",
        "dialog-runtime",
        "renderer",
        "modules",
        "dialogContainerBuilder.ts"
    ),
    "utf8"
);

requireSourceContract(browserShellSource, [
    "createRuntimeDialogDatasetResolver(manager)",
    "readDialogContentSizeFromSource(dialogPayload)",
    "state.dialogPayloads.get(frame)",
    "state.dialogPayloads.set(result.frame, dialogPayload)",
    "createDatasetEditorWarmCache(manager)"
], "Browser dialogs and the Data Editor must reuse shared prepared data:");

if (browserShellSource.includes("readProductDialogDatasetDescriptors(")) {
    throw new Error(
        "The browser shell must not start a private per-dialog variable metadata scan."
    );
}

requireSourceContract(dialogDatasetResolverSource, [
    "runtimeSessionManager.getWorkspaceSnapshot()",
    "dialogColumnsFromWorkspaceObject(object)",
    "runtimeSessionManager.readTabularSchema(object.name)"
], "The shared dialog dataset resolver must prefer the prepared workspace snapshot:");

if (dialogDatasetResolverSource.includes("readVariableMetadata(object.name)")) {
    throw new Error(
        "Opening a dialog must not perform a full variable metadata sweep."
    );
}

requireSourceContract(datasetWarmCacheSource, [
    "readCompleteVariableMetadata",
    "workspace.dataset_variables_named",
    "patchVariableMetadata"
], "The shared metadata cache must warm completely and refresh deltas:");

requireSourceContract(sharedDialogCustomRuntimeSource, [
    "containerObj.__scriptItemSignature === signature"
], "Shared dialogs must not rebuild unchanged variable containers:");

requireSourceContract(sharedDialogContainerSource, [
    "document.createDocumentFragment()",
    "content.replaceChildren(fragment)",
    "|| !control.pinOnTopEnabled"
], "Shared variable containers must batch DOM updates:");

const qrCodeOutput = path.join(outputRoot, "vendor", "qrcode", "qrcode.mjs");
fs.mkdirSync(path.dirname(qrCodeOutput), { recursive: true });
esbuild.buildSync({
    entryPoints: [path.join(sourceRoot, "node_modules", "qrcode", "lib", "browser.js")],
    outfile: qrCodeOutput,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022"
});
