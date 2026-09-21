"use strict";

const childProcess = require("child_process");
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");

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

// The WebR runtime and Monaco are the two heaviest asset trees the browser
// downloads, and they only change when their package changes. Serving them
// under a prefix stamped with their own content lets them be cached
// permanently: an unchanged tree keeps its cache across deployments, and any
// change moves every URL at once so no client can hold a stale runtime.
const listFilesRecursively = function(root) {
    if (!fs.existsSync(root)) {
        return [];
    }

    return fs.readdirSync(root, { withFileTypes: true }).flatMap(function(entry) {
        const entryPath = path.join(root, entry.name);

        return entry.isDirectory()
            ? listFilesRecursively(entryPath)
            : [entryPath];
    });
};

// Mirrors findRuntimeDependencyRoot in the web product server: the staged copy
// under the build output is what actually gets served when it exists.
const findServedDependencyRoot = function(packageName, packageSubPath) {
    const stagedRoot = path.join(
        outputRoot,
        "node_modules",
        packageName,
        packageSubPath
    );

    return fs.existsSync(stagedRoot)
        ? stagedRoot
        : path.join(sourceRoot, "node_modules", packageName, packageSubPath);
};

const stampedAssetTrees = {
    webr: findServedDependencyRoot("webr", "dist"),
    monaco: findServedDependencyRoot("monaco-editor", "min")
};
const assetStampDigest = createHash("sha256");

Object.entries(stampedAssetTrees).forEach(function([name, root]) {
    assetStampDigest.update(name);

    listFilesRecursively(root).sort().forEach(function(filePath) {
        assetStampDigest.update(path.relative(root, filePath));
        assetStampDigest.update(fs.readFileSync(filePath));
    });
});

const assetStamp = assetStampDigest.digest("hex").slice(0, 16);

