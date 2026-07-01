"use strict";

const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");
const url = require("url");
const childProcess = require("child_process");


const defaultDialogRPath = "/Users/dusadrian/Documents/GitHub/DialogR";

const recommendedWebRPackageLibraryPackages = [
    "admisc",
    "declared",
    "DDIwR",
    "knitr",
    "evaluate",
    "highr",
    "xfun",
    "yaml"
];

const productWebRLibraryReleaseBaseUrl = "https://github.com/dusadrian/binaries/releases/download/WebR";
const productWebRLibraryReleaseApiUrl = "https://api.github.com/repos/dusadrian/binaries/releases/tags/WebR";
const productWebRLibraryAssets = [
    "library.data.gz",
    "library.js.metadata"
];


const readArgs = function(argv) {
    const options = {
        port: 5173,
        host: "127.0.0.1",
        productPath: process.env.DIALOGFORGE_WEB_PRODUCT_PATH || defaultDialogRPath,
        buildOnly: false,
        replacePort: false
    };

    for (let index = 2; index < argv.length; index += 1) {
        const entry = argv[index];

        if (entry === "--build-only") {
            options.buildOnly = true;
            continue;
        }

        if (entry === "--replace-port") {
            options.replacePort = true;
            continue;
        }

        if (entry === "--port") {
            index += 1;
            options.port = Number(argv[index] || options.port);
            continue;
        }

        if (entry === "--host") {
            index += 1;
            options.host = String(argv[index] || options.host);
            continue;
        }

        if (entry === "--product-path") {
            index += 1;
            options.productPath = String(argv[index] || options.productPath);
        }
    }

    return options;
};


const sleepMs = function(milliseconds) {
    Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        Math.max(0, Number(milliseconds) || 0)
    );
};


const readListeningPids = function(port) {
    try {
        const output = childProcess.execFileSync(
            "lsof",
            ["-ti", `TCP:${Number(port)}`, "-sTCP:LISTEN"],
            {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"]
            }
        );

        return Array.from(new Set(
            output
                .split(/\s+/g)
                .map((entry) => Number(entry))
                .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid)
        ));
    }
    catch {
        return [];
    }
};


const waitForPortRelease = function(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (!readListeningPids(port).length) {
            return true;
        }

        sleepMs(100);
    }

    return !readListeningPids(port).length;
};


const killListeningPids = function(pids, signal) {
    for (const pid of pids) {
        try {
            process.kill(pid, signal);
        }
        catch {}
    }
};


const replaceListeningPort = function(port) {
    const initialPids = readListeningPids(port);

    if (!initialPids.length) {
        return;
    }

    console.log(`Stopping existing listener on port ${port}: ${initialPids.join(", ")}`);
    killListeningPids(initialPids, "SIGTERM");

    if (waitForPortRelease(port, 2500)) {
        return;
    }

    const stubbornPids = readListeningPids(port);

    if (stubbornPids.length) {
        console.log(`Force stopping existing listener on port ${port}: ${stubbornPids.join(", ")}`);
        killListeningPids(stubbornPids, "SIGKILL");
        waitForPortRelease(port, 1500);
    }
};


const readText = function(filePath) {
    return fs.readFileSync(filePath, "utf8");
};


const readJson = function(filePath, fallback) {
    try {
        return JSON.parse(readText(filePath));
    }
    catch {
        return fallback;
    }
};


const findProductWebRLibraryDir = function(productPath) {
    const candidates = [
        path.join(productPath, "library/R"),
        path.join(productPath, "library/r"),
        path.join(productPath, "webr/library/R")
    ];

    return candidates.find((candidate) => {
        return fs.existsSync(path.join(candidate, "library.data.gz"))
            && fs.existsSync(path.join(candidate, "library.js.metadata"));
    }) || "";
};


const httpsGet = function(sourceUrl, headers = {}) {
    return new Promise((resolve, reject) => {
        const request = https.get(sourceUrl, {
            headers: {
                "User-Agent": "DialogForge-WebR-library-fetcher",
                ...headers
            }
        }, (response) => {
            if (
                response.statusCode >= 300
                && response.statusCode < 400
                && response.headers.location
            ) {
                response.resume();
                httpsGet(new URL(response.headers.location, sourceUrl).toString(), headers)
                    .then(resolve, reject);
                return;
            }

            resolve(response);
        });

        request.on("error", reject);
    });
};


const readReleaseAssets = async function() {
    const response = await httpsGet(productWebRLibraryReleaseApiUrl, {
        Accept: "application/vnd.github+json"
    });

    if (response.statusCode !== 200) {
        response.resume();
        throw new Error(`Could not read WebR release metadata: HTTP ${response.statusCode}`);
    }

    const chunks = [];

    for await (const chunk of response) {
        chunks.push(chunk);
    }

    const release = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const releaseAssets = Array.isArray(release.assets) ? release.assets : [];

    return new Map(releaseAssets.map((asset) => [String(asset.name || ""), asset]));
};


