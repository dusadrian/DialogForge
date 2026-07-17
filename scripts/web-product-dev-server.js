"use strict";

const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");
const url = require("url");
const childProcess = require("child_process");


const productWebRLibraryReleaseRepository = "dusadrian/binaries";
const productWebRLibraryAssets = [
    "library.data.gz",
    "library.js.metadata"
];


const readArgs = function(argv) {
    const options = {
        port: 5173,
        host: "127.0.0.1",
        productPath: process.env.DIALOGFORGE_WEB_PRODUCT_PATH || "",
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
            continue;
        }

        if (!entry.startsWith("-") && !options.productPath) {
            options.productPath = entry;
        }
    }

    return options;
};


const resolveRequiredProductPath = function(productPath) {
    const cleanPath = String(productPath || "").trim();

    if (!cleanPath) {
        throw new Error(
            "Missing product path. Pass /path/to/product or set DIALOGFORGE_WEB_PRODUCT_PATH."
        );
    }

    return path.resolve(cleanPath);
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


const readObject = function(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
};


const readProductMetadata = function(productPath) {
    const packageJson = readJson(path.join(productPath, "package.json"), {});
    const product = readObject(packageJson.product);

    return Object.assign({}, product, {
        name: String(
            product.name
                || product.displayName
                || packageJson.productName
                || packageJson.name
                || ""
        ).trim(),
        version: String(packageJson.version || "").trim(),
        description: String(packageJson.description || "").trim()
    });
};


const readProductWebRLibraryRelease = function(productPath) {
    const product = readProductMetadata(productPath);
    const settings = readJson(path.join(productPath, "settings/settings.json"), {});
    const configuration = Object.assign(
        {},
        readObject(product.webRPackageLibrary),
        readObject(settings.webRPackageLibrary)
    );
    const releaseTag = String(
        configuration.releaseTag
            || configuration.githubReleaseTag
            || ""
    ).trim();

    if (!releaseTag) {
        return {
            releaseTag: "",
            baseUrl: "",
            apiUrl: ""
        };
    }

    const encodedTag = encodeURIComponent(releaseTag);

    return {
        releaseTag,
        baseUrl:
            `https://github.com/${productWebRLibraryReleaseRepository}/releases/download/${encodedTag}`,
        apiUrl:
            `https://api.github.com/repos/${productWebRLibraryReleaseRepository}/releases/tags/${encodedTag}`
    };
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


const readReleaseAssets = async function(release) {
    if (!release.apiUrl) {
        throw new Error(
            "Product WebR package library release tag is not configured."
        );
    }

    const response = await httpsGet(release.apiUrl, {
        Accept: "application/vnd.github+json"
    });

    if (response.statusCode !== 200) {
        response.resume();
        throw new Error(
            `Could not read product WebR package library release metadata for ${release.releaseTag}: HTTP ${response.statusCode}`
        );
    }

    const chunks = [];

    for await (const chunk of response) {
        chunks.push(chunk);
    }

    const releasePayload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const releaseAssets = Array.isArray(releasePayload.assets)
        ? releasePayload.assets
        : [];

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
    const existingLibraryDir = findProductWebRLibraryDir(productPath);

    if (existingLibraryDir) {
        console.log(`Using local product WebR package library at ${existingLibraryDir}.`);
        return existingLibraryDir;
    }

    const libraryDir = path.join(productPath, "library", "R");

    fs.mkdirSync(libraryDir, { recursive: true });

    const release = readProductWebRLibraryRelease(productPath);
    let releaseAssets = new Map();

    try {
        releaseAssets = await readReleaseAssets(release);
    }
    catch (error) {
        const missingAssetNames = productWebRLibraryAssets.filter((assetName) => {
            return !fs.existsSync(path.join(libraryDir, assetName));
        });

        if (!missingAssetNames.length) {
            console.warn(
                "Could not read product WebR package library release metadata; using the existing local product WebR package library."
            );
            return libraryDir;
        }

        if (!release.releaseTag) {
            throw error;
        }

        console.warn(
            "Could not read product WebR package library release metadata; missing assets will be downloaded from fixed release URLs."
        );
    }

    for (const assetName of productWebRLibraryAssets) {
        const targetPath = path.join(libraryDir, assetName);
        const releaseAsset = releaseAssets.get(assetName);

        if (releaseAsset && isLocalReleaseAssetCurrent(targetPath, releaseAsset)) {
            console.log(`Product WebR package library asset ${assetName} is current.`);
            continue;
        }

        if (!releaseAsset && fs.existsSync(targetPath)) {
            console.log(`Keeping existing product WebR package library asset ${assetName}.`);
            continue;
        }

        const sourceUrl = String(releaseAsset?.browser_download_url || "")
            || `${release.baseUrl}/${assetName}`;

        console.log(
            `Downloading product WebR package library asset ${assetName} from ${release.releaseTag}...`
        );
        await downloadFile(sourceUrl, targetPath);
        touchDownloadedAsset(targetPath, releaseAsset);
    }

    return libraryDir;
};

const readProductSettings = function(productPath) {
    return readJson(path.join(productPath, "settings/settings.json"), {});
};


const readStringSetting = function(settings, name, fallback) {
    const value = settings[name];

    return typeof value === "string" && value.trim()
        ? value.trim()
        : fallback;
};


const normalizeRoutePrefix = function(value) {
    const routePrefix = value.startsWith("/")
        ? value
        : `/${value}`;

    return routePrefix.endsWith("/")
        ? routePrefix
        : `${routePrefix}/`;
};


const normalizeFileExtension = function(value) {
    if (!value) {
        return "";
    }

    return value.startsWith(".")
        ? value
        : `.${value}`;
};


const normalizeEntryPath = function(value) {
    const entryPath = String(value || "").trim();

    if (!entryPath) {
        return "";
    }

    return entryPath.startsWith("/")
        ? entryPath
        : `/${entryPath}`;
};


const readStringListSetting = function(settings, name) {
    const value = settings[name];

    return Array.isArray(value)
        ? value.map(normalizeEntryPath).filter(Boolean)
        : [];
};


const readProductWebEntryPaths = function(productPath) {
    const settings = readProductSettings(productPath);
    const product = readProductMetadata(productPath);
    const entries = [
        "/",
        ...readStringListSetting(product, "webEntrypoints"),
        ...readStringListSetting(settings, "webEntrypoints")
    ];

    return Array.from(new Set(entries));
};


const readProductWebLaunchPolicy = function(productPath) {
    const settings = readProductSettings(productPath);
    const product = readProductMetadata(productPath);
    const policy = Object.assign(
        {},
        readObject(product.webLaunch),
        readObject(settings.webLaunch)
    );
    const hasLaunchPolicy = Object.keys(policy).length > 0;

    const routePrefix = normalizeRoutePrefix(readStringSetting(
        policy,
        "routePrefix",
        "/"
    ));
    const datasetExtension = normalizeFileExtension(readStringSetting(
        policy,
        "datasetExtension",
        ".rds"
    ));
    const metadataExtension = normalizeFileExtension(readStringSetting(
        policy,
        "metadataExtension",
        ".json"
    ));

    return {
        enabled: hasLaunchPolicy && policy.enabled !== false,
        startPath: readStringSetting(policy, "startPath", ""),
        queryKey: readStringSetting(policy, "queryKey", ""),
        routePrefix,
        tokenPattern: readStringSetting(policy, "tokenPattern", "^$"),
        dataRootEnv: readStringSetting(
            policy,
            "dataRootEnv",
            "DIALOGFORGE_WEB_LAUNCH_DATA_ROOT"
        ),
        defaultDataRoot: readStringSetting(policy, "defaultDataRoot", ""),
        datasetResource: readStringSetting(policy, "datasetResource", ""),
        metadataResource: readStringSetting(policy, "metadataResource", ""),
        datasetExtension,
        metadataExtension,
        datasetName: readStringSetting(policy, "datasetName", "")
    };
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
    ".map": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".ttf": "font/ttf",
    ".wasm": "application/wasm"
};


const findRootDir = function() {
    if (process.env.DIALOGFORGE_DIST_DIR) {
        return path.resolve(process.env.DIALOGFORGE_DIST_DIR);
    }

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


const findRuntimeDependencyRoot = function(rootDir, sourceRoot, packageName, packageSubPath = "") {
    const stagedRoot = path.join(rootDir, "node_modules", packageName, packageSubPath);

    if (fs.existsSync(stagedRoot)) {
        return stagedRoot;
    }

    return path.join(sourceRoot, "node_modules", packageName, packageSubPath);
};


const requiredWebRuntimeFiles = [
    path.join("node_modules", "preact", "dist", "preact.module.js"),
    path.join("node_modules", "preact", "hooks", "dist", "hooks.module.js"),
    path.join("node_modules", "webr", "dist", "webr.js"),
    path.join("node_modules", "monaco-editor", "min", "vs", "loader.js"),
    path.join("node_modules", "sortablejs", "modular", "sortable.esm.js")
];


const assertStagedWebRuntimeDependencies = function(rootDir) {
    const missingFiles = requiredWebRuntimeFiles.filter((relativePath) => {
        const filePath = path.join(rootDir, relativePath);

        return !fs.existsSync(filePath) || !fs.statSync(filePath).isFile();
    });

    if (missingFiles.length) {
        throw new Error(
            [
                "Web product build is not self-contained.",
                "Run npm run build:web so web runtime dependencies are staged under dist/node_modules.",
                `Missing: ${missingFiles.join(", ")}`
            ].join(" ")
        );
    }
};


const serializeComposition = function(rootDir, productPath, options = {}) {
    const {
        composeBrowserApplication
    } = require(path.join(rootDir, "src/shell-web/browserComposition"));
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
        productId: "base",
        locale: options.locale,
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
        availableLocales: composition.availableLocales,
        i18n: composition.i18n,
        product: composition.product,
        productAbout: composition.productAbout,
        runtime: composition.runtime,
        runtimeProviderSelection: composition.runtimeProviderSelection,
        runtimeSession: composition.runtimeSession,
        productSettings: composition.productSettings,
        sharedDialogs: composition.sharedDialogs,
        productDialogs: composition.productDialogs,
        menu: composition.menu,
        windowTitle: composition.windowTitle
    };
};


const createWebRPackageLibraryApiManifest = function(rootDir, available) {
    const {
        createAvailableWebRPackageLibraryManifest,
        createUnavailableWebRPackageLibraryManifest
    } = require(path.join(rootDir, "src/runtime/providers/webr/webRPackageLibraryPolicy"));

    return available
        ? createAvailableWebRPackageLibraryManifest()
        : createUnavailableWebRPackageLibraryManifest();
};


const createBuildManifest = function(rootDir, productPath) {
    const manifestPath = path.join(
        rootDir,
        "src/shell-web/build/shell-web-manifest.json"
    );

    assertStagedWebRuntimeDependencies(rootDir);

    const composition = serializeComposition(rootDir, productPath);

    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(
        manifestPath,
        `${JSON.stringify({
            createdAt: new Date().toISOString(),
            productPath,
            entrypoint: "src/shell-web/pages/shell.html",
            webrAssetBase: "node_modules/webr/dist",
            locale: composition.locale,
            availableLocales: composition.availableLocales,
            i18n: composition.i18n,
            product: composition.product,
            productAbout: composition.productAbout,
            runtime: composition.runtime,
            runtimeProviderSelection: composition.runtimeProviderSelection,
            runtimeSession: composition.runtimeSession,
            sharedDialogs: composition.sharedDialogs,
            productDialogs: composition.productDialogs,
            menu: composition.menu,
            windowTitle: composition.windowTitle,
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
        "Cross-Origin-Resource-Policy": "same-origin",
        "Pragma": "no-cache"
    }, headers));
    response.end(body);
};


const sendJson = function(response, value) {
    send(response, 200, {
        "Content-Type": "application/json; charset=utf-8"
    }, `${JSON.stringify(value, null, 4)}\n`);
};


const sendJsonStatus = function(response, status, value) {
    send(response, status, {
        "Content-Type": "application/json; charset=utf-8"
    }, `${JSON.stringify(value, null, 4)}\n`);
};


const isSafeLaunchToken = function(launchPolicy, token) {
    if (typeof token !== "string") {
        return false;
    }

    try {
        return new RegExp(launchPolicy.tokenPattern).test(token);
    }
    catch {
        return false;
    }
};


const resolveLaunchDataRoot = function(launchPolicy) {
    if (!launchPolicy.enabled) {
        return "";
    }

    return path.resolve(
        process.env[launchPolicy.dataRootEnv]
            || launchPolicy.defaultDataRoot
    );
};


const resolveLaunchDatasetFile = function(launchPolicy, launchDataRoot, token) {
    if (!isSafeLaunchToken(launchPolicy, token)) {
        return null;
    }

    return path.join(launchDataRoot, `${token}${launchPolicy.datasetExtension}`);
};


const resolveLaunchMetadataFile = function(launchPolicy, launchDataRoot, token) {
    if (!isSafeLaunchToken(launchPolicy, token)) {
        return null;
    }

    return path.join(launchDataRoot, `${token}${launchPolicy.metadataExtension}`);
};


const readLaunchRoute = function(launchPolicy, pathname) {
    if (!launchPolicy.enabled || !pathname.startsWith(launchPolicy.routePrefix)) {
        return null;
    }

    const parts = pathname.slice(launchPolicy.routePrefix.length).split("/");

    if (parts.length !== 2) {
        return {
            invalid: true
        };
    }

    return {
        token: parts[0],
        resource: parts[1]
    };
};


const readLaunchTokenQuery = function(launchPolicy, parsedUrl) {
    const query = new URLSearchParams(parsedUrl.query || "");
    const token = String(query.get(launchPolicy.queryKey) || "").trim();

    return token || "";
};


const createLaunchDatasetUrl = function(launchPolicy, token) {
    return `${launchPolicy.routePrefix}${encodeURIComponent(token)}/${launchPolicy.datasetResource}`;
};


const createLaunchDatasetFileName = function(launchPolicy, token) {
    return `${token}${launchPolicy.datasetExtension}`;
};


const sendLaunchMetadata = function(response, launchPolicy, launchDataRoot, token) {
    if (!isSafeLaunchToken(launchPolicy, token)) {
        sendJsonStatus(response, 400, {
            ok: false,
            message: "Invalid launch token."
        });
        return;
    }

    const metadataPath = resolveLaunchMetadataFile(launchPolicy, launchDataRoot, token);
    const datasetPath = resolveLaunchDatasetFile(launchPolicy, launchDataRoot, token);
    const metadata = metadataPath && fs.existsSync(metadataPath)
        ? readJson(metadataPath, {})
        : {};

    if (!datasetPath || !fs.existsSync(datasetPath) || !fs.statSync(datasetPath).isFile()) {
        sendJsonStatus(response, 404, {
            ok: false,
            message: "Launch token was not found."
        });
        return;
    }

    sendJson(response, Object.assign({}, metadata, {
        ok: true,
        token,
        datasetName: launchPolicy.datasetName,
        datasetFile: createLaunchDatasetFileName(launchPolicy, token),
        hasDataset: true,
        datasetUrl: createLaunchDatasetUrl(launchPolicy, token)
    }));
};


const sendLaunchDataset = function(response, launchPolicy, launchDataRoot, token) {
    if (!isSafeLaunchToken(launchPolicy, token)) {
        sendJsonStatus(response, 400, {
            ok: false,
            message: "Invalid launch token."
        });
        return;
    }

    const datasetPath = resolveLaunchDatasetFile(launchPolicy, launchDataRoot, token);

    if (!datasetPath || !fs.existsSync(datasetPath) || !fs.statSync(datasetPath).isFile()) {
        sendJsonStatus(response, 404, {
            ok: false,
            message: "Launch dataset was not found."
        });
        return;
    }

    send(response, 200, {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${createLaunchDatasetFileName(launchPolicy, token)}"`,
        "Cross-Origin-Resource-Policy": "same-origin"
    }, fs.readFileSync(datasetPath));
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

    if (
        !path.extname(target)
        && fs.existsSync(path.join(target, "index.js"))
        && fs.statSync(path.join(target, "index.js")).isFile()
    ) {
        return path.join(target, "index.js");
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


const findProductStylesheet = function(productPath) {
    const candidates = [
        path.join(productPath, "web/product.css"),
        path.join(productPath, "assets/product.css"),
        path.join(productPath, "product.css")
    ];

    return candidates.find((candidate) => {
        return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    }) || "";
};


const serveProductStylesheet = function(response, productPath) {
    const stylesheet = findProductStylesheet(productPath);

    if (stylesheet) {
        serveFile(response, stylesheet);
        return;
    }

    send(response, 200, {
        "Content-Type": "text/css; charset=utf-8",
        "Cross-Origin-Resource-Policy": "same-origin"
    }, "");
};


const createWebProductDevServer = function(options) {
    const rootDir = findRootDir();
    const sourceRoot = findSourceRootDir(rootDir);
    const productPath = resolveRequiredProductPath(options.productPath);
    const webrRoot = findRuntimeDependencyRoot(rootDir, sourceRoot, "webr", "dist");
    const monacoRoot = findRuntimeDependencyRoot(rootDir, sourceRoot, "monaco-editor", "min");
    const preactRoot = findRuntimeDependencyRoot(rootDir, sourceRoot, "preact");
    const productWebRLibraryDir = findProductWebRLibraryDir(productPath);
    const webEntryPaths = readProductWebEntryPaths(productPath);
    const launchPolicy = readProductWebLaunchPolicy(productPath);
    const launchDataRoot = resolveLaunchDataRoot(launchPolicy);

    return http.createServer((request, response) => {
        const parsed = url.parse(request.url || "/", true);
        const pathname = parsed.pathname || "/";

        try {
            if (webEntryPaths.includes(pathname) || pathname === launchPolicy.startPath) {
                const launchToken = pathname === launchPolicy.startPath
                    ? readLaunchTokenQuery(launchPolicy, parsed)
                    : "";

                if (launchToken && !isSafeLaunchToken(launchPolicy, launchToken)) {
                    sendJsonStatus(response, 400, {
                        ok: false,
                        message: "Invalid launch token."
                    });
                    return;
                }

                serveFile(
                    response,
                    path.join(rootDir, "src/shell-web/pages/shell.html")
                );
                return;
            }

            if (pathname === "/api/composition") {
                sendJson(response, serializeComposition(rootDir, productPath, {
                    locale: String(parsed.query.locale || "")
                }));
                return;
            }

            if (pathname === "/api/product.css") {
                serveProductStylesheet(response, productPath);
                return;
            }

            const launchRoute = readLaunchRoute(launchPolicy, pathname);

            if (launchRoute) {
                if (launchRoute.invalid || !isSafeLaunchToken(launchPolicy, launchRoute.token)) {
                    sendJsonStatus(response, 400, {
                        ok: false,
                        message: "Invalid launch token."
                    });
                    return;
                }

                if (launchRoute.resource === launchPolicy.metadataResource) {
                    sendLaunchMetadata(response, launchPolicy, launchDataRoot, launchRoute.token);
                    return;
                }

                if (launchRoute.resource === launchPolicy.datasetResource) {
                    sendLaunchDataset(response, launchPolicy, launchDataRoot, launchRoute.token);
                    return;
                }

                sendJsonStatus(response, 404, {
                    ok: false,
                    message: "Launch resource was not found."
                });
                return;
            }

            if (pathname === "/api/webr-package-library") {
                sendJson(
                    response,
                    createWebRPackageLibraryApiManifest(rootDir, Boolean(productWebRLibraryDir))
                );
                return;
            }

            if (pathname.startsWith("/api/dialog/")) {
                const dialogId = path.basename(pathname);
                const dialogs = readJson(path.join(productPath, "dialogs/dialogs.json"), []);
                const dialog = dialogs.find((entry) => {
                    return entry.id === dialogId;
                });
                const sharedDialogs = readJson(
                    path.join(rootDir, "src/base-app/dialogs/dialogs.json"),
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
                    : path.join(rootDir, "src/base-app/dialogs");
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
                if (pathname === "/webr/loader.js") {
                    serveFile(response, path.join(webrRoot, "webr.js"));
                    return;
                }

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

            if (pathname === "/vendor/sortablejs/sortable.esm.js") {
                serveFile(response, path.join(
                    rootDir,
                    "node_modules/sortablejs/modular/sortable.esm.js"
                ));
                return;
            }

            if (pathname.startsWith("/src/")) {
                serveFile(response, resolveSafeFile(rootDir, pathname));
                return;
            }

            if (pathname.startsWith("/products/")) {
                serveFile(response, resolveSafeFile(rootDir, pathname));
                return;
            }

            if (pathname.startsWith("/tests/fixtures/")) {
                serveFile(response, resolveSafeFile(sourceRoot, pathname));
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
    const productPath = resolveRequiredProductPath(options.productPath);

    if (options.buildOnly) {
        await ensureProductWebRLibrary(productPath);
        const manifestPath = createBuildManifest(
            rootDir,
            productPath
        );

        console.log(`Web product build manifest written to ${manifestPath}`);
        return;
    }

    if (options.replacePort) {
        replaceListeningPort(options.port);
    }

    await ensureProductWebRLibrary(productPath);

    const server = createWebProductDevServer(options);

    server.listen(options.port, options.host, () => {
        console.log(`Web product is available at http://${options.host}:${options.port}/`);
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
    createWebProductDevServer,
    assertStagedWebRuntimeDependencies,
    ensureProductWebRLibrary,
    findProductWebRLibraryDir,
    serializeComposition
};