// Anchored to the opening quote so it only rewrites URLs, never the
// src/runtime/providers/webr/ segment inside a module path. Only the
// unstamped prefix matches, so rewriting is idempotent.
const unstampedAssetUrl = /(["'`])\/(webr|monaco)\//g;
const stampAssetUrls = function(source) {
    return source.replaceAll(unstampedAssetUrl, `$1/$2-${assetStamp}/`);
};

// consoleSyntax.js holds every Monaco URL and is loaded unbundled by the
// script editor frame as well as bundled into the shell, so the whole emitted
// tree is stamped rather than just the bundles.
listFilesRecursively(browserModuleOutput)
    .filter(function(filePath) {
        return filePath.endsWith(".js");
    })
    .forEach(function(filePath) {
        const source = fs.readFileSync(filePath, "utf8");
        const stamped = stampAssetUrls(source);

        if (stamped !== source) {
            fs.writeFileSync(filePath, stamped);
        }
    });

fs.writeFileSync(
    path.join(browserModuleOutput, "asset-stamp.json"),
    `${JSON.stringify({ assetStamp }, null, 4)}\n`
);

// Keep the shared renderer and preload bridge together. Loading their source
// module graph over HTTP adds a network round trip at every dependency level.
// The product extension must still initialize before the renderer starts.
esbuild.buildSync({
    stdin: {
        contents: [
            "import './src/base-app/pages/shared/plotViewportInteractions.js';",
            "await import('./src/shell-web/browserPreloadBridge');",
            "await import('/api/product-dialog-runtime.js');",
            "await import('./src/dialog-runtime/renderer/modules/dialogBuilderInterface');"
        ].join("\n"),
        resolveDir: sourceRoot,
        sourcefile: "dialogBuilderBrowser.js"
    },
    outfile: path.join(browserModuleOutput, "dialogBuilder.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    external: ["/api/product-dialog-runtime.js"]
});

const dialogBundle = fs.readFileSync(
    path.join(browserModuleOutput, "dialogBuilder.js")
);
const dialogBundleHash = createHash("sha256")
    .update(dialogBundle)
    .digest("hex")
    .slice(0, 16);
const dialogBundleName = `dialogBuilder-${dialogBundleHash}.js`;

fs.writeFileSync(path.join(browserModuleOutput, dialogBundleName), dialogBundle);

// The shell entry is the same problem one level up: it pulls 298 modules over
// HTTP, seven import levels deep, and a level is only discovered once the
// previous one has parsed. That is round trips, not bytes, so it hurts most on
// exactly the slow connections we care about. Bundle it like the dialog
// renderer above.
//
// shell.js is the only module that imports by served URL rather than by
// relative path, so its own specifiers are rewritten to the emitted modules
// and everything below it resolves on disk. /api/* is generated per product by
// the web server and /webr/* resolves its own worker relative to itself, so
// both stay URLs.
const shellEntrySource = path.join(sourceRoot, "src/shell-web/pages/shell.js");
const shellExternalModules = [
    "/api/product-contribution.js",
    `/webr-${assetStamp}/webr.js`
];
const shellEntryPath = path.join(browserModuleOutput, "shellEntry.generated.js");

// Two Node-only modules hang off lazy require() calls the browser never
// evaluates: it routes imports and dialog sources through its own adapters.
// Unbundled, those requires were simply never reached. Bundled, esbuild has to
// resolve their "fs" and "path" imports, so point them at stubs that keep the
// same failure if a dead path is ever taken in a browser.
const nodeStubs = {
    fs: ["existsSync", "readFileSync"],
    path: ["dirname", "isAbsolute", "join", "relative", "resolve"]
};
const nodeStubPaths = Object.fromEntries(
    Object.entries(nodeStubs).map(function([moduleName, members]) {
        const stubPath = path.join(
            browserModuleOutput,
            `node-${moduleName}-stub.generated.js`
        );

        fs.writeFileSync(stubPath, [
            "const unavailable = function() {",
            `    throw new Error("Node ${moduleName} is not available in the browser shell.");`,
            "};",
            "",
            ...members.map(function(member) {
                return `export const ${member} = unavailable;`;
            }),
            ...(moduleName === "path" ? ['export const sep = "/";'] : []),
            `export default { ${members.join(", ")}${
                moduleName === "path" ? ", sep" : ""
            } };`,
            ""
        ].join("\n"));

        return [moduleName, stubPath];
    })
);

fs.writeFileSync(
    shellEntryPath,
    stampAssetUrls(fs.readFileSync(shellEntrySource, "utf8")).replaceAll(
        /(["'])\/browser-esm\/([^"']+)\1/g,
        function(match, quote, modulePath) {
            const requested = modulePath.split(/[?#]/)[0];
            const candidates = path.extname(requested)
                ? [requested]
                : [`${requested}.js`, path.join(requested, "index.js")];
            const resolved = candidates.find(function(candidate) {
                return fs.existsSync(path.join(browserModuleOutput, candidate));
            });

            if (!resolved) {
                throw new Error(
                    `shell.js imports a module that was not emitted: /browser-esm/${modulePath}`
                );
            }

            return `${quote}./${resolved}${quote}`;
        }
    )
);

esbuild.buildSync({
    entryPoints: [shellEntryPath],
    outfile: path.join(browserModuleOutput, "shell.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    // preact stays on the page importmap so the shell and the dialog renderer
    // keep sharing one copy.
    external: ["preact", "preact/hooks", ...shellExternalModules],
    alias: nodeStubPaths
});

fs.rmSync(shellEntryPath, { force: true });
Object.values(nodeStubPaths).forEach(function(stubPath) {
    fs.rmSync(stubPath, { force: true });
});

const shellBundle = fs.readFileSync(path.join(browserModuleOutput, "shell.js"));
const shellBundleHash = createHash("sha256")
    .update(shellBundle)
    .digest("hex")
    .slice(0, 16);
const shellBundleName = `shell-${shellBundleHash}.js`;

fs.writeFileSync(path.join(browserModuleOutput, shellBundleName), shellBundle);

esbuild.buildSync({
    stdin: {
        contents: [
            "@import './src/base-app/pages/dialogBuilder.css';",
            "@import './src/base-app/pages/shared/dmSelect.css';",
            "@import './src/base-app/pages/shared/appCodicon.css';"
        ].join("\n"),
        loader: "css",
        resolveDir: sourceRoot,
        sourcefile: "dialogBuilderBrowser.css"
    },
    outfile: path.join(browserModuleOutput, "dialogBuilder.css"),
    bundle: true,
    assetNames: "dialog-assets/[name]-[hash]",
    loader: {
        ".svg": "file",
        ".ttf": "file"
    }
});

const dialogStylesheet = fs.readFileSync(
    path.join(browserModuleOutput, "dialogBuilder.css")
);
const dialogStylesheetHash = createHash("sha256")
    .update(dialogStylesheet)
    .digest("hex")
    .slice(0, 16);
const dialogStylesheetName = `dialogBuilder-${dialogStylesheetHash}.css`;

fs.writeFileSync(
    path.join(browserModuleOutput, dialogStylesheetName),
    dialogStylesheet
);

// The shell's service worker keeps the heavy runtime in Cache Storage, which
// persistent storage exempts from the automatic eviction the HTTP cache is
// subject to. The UI build id updates the worker when bundles change; the
// independent asset stamp keeps unchanged runtime files across those updates.
const serviceWorkerBuildId = createHash("sha256")
    .update([assetStamp, shellBundleName, dialogBundleName, dialogStylesheetName].join("\u0000"))
    .digest("hex")
    .slice(0, 16);
const serviceWorkerSource = fs.readFileSync(
    path.join(sourceRoot, "src/shell-web/serviceWorker.js"),
    "utf8"
);

if (!serviceWorkerSource.includes("DIALOGFORGE_BUILD_ID")) {
    throw new Error(
        "src/shell-web/serviceWorker.js no longer carries the DIALOGFORGE_BUILD_ID placeholder."
    );
}

if (!serviceWorkerSource.includes("DIALOGFORGE_RUNTIME_STAMP")) {
    throw new Error(
        "src/shell-web/serviceWorker.js no longer carries the DIALOGFORGE_RUNTIME_STAMP placeholder."
    );
}

fs.writeFileSync(
    path.join(outputRoot, "sw.js"),
    serviceWorkerSource
        .replaceAll("DIALOGFORGE_BUILD_ID", serviceWorkerBuildId)
        .replaceAll("DIALOGFORGE_RUNTIME_STAMP", assetStamp)
);

// Preload the versioned resource in the shell so each dialog iframe can reuse
// it from the HTTP cache. A new build gets a new URL when its code changes.
for (const relativePath of [
    "src/base-app/pages/dialogBuilder.html",
    "src/shell-web/pages/shell.html"
]) {
    const source = fs.readFileSync(path.join(sourceRoot, relativePath), "utf8");
    const outputPath = path.join(outputRoot, relativePath);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
        outputPath,
        source
            .replaceAll(
                "/browser-esm/dialogBuilder.js",
                `/browser-esm/${dialogBundleName}`
            )
            .replaceAll(
                "/browser-esm/dialogBuilder.css",
                `/browser-esm/${dialogStylesheetName}`
            )
            .replaceAll(
                "/src/shell-web/pages/shell.js",
                `/browser-esm/${shellBundleName}`
            )
    );
}

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
    "readDialogContentSizeFromSource(entry.payload)",
    "state.dialogPayloads.get(frame)",
    "state.dialogPayloads.set(entry.surface.frame, entry.payload)",
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