const isLocalReleaseAssetCurrent = function(targetPath, asset) {
    if (!fs.existsSync(targetPath)) {
        return false;
    }

    const stat = fs.statSync(targetPath);
    const expectedSize = Number(asset?.size || 0);
    const updatedAt = Date.parse(String(asset?.updated_at || asset?.created_at || ""));

    if (expectedSize > 0 && stat.size !== expectedSize) {
        return false;
    }

    if (Number.isFinite(updatedAt) && stat.mtimeMs + 1000 < updatedAt) {
        return false;
    }

    return true;
};


const downloadFile = function(sourceUrl, targetPath) {
    return new Promise((resolve, reject) => {
        const request = https.get(sourceUrl, (response) => {
            if (
                response.statusCode >= 300
                && response.statusCode < 400
                && response.headers.location
            ) {
                response.resume();
                downloadFile(new URL(response.headers.location, sourceUrl).toString(), targetPath)
                    .then(resolve, reject);
                return;
            }

            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error(`Download failed for ${sourceUrl}: HTTP ${response.statusCode}`));
                return;
            }

            const temporaryPath = `${targetPath}.tmp`;
            const output = fs.createWriteStream(temporaryPath);

            response.pipe(output);
            output.on("finish", () => {
                output.close(() => {
                    fs.renameSync(temporaryPath, targetPath);
                    resolve();
                });
            });
            output.on("error", (error) => {
                try {
                    fs.rmSync(temporaryPath, { force: true });
                }
                catch {}
                reject(error);
            });
        });

        request.on("error", reject);
    });
};


const touchDownloadedAsset = function(targetPath, asset) {
    const updatedAt = Date.parse(String(asset?.updated_at || asset?.created_at || ""));

    if (!Number.isFinite(updatedAt)) {
        return;
    }

    const timestamp = new Date(updatedAt);

    fs.utimesSync(targetPath, timestamp, timestamp);
};


const ensureProductWebRLibrary = async function(productPath) {
    const libraryDir = path.join(productPath, "library", "R");
    const releaseAssets = await readReleaseAssets();

    fs.mkdirSync(libraryDir, { recursive: true });

    for (const assetName of productWebRLibraryAssets) {
        const targetPath = path.join(libraryDir, assetName);
        const releaseAsset = releaseAssets.get(assetName);

        if (!releaseAsset) {
            throw new Error(`WebR release asset is missing: ${assetName}`);
        }

        if (isLocalReleaseAssetCurrent(targetPath, releaseAsset)) {
            console.log(`DialogR WebR package library asset ${assetName} is current.`);
            continue;
        }

        const sourceUrl = String(releaseAsset.browser_download_url || "")
            || `${productWebRLibraryReleaseBaseUrl}/${assetName}`;

        console.log(`Downloading DialogR WebR package library asset ${assetName}...`);
        await downloadFile(sourceUrl, targetPath);
        touchDownloadedAsset(targetPath, releaseAsset);
    }

    return libraryDir;
};

const readProductSettings = function(productPath) {
    return readJson(path.join(productPath, "settings/settings.json"), {});
};

const dialogRuntimePackages = function(productPath, dialogId) {
    const settings = readProductSettings(productPath);
    const requirements = settings.dialogRuntimeRequirements || {};
    const entry = requirements[String(dialogId || "")] || {};
    const packages = Array.isArray(entry.rPackages)
        ? entry.rPackages
        : String(entry.rPackages || "").split(/[;,\n]/g);

    return Array.from(new Set(packages.map((item) => {
        return String(item || "").trim();
    }).filter(Boolean)));
};


const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".gz": "application/gzip",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".ttf": "font/ttf",
    ".wasm": "application/wasm"
};


const findRootDir = function() {
    const parentDir = path.resolve(__dirname, "..");

    return path.basename(parentDir) === "dist"
        ? parentDir
        : path.join(parentDir, "dist");
};


const findSourceRootDir = function(rootDir) {
    return path.basename(rootDir) === "dist"
        ? path.resolve(rootDir, "..")
        : rootDir;
};


