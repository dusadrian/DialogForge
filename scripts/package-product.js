"use strict";

const path = require("path");
const { spawnSync } = require("child_process");
const fs = require("fs");
const {
    assertRuntimeProviderIsRegistered
} = require("../shared/runtime/providers/runtimeProviderRegistry");
const {
    resolveProductLocation
} = require("../shared/base-app/bootstrap/productResolver");
const {
    getProductContribution
} = require("../shared/base-app/bootstrap/productContributionRegistry");
const {
    validateDialogRegistry,
    validateI18nDirectory
} = require("../shared/base-app/bootstrap/productAssetValidation");
const {
    packagedRuntimeDependencies
} = require("./packagedRuntimeDependencies");
const distDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(__dirname, "../..");


/**
 * @typedef {Object} ProductPackageSelection
 * @property {string} productPath
 * @property {string} platform
 * @property {string=} arch
 * @property {boolean=} nosign
 * @property {boolean=} stageOnly
 */


/**
 * Read the command-line contract used by both local product packaging and the
 * start/dev staging helpers.
 *
 * @returns {ProductPackageSelection}
 */
const parseArgs = function () {
    const selection = {};
    for (let index = 2; index < process.argv.length; index += 1) {
        const current = process.argv[index];
        const next = process.argv[index + 1];
        if (current === "--product-path" && next) {
            selection.productPath = next;
            index += 1;
        }
        else if (current === "--platform" && next) {
            selection.platform = next;
            index += 1;
        }
        else if (current === "--arch" && next) {
            selection.arch = next;
            index += 1;
        }
        else if (current === "--nosign") {
            selection.nosign = true;
        }
        else if (current === "--stage-only") {
            selection.stageOnly = true;
        }
    }
    if (!selection.productPath) {
        throw new Error("Missing required --product-path argument.");
    }
    if (!selection.platform) {
        const platform = process.platform;
        if (platform === "darwin") {
            selection.platform = "macos";
        }
        else if (platform === "win32") {
            selection.platform = "windows";
        }
        else {
            selection.platform = "linux";
        }
    }
    if (selection.platform === "macos") {
        const requestedArch = selection.arch || (process.env.DIALOGFORGE_MAC_ARCH === "x64"
            ? "x64"
            : "arm64");
        if (requestedArch === "x64"
            && process.env.GITHUB_ACTIONS !== "true") {
            throw new Error("macOS Intel packaging is owned by GitHub Actions. "
                + "Local macOS packaging must target arm64.");
        }
        selection.arch = requestedArch;
    }
    return selection;
};
const electronBuilderBinary = function () {
    return require.resolve("electron-builder/out/cli/cli.js", {
        paths: [distDir]
    });
};
const electronRuntimeVersion = function () {
    const packagePath = require.resolve("electron/package.json", {
        paths: [distDir]
    });
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const version = String(packageJson.version || "").trim();
    if (!version) {
        throw new Error(`Unable to read Electron runtime version from ${packagePath}.`);
    }
    return version;
};
const createMacConfigPath = function (arch) {
    const configPath = path.join(distDir, "electron-builder-macos.override.json");
    const packageJsonPath = path.join(distDir, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const baseBuild = JSON.parse(JSON.stringify(packageJson.build || {}));
    fs.writeFileSync(configPath, JSON.stringify(Object.assign(baseBuild, {
        mac: Object.assign({}, baseBuild.mac || {}, {
            target: [
                {
                    target: "dmg",
                    arch: [arch || "arm64"]
                }
            ]
        })
    }), null, 4));
    return configPath;
};
const readProductManifest = function (manifestPath) {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
};
const readProductRuntimeProviders = function (productManifest) {
    const providers = Array.isArray(productManifest.runtimeProviders)
        ? productManifest.runtimeProviders.map((entry) => {
            return String(entry || "").trim();
        }).filter(Boolean)
        : [];
    return Array.from(new Set(providers));
};
const readProductDefaultRuntimeProvider = function (productManifest, runtimeProviders) {
    const explicitDefault = String(productManifest.defaultRuntimeProvider || "").trim();
    if (explicitDefault) {
        return explicitDefault;
    }
    return runtimeProviders[0] || "r";
};
const readProductDescription = function (productManifest, manifestPath) {
    const description = String(productManifest.description || "").trim();
    if (!description) {
        throw new Error(`Missing description in ${manifestPath}.`);
    }
    return description;
};


/**
 * @param {string} platform
 * @param {string=} arch
 * @returns {string[]}
 */
const platformFlags = function (platform, arch) {
    if (platform === "linux") {
        return ["--linux"];
    }
    if (platform === "windows") {
        return ["--win"];
    }
    return [
        "--mac",
        arch === "x64" ? "--x64" : "--arm64"
    ];
};


/**
 * @param {string} platform
 * @param {string} productName
 * @param {string} version
 * @returns {string[]}
 */
const artifactNameConfig = function (platform, productName, version) {
    const fileName = productName.replace(/\s+/g, "_");
    if (platform === "linux") {
        return [
            `--config.linux.artifactName=${fileName}_${version}_intel.AppImage`
        ];
    }
    if (platform === "windows") {
        return [
            `--config.nsis.artifactName=${fileName}_setup_${version}_intel.exe`,
            `--config.portable.artifactName=${fileName}_${version}_intel.exe`
        ];
    }
    return [];
};
const renameMacArtifacts = function (productName, version, arch) {
    const result = spawnSync(process.execPath, [
        path.join(distDir, "scripts/rename-binaries-mac.js"),
        "--root",
        projectRoot,
        "--version",
        version,
        "--product-name",
        productName,
        "--arch",
        arch || "arm64"
    ], {
        cwd: distDir,
        stdio: "inherit"
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`rename-binaries-mac failed with exit code ${String(result.status)}.`);
    }
};
const safeEntryName = function (productId) {
    return productId.replace(/[^A-Za-z0-9_-]/g, "-");
};


/**
 * @param {string} productId
 * @returns {string}
 */
const generatedMainFile = function (productId) {
    const fileName = `electron-main-product-${safeEntryName(productId)}.js`;
    const filePath = path.join(distDir, "scripts", fileName);
    const stagedProductPath = path.join("..", "products", productId);
    fs.writeFileSync(filePath, [
        `"use strict";`,
        `const path = require("path");`,
        `process.env.DIALOGFORGE_PRODUCT_PATH = path.join(__dirname, ${JSON.stringify(stagedProductPath)});`,
        `require("./electron-main");`,
        ``
    ].join("\n"));
    return `scripts/${fileName}`;
};
const defaultAppId = function (productId) {
    return `org.dialogforge.${productId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
};
const iconConfig = function (iconBasePath) {
    return [
        `--config.mac.icon=${iconBasePath}.icns`,
        `--config.win.icon=${iconBasePath}.ico`,
        `--config.linux.icon=${iconBasePath}.png`
    ];
};
const assertPackagedRuntimeDependencies = function () {
    const missing = packagedRuntimeDependencies.filter((packageName) => {
        return !fs.existsSync(path.join(distDir, "node_modules", packageName, "package.json"));
    });
    if (missing.length > 0) {
        throw new Error("Missing staged runtime dependencies: " + missing.join(", "));
    }
};


/**
 * @param {string} sourcePath
 * @param {string} targetPath
 */
const copyProductSourceFiles = function (sourcePath, targetPath) {
    fs.cpSync(sourcePath, targetPath, {
        recursive: true,
        force: true,
        filter: function (candidatePath) {
            const relativePath = path.relative(sourcePath, candidatePath);
            const parts = relativePath.split(path.sep);
            const baseName = path.basename(candidatePath);
            if (parts.includes("dist")
                || parts.includes("node_modules")
                || parts.includes(".git")) {
                return false;
            }
            return !baseName.endsWith(".ts");
        }
    });
};


/**
 * @param {import("../shared/core/contracts/productLocation").ResolvedProductLocation} location
 * @param {string} targetPath
 */
const compileProductContribution = function (location, targetPath) {
    const tsconfigPath = path.join(location.rootPath, "tsconfig.json");
    if (!fs.existsSync(tsconfigPath)) {
        return;
    }
    const tscPath = require.resolve("typescript/bin/tsc", {
        paths: [distDir]
    });
    const result = spawnSync(process.execPath, [
        tscPath,
        "-p",
        tsconfigPath,
        "--rootDir",
        location.rootPath,
        "--outDir",
        targetPath,
        "--noEmit",
        "false"
    ], {
        cwd: location.rootPath,
        env: process.env,
        stdio: "inherit"
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`Product contribution check failed with exit code ${String(result.status)}.`);
    }
};


/**
 * Copy, validate, and compile the selected product into DialogForge's staging
 * area. The returned path is the product root used by packaging and dev mode.
 *
 * @param {import("../shared/core/contracts/productLocation").ResolvedProductLocation} location
 * @returns {string}
 */
const stageProductForPackaging = function (location) {
    const targetPath = path.join(distDir, "products", location.id);
    fs.rmSync(targetPath, {
        recursive: true,
        force: true
    });
    fs.mkdirSync(targetPath, {
        recursive: true
    });
    copyProductSourceFiles(location.rootPath, targetPath);
    validateI18nDirectory(path.join(targetPath, "i18n"));

    const dialogRegistryPath = path.join(targetPath, "dialogs/dialogs.json");
    if (fs.existsSync(dialogRegistryPath)) {
        validateDialogRegistry(dialogRegistryPath, path.join(targetPath, "dialogs"));
    }

    compileProductContribution(location, targetPath);
    const stagedContributionPath = path.join(targetPath, "bootstrap/productContribution.js");
    if (!fs.existsSync(stagedContributionPath)) {
        throw new Error(`Missing compiled product contribution at "${stagedContributionPath}". ` +
            `Ensure the product contains a TypeScript tsconfig.json or a plain ` +
            `bootstrap/productContribution.js contribution.`);
    }
    getProductContribution({
        ...location,
        compiledRootPath: targetPath
    });

    return targetPath;
};
const main = function () {
    const selection = parseArgs();
    const location = resolveProductLocation(projectRoot, "base", selection.productPath);
    const stagedProductPath = stageProductForPackaging(location);
    const productManifest = readProductManifest(path.join(stagedProductPath, "product.json"));
    const runtimeProviders = readProductRuntimeProviders(productManifest);
    const defaultRuntimeProvider = readProductDefaultRuntimeProvider(productManifest, runtimeProviders);
    const productVersion = String(productManifest.version || "").trim();
    const productDescription = readProductDescription(productManifest, location.manifestPath);
    const outputDir = path.join(projectRoot, "build/output");
    const noSign = Boolean(selection.nosign);
    const mainFile = generatedMainFile(location.id);
    const electronVersion = electronRuntimeVersion();
    const productName = String(productManifest.name || location.id).trim() || location.id;
    const appId = String(productManifest.appId || "").trim()
        || defaultAppId(location.id);
    const iconBasePath = path.join(stagedProductPath, "assets/icons/icon");
    const macConfigPath = selection.platform === "macos"
        ? createMacConfigPath(selection.arch)
        : "";
    if (runtimeProviders.length > 0) {
        runtimeProviders.forEach((runtimeProviderId) => {
            assertRuntimeProviderIsRegistered(runtimeProviderId);
        });
    }
    else {
        assertRuntimeProviderIsRegistered(defaultRuntimeProvider);
    }
    if (runtimeProviders.length > 0
        && !runtimeProviders.includes(defaultRuntimeProvider)) {
        throw new Error(`Default runtime provider "${defaultRuntimeProvider}" is not listed in ${location.manifestPath} runtimeProviders.`);
    }
    if (!productVersion) {
        throw new Error(`Missing version in ${location.manifestPath}.`);
    }
    if (selection.stageOnly) {
        return;
    }
    assertPackagedRuntimeDependencies();
    try {
        const builderArgs = [
            `--config.electronVersion=${electronVersion}`,
            `--config.extraMetadata.main=${mainFile}`,
            `--config.extraMetadata.productName=${productName}`,
            `--config.extraMetadata.version=${productVersion}`,
            `--config.extraMetadata.description=${productDescription}`,
            `--config.directories.output=${outputDir}`,
            `--config.appId=${appId}`,
            `--config.productName=${productName}`,
            ...(macConfigPath ? ["--config", macConfigPath] : []),
            "--publish=never",
            ...platformFlags(selection.platform, selection.arch),
            ...artifactNameConfig(selection.platform, productName, productVersion),
            ...iconConfig(iconBasePath)
        ];
        if (noSign && selection.platform === "macos") {
            builderArgs.push("--config.mac.identity=null", "--config.mac.hardenedRuntime=false");
        }
        const result = spawnSync(process.execPath, [electronBuilderBinary(), ...builderArgs], {
            cwd: distDir,
            stdio: "inherit"
        });
        if (result.error) {
            throw result.error;
        }
        if (result.status !== 0) {
            throw new Error(`electron-builder failed with exit code ${String(result.status)}.`);
        }
        if (selection.platform === "macos") {
            renameMacArtifacts(productName, productVersion, selection.arch);
        }
    }
    finally {
        if (macConfigPath) {
            fs.rmSync(macConfigPath, { force: true });
        }
    }
};
main();