const serializeComposition = function(rootDir, productPath) {
    const {
        composeBrowserApplication
    } = require(path.join(rootDir, "shared/shell-web/browserComposition"));
    const inertDialogSurfaceController = {
        open: function() {
            throw new Error("Browser dialog surfaces are only available in the browser page.");
        },
        close: function() {
            return;
        },
        focus: function() {
            return;
        },
        has: function() {
            return false;
        }
    };
    const inertFileAdapter = {
        createFileReference: function(file) {
            return {
                id: "server.composition.file",
                name: file?.name || "",
                size: file?.size || 0,
                type: file?.type || "",
                lastModified: file?.lastModified || 0,
                source: "virtual"
            };
        },
        readText: async function() {
            return "";
        },
        readBuffer: async function() {
            return new Uint8Array();
        },
        selectFiles: async function() {
            return {
                canceled: true,
                files: [],
                message: "Server-side composition cannot select browser files."
            };
        },
        download: async function(request) {
            return {
                id: "server.composition.download",
                name: request?.name || "download.bin",
                size: 0,
                type: request?.type || "application/octet-stream",
                lastModified: Date.now(),
                source: "virtual"
            };
        }
    };
    const inertStorageAdapter = {
        readSettings: function() {
            return {};
        },
        writeSettings: function(settings) {
            return Object.assign({}, settings);
        },
        readWorkspaceState: function() {
            return {};
        },
        writeWorkspaceState: function(state) {
            return Object.assign({}, state);
        }
    };
    const result = composeBrowserApplication({
        rootDir,
        productPath,
        productId: "DialogR",
        runtime: "webr",
        persistedRuntimeProvider: "webr",
        dialogSurfaceController: inertDialogSurfaceController,
        fileAdapter: inertFileAdapter,
        storageAdapter: inertStorageAdapter
    });
    const composition = result.composition;

    return {
        host: result.host,
        locale: composition.locale,
        product: composition.product,
        runtime: composition.runtime,
        runtimeProviderSelection: composition.runtimeProviderSelection,
        runtimeSession: composition.runtimeSession,
        sharedDialogs: composition.sharedDialogs,
        productDialogs: composition.productDialogs,
        menu: composition.menu,
        windowTitle: composition.windowTitle
    };
};


const createBuildManifest = function(rootDir, productPath) {
    const manifestPath = path.join(
        rootDir,
        "shared/shell-web/build/dialogr-web-manifest.json"
    );
    const composition = serializeComposition(rootDir, productPath);

    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(
        manifestPath,
        `${JSON.stringify({
            createdAt: new Date().toISOString(),
            productPath,
            entrypoint: "shared/shell-web/pages/dialogr.html",
            webrAssetBase: "node_modules/webr/dist",
            product: composition.product,
            runtime: composition.runtime,
            dialogs: composition.productDialogs.map((dialog) => {
                return {
                    id: dialog.id,
                    label: dialog.label || dialog.id
                };
            })
        }, null, 4)}\n`
    );

    return manifestPath;
};


const send = function(response, status, headers, body) {
    response.writeHead(status, Object.assign({
        "Cache-Control": "no-store, max-age=0",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Pragma": "no-cache"
    }, headers));
    response.end(body);
};


const sendJson = function(response, value) {
    send(response, 200, {
        "Content-Type": "application/json; charset=utf-8"
    }, `${JSON.stringify(value, null, 4)}\n`);
};


const resolveSafeFile = function(root, requestPath) {
    const decoded = decodeURIComponent(requestPath);
    const target = path.resolve(root, decoded.replace(/^\/+/, ""));

    if (!target.startsWith(path.resolve(root))) {
        return null;
    }

    if (
        !path.extname(target)
        && fs.existsSync(`${target}.js`)
        && fs.statSync(`${target}.js`).isFile()
    ) {
        return `${target}.js`;
    }

    return target;
};


const serveFile = function(response, filePath) {
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        send(response, 404, {
            "Content-Type": "text/plain; charset=utf-8"
        }, "Not found");
        return;
    }

    send(response, 200, {
        "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
        "Cross-Origin-Resource-Policy": "same-origin"
    }, fs.readFileSync(filePath));
};


const createWebDialogRDevServer = function(options) {
    const rootDir = findRootDir();
    const sourceRoot = findSourceRootDir(rootDir);
    const productPath = path.resolve(options.productPath || defaultDialogRPath);
    const webrRoot = path.join(sourceRoot, "node_modules/webr/dist");
    const monacoRoot = path.join(sourceRoot, "node_modules/monaco-editor/min");
    const preactRoot = path.join(sourceRoot, "node_modules/preact");
    const productWebRLibraryDir = findProductWebRLibraryDir(productPath);

    return http.createServer((request, response) => {
        const parsed = url.parse(request.url || "/");
        const pathname = parsed.pathname || "/";

        try {
            if (pathname === "/" || pathname === "/dialogr") {
                serveFile(
                    response,
                    path.join(rootDir, "shared/shell-web/pages/dialogr.html")
                );
                return;
            }

            if (pathname === "/api/composition") {
                sendJson(response, serializeComposition(rootDir, productPath));
                return;
            }

            if (pathname === "/api/webr-package-library") {
                if (!productWebRLibraryDir) {
                    sendJson(response, {
                        available: false,
                        message: "No product WebR package library bundle is available."
                    });
                    return;
                }

                sendJson(response, {
                    available: true,
                    mountpoint: "/dialogr-library",
                    recommendedPackages: recommendedWebRPackageLibraryPackages,
                    requiredForNativeHelpExamples: [
                        "knitr",
                        "evaluate",
                        "highr",
                        "xfun",
                        "yaml"
                    ],
                    metadataUrl: "/webr-library/library.js.metadata",
                    dataUrl: "/webr-library/library.data.gz"
                });
                return;
            }

            if (pathname.startsWith("/api/dialog/")) {
                const dialogId = path.basename(pathname);
                const dialogs = readJson(path.join(productPath, "dialogs/dialogs.json"), []);
                const dialog = dialogs.find((entry) => {
                    return entry.id === dialogId;
                });
                const sharedDialogs = readJson(
                    path.join(rootDir, "shared/base-app/dialogs/dialogs.json"),
                    []
                );
                const sharedDialog = sharedDialogs.find((entry) => {
                    return entry.id === dialogId;
                });

                if (!dialog && !sharedDialog) {
                    send(response, 404, {
                        "Content-Type": "text/plain; charset=utf-8"
                    }, "Dialog not found");
                    return;
                }

                const activeDialog = dialog || sharedDialog;
                const ownerRoot = dialog
                    ? path.join(productPath, "dialogs")
                    : path.join(rootDir, "shared/base-app/dialogs");
                const dialogFile = path.join(ownerRoot, activeDialog.sourceFile || "");
                const actionFile = path.join(path.dirname(dialogFile), "actions.js");

                sendJson(response, {
                    definition: activeDialog,
                    source: readJson(dialogFile, {}),
                    runtimeRequirements: {
                        rPackages: dialog ? dialogRuntimePackages(productPath, dialog.id) : []
                    },
                    actions: fs.existsSync(actionFile) ? readText(actionFile) : ""
                });
                return;
            }

            if (pathname.startsWith("/webr/")) {
                serveFile(response, resolveSafeFile(
                    webrRoot,
                    pathname.replace(/^\/webr\//, "")
                ));
                return;
            }

            if (pathname.startsWith("/webr-library/")) {
                if (!productWebRLibraryDir) {
                    send(response, 404, {
                        "Content-Type": "text/plain; charset=utf-8"
                    }, "No product WebR package library bundle is available.");
                    return;
                }

                serveFile(response, resolveSafeFile(
                    productWebRLibraryDir,
                    pathname.replace(/^\/webr-library\//, "")
                ));
                return;
            }

            if (pathname.startsWith("/monaco/")) {
                serveFile(response, resolveSafeFile(
                    monacoRoot,
                    pathname.replace(/^\/monaco\//, "")
                ));
                return;
            }

            if (pathname === "/vendor/preact/preact.module.js") {
                serveFile(response, path.join(
                    preactRoot,
                    "dist/preact.module.js"
                ));
                return;
            }

            if (pathname === "/vendor/preact/hooks.module.js") {
                serveFile(response, path.join(
                    preactRoot,
                    "hooks/dist/hooks.module.js"
                ));
                return;
            }

            if (pathname.startsWith("/shared/")) {
                serveFile(response, resolveSafeFile(rootDir, pathname));
                return;
            }

            if (pathname.startsWith("/products/")) {
                serveFile(response, resolveSafeFile(rootDir, pathname));
                return;
            }

            if (pathname.startsWith("/browser-esm/")) {
                serveFile(response, resolveSafeFile(rootDir, pathname));
                return;
            }

            send(response, 404, {
                "Content-Type": "text/plain; charset=utf-8"
            }, "Not found");
        }
        catch (error) {
            send(response, 500, {
                "Content-Type": "text/plain; charset=utf-8"
            }, error instanceof Error ? error.stack || error.message : String(error));
        }
    });
};


const main = async function() {
    const options = readArgs(process.argv);
    const rootDir = findRootDir();
    const productPath = path.resolve(options.productPath || defaultDialogRPath);

    if (options.buildOnly) {
        await ensureProductWebRLibrary(productPath);
        const manifestPath = createBuildManifest(
            rootDir,
            productPath
        );

        console.log(`DialogR web build manifest written to ${manifestPath}`);
        return;
    }

    if (options.replacePort) {
        replaceListeningPort(options.port);
    }

    await ensureProductWebRLibrary(productPath);

    const server = createWebDialogRDevServer(options);

    server.listen(options.port, options.host, () => {
        console.log(`DialogR Web is available at http://${options.host}:${options.port}/`);
    });
};


if (require.main === module) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}


module.exports = {
    createBuildManifest,
    createWebDialogRDevServer,
    serializeComposition
};
