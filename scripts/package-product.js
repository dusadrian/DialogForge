"use strict";

const path = require("path");
const { spawnSync } = require("child_process");
const fs = require("fs");
const {
    assertRuntimeProviderIsRegistered
} = require("../src/runtime/providers/runtimeProviderRegistry");
const {
    resolveProductLocation
} = require("../src/base-app/bootstrap/productResolver");
const {
    readProductManifest
} = require("../src/base-app/bootstrap/productManifestReader");
const {
    getProductContribution
} = require("../src/base-app/bootstrap/productContributionRegistry");
const {
    validateDialogRegistry,
    validateI18nDirectory
} = require("../src/base-app/bootstrap/productAssetValidation");
const {
    packagedRuntimeDependencies
} = require("./packagedRuntimeDependencies");
const distDir = path.resolve(
    process.env.DIALOGFORGE_DIST_DIR || path.resolve(__dirname, "..")
);
const sourceRoot = path.resolve(
    process.env.DIALOGFORGE_SOURCE_ROOT || path.resolve(distDir, "..")
);
const projectRoot = path.resolve(distDir, "..");


/**
 * @typedef {Object} ProductPackageSelection
 * @property {string} productPath
 * @property {string} platform
 * @property {string=} arch
 * @property {string=} outputDir
 * @property {boolean=} sign
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
        else if (current === "--output-dir" && next) {
            selection.outputDir = next;
            index += 1;
        }
        else if (current === "--sign") {
            selection.sign = true;
        }
        else if (current === "--stage-only") {
            selection.stageOnly = true;
        }
        else {
            throw new Error(`Unknown product packaging argument: ${current}`);
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
    return selection;
};
const electronBuilderBinary = function () {
    return require.resolve("electron-builder/out/cli/cli.js", {
        paths: [sourceRoot, distDir]
    });
};
const electronRuntimeVersion = function () {
    const packagePath = require.resolve("electron/package.json", {
        paths: [sourceRoot, distDir]
    });
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const version = String(packageJson.version || "").trim();
    if (!version) {
        throw new Error(`Unable to read Electron runtime version from ${packagePath}.`);
    }
    return version;
};
const mergeBuildConfig = function (baseBuild, productBuild) {
    const merged = Object.assign({}, baseBuild, productBuild, {
        mac: Object.assign({}, baseBuild.mac || {}, productBuild.mac || {}),
        win: Object.assign({}, baseBuild.win || {}, productBuild.win || {}),
        linux: Object.assign({}, baseBuild.linux || {}, productBuild.linux || {})
    });
    return merged;
};
const resolveProductExtraResource = function (resource, stagedProductPath) {
    if (typeof resource === "string") {
        return {
            from: path.join(stagedProductPath, resource),
            to: resource
        };
    }

    const resourceConfig = readObject(resource);
    const from = String(resourceConfig.from || "").trim();
    if (!from || path.isAbsolute(from)) {
        return resourceConfig;
    }

    return Object.assign({}, resourceConfig, {
        from: path.join(stagedProductPath, from)
    });
};
const createBuildConfigPath = function (productBuildConfig, stagedProductPath, platform, arch, includeZipTarget) {
    const configPath = path.join(distDir, "electron-builder-product.override.json");
    const packageJsonPath = path.join(distDir, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const baseBuild = JSON.parse(JSON.stringify(packageJson.build || {}));
    const productBuild = JSON.parse(JSON.stringify(productBuildConfig || {}));
    const baseExtraResources = Array.isArray(baseBuild.extraResources)
        ? baseBuild.extraResources
        : [];
    const productExtraResources = Array.isArray(productBuild.extraResources)
        ? productBuild.extraResources.map((resource) => {
            return resolveProductExtraResource(resource, stagedProductPath);
        })
        : [];
    const mergedBuild = mergeBuildConfig(baseBuild, productBuild);

    mergedBuild.afterPack = path.join(
        sourceRoot,
        "scripts",
        "prepare-linux-electron-sandbox.js"
    );
    mergedBuild.extraResources = [
        ...baseExtraResources,
        ...productExtraResources
    ];

    if (platform === "macos") {
        const target = [
            {
                target: "dmg",
                arch: [arch || "arm64"]
            }
        ];
        if (includeZipTarget) {
            target.push({
                target: "zip",
                arch: [arch || "arm64"]
            });
        }
        mergedBuild.mac = Object.assign({}, mergedBuild.mac || {}, {
            target
        });
    }

    fs.writeFileSync(configPath, JSON.stringify(mergedBuild, null, 4));
    return configPath;
};
const readObject = function (value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
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
const readEnvironmentAutoUpdatePolicy = function () {
    const releaseRepository = String(
        process.env.DIALOGFORGE_RELEASE_REPOSITORY || ""
    ).trim();
    const releaseTag = String(
        process.env.DIALOGFORGE_RELEASE_TAG || ""
    ).trim();
    if (releaseRepository && releaseTag) {
        return {
            provider: "generic",
            url: `https://github.com/${releaseRepository}/releases/download/${releaseTag}`
        };
    }

    return null;
};
const readProductAutoUpdatePolicy = function (productManifest) {
    const policy = readObject(productManifest.autoUpdate);
    const explicitUrl = String(policy.url || "").trim();
    if (explicitUrl) {
        return {
            provider: "generic",
            url: explicitUrl
        };
    }

    const configuredReleaseRepository = String(policy.releaseRepository || "").trim();
    const configuredReleaseTag = String(policy.releaseTag || "").trim();
    if (configuredReleaseRepository && configuredReleaseTag) {
        return {
            provider: "generic",
            url: `https://github.com/${configuredReleaseRepository}/releases/download/${configuredReleaseTag}`
        };
    }

    return null;
};
const writeStagedAutoUpdatePolicy = function (packagePath, policy) {
    if (!policy) {
        return;
    }

    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    packageJson.product = readObject(packageJson.product);
    packageJson.product.autoUpdate = policy;
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 4) + "\n");
};
const readProductBuildConfig = function (packagePath) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    return readObject(packageJson.build);
};
const buildConfigKeyForPlatform = function (platform) {
    if (platform === "windows") {
        return "win";
    }
    if (platform === "macos") {
        return "mac";
    }
    return "linux";
};
const readTargetArchitectures = function (buildConfig, platform) {
    const platformConfig = readObject(buildConfig[buildConfigKeyForPlatform(platform)]);
    const targets = Array.isArray(platformConfig.target)
        ? platformConfig.target
        : [platformConfig.target].filter(Boolean);

    return targets.flatMap((target) => {
        const targetConfig = readObject(target);
        const arch = targetConfig.arch;
        if (Array.isArray(arch)) {
            return arch.map((entry) => String(entry || "").trim()).filter(Boolean);
        }
        const singleArch = String(arch || "").trim();
        return singleArch ? [singleArch] : [];
    });
};
const defaultArchitectureForPlatform = function (platform) {
    return platform === "macos" ? "arm64" : "x64";
};
const selectPlatformArchitecture = function (platform, buildConfig, explicitArch) {
    const configuredArchitectures = readTargetArchitectures(buildConfig, platform);
    const configuredArch = configuredArchitectures[0] || "";
    const requestedArch = String(explicitArch || "").trim()
        || configuredArch
        || defaultArchitectureForPlatform(platform);

    if (requestedArch !== "x64"
        && requestedArch !== "arm64") {
        throw new Error(`Unsupported ${platform} architecture "${requestedArch}". Use "arm64" or "x64".`);
    }

    return requestedArch;
};


/**
 * @param {string} platform
 * @param {string=} arch
 * @returns {string[]}
 */
const platformFlags = function (platform, arch) {
    const archFlag = arch === "arm64" ? "--arm64" : "--x64";
    if (platform === "linux") {
        return ["--linux", archFlag];
    }
    if (platform === "windows") {
        return ["--win", archFlag];
    }
    return [
        "--mac",
        archFlag
    ];
};


/**
 * @param {string} platform
 * @param {string} productName
 * @returns {string[]}
 */
const artifactNameConfig = function (platform, productName) {
    const fileName = productName.replace(/\s+/g, "_");
    if (platform === "linux") {
        return [
            `--config.linux.artifactName=${fileName}_intel.AppImage`
        ];
    }
    if (platform === "windows") {
        return [
            `--config.nsis.artifactName=${fileName}_setup_intel.exe`,
            `--config.portable.artifactName=${fileName}_intel.exe`
        ];
    }
    return [];
};
const renameMacArtifacts = function (outputRoot, productName, version, arch) {
    const result = spawnSync(process.execPath, [
        path.join(distDir, "scripts/rename-binaries-mac.js"),
        "--root",
        outputRoot,
        "--version",
        version,
        "--product-name",
        productName
    ], {
        cwd: distDir,
        stdio: "inherit",
        env: {
            ...process.env,
            DIALOGFORGE_PACKAGING_MACOS_ARCH: arch || "arm64"
        }
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`rename-binaries-mac failed with exit code ${String(result.status)}.`);
    }
};
const selectedOutputDir = function (selection) {
    const outputDir = String(selection.outputDir || "").trim();
    return outputDir
        ? path.resolve(outputDir)
        : path.join(projectRoot, "build/output");
};
const outputRootForDirectory = function (outputDir) {
    const normalizedOutput = path.resolve(outputDir);
    return path.basename(normalizedOutput) === "output"
        && path.basename(path.dirname(normalizedOutput)) === "build"
        ? path.dirname(path.dirname(normalizedOutput))
        : path.dirname(normalizedOutput);
};
const cleanPlatformOutput = function (outputDir, platform) {
    if (platform !== "macos" || !fs.existsSync(outputDir)) {
        return;
    }
    fs.readdirSync(outputDir, { withFileTypes: true }).forEach((entry) => {
        if (entry.isDirectory()
            && (entry.name === "mac" || entry.name.startsWith("mac-"))) {
            fs.rmSync(path.join(outputDir, entry.name), {
                recursive: true,
                force: true
            });
        }
    });
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
    const stagedProductPath = path.join("..", "product");
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
const productPackageName = function (productName, productId) {
    const candidate = String(productName || productId || "dialogforge-product")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return candidate || "dialogforge-product";
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
    const excludedDirectories = new Set([
        "build",
        "dist",
        "node_modules",
        ".git"
    ]);
    const excludedFiles = new Set([
        "tsconfig.json"
    ]);
    const filter = function(candidatePath) {
        const relativePath = path.relative(sourcePath, candidatePath);
        const parts = relativePath.split(path.sep);
        const baseName = path.basename(candidatePath);

        return !parts.some((part) => excludedDirectories.has(part))
            && !excludedFiles.has(baseName)
            && !baseName.endsWith(".ts");
    };

    fs.readdirSync(sourcePath, { withFileTypes: true }).forEach((entry) => {
        if (
            excludedDirectories.has(entry.name)
            || excludedFiles.has(entry.name)
            || entry.name.endsWith(".ts")
        ) {
            return;
        }
        fs.cpSync(
            path.join(sourcePath, entry.name),
            path.join(targetPath, entry.name),
            {
                recursive: true,
                force: true,
                filter
            }
        );
    });
};


/**
 * @param {import("../src/core/contracts/productLocation").ResolvedProductLocation} location
 * @param {string} targetPath
 */
const compileProductContribution = function (location, targetPath) {
    const tsconfigPath = path.join(location.rootPath, "tsconfig.json");
    if (!fs.existsSync(tsconfigPath)) {
        return;
    }
    const tscPath = require.resolve("typescript/bin/tsc", {
        paths: [sourceRoot, distDir]
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
 * @param {import("../src/core/contracts/productLocation").ResolvedProductLocation} location
 * @returns {string}
 */
const stageProductForPackaging = function (location) {
    const targetPath = path.join(distDir, "product");
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
    const stagedPackagePath = path.join(stagedProductPath, "package.json");
    const productManifest = readProductManifest(stagedPackagePath);
    const productBuildConfig = readProductBuildConfig(stagedPackagePath);
    const runtimeProviders = readProductRuntimeProviders(productManifest);
    const defaultRuntimeProvider = readProductDefaultRuntimeProvider(productManifest, runtimeProviders);
    const productVersion = String(productManifest.version || "").trim();
    const productDescription = readProductDescription(productManifest, location.manifestPath);
    const environmentAutoUpdatePolicy = readEnvironmentAutoUpdatePolicy();
    const autoUpdatePolicy = environmentAutoUpdatePolicy
        || readProductAutoUpdatePolicy(productManifest);
    writeStagedAutoUpdatePolicy(stagedPackagePath, environmentAutoUpdatePolicy);
    const outputDir = selectedOutputDir(selection);
    const outputRoot = outputRootForDirectory(outputDir);
    const sign = Boolean(selection.sign);
    const mainFile = generatedMainFile(location.id);
    const electronVersion = electronRuntimeVersion();
    const productName = String(productManifest.name || location.id).trim() || location.id;
    const packageName = productPackageName(productName, location.id);
    const appId = String(productManifest.appId || "").trim()
        || defaultAppId(location.id);
    const iconBasePath = path.join(stagedProductPath, "assets/icons/icon");
    selection.arch = selectPlatformArchitecture(
        selection.platform,
        productBuildConfig,
        selection.arch
    );
    const buildConfigPath = createBuildConfigPath(
        productBuildConfig,
        stagedProductPath,
        selection.platform,
        selection.arch,
        Boolean(autoUpdatePolicy)
    );
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
    cleanPlatformOutput(outputDir, selection.platform);
    try {
        const builderArgs = [
            `--config.electronVersion=${electronVersion}`,
            `--config.extraMetadata.name=${packageName}`,
            `--config.extraMetadata.main=${mainFile}`,
            `--config.extraMetadata.productName=${productName}`,
            `--config.extraMetadata.version=${productVersion}`,
            `--config.extraMetadata.description=${productDescription}`,
            `--config.directories.output=${outputDir}`,
            `--config.appId=${appId}`,
            `--config.productName=${productName}`,
            "--config",
            buildConfigPath,
            "--publish=never",
            ...platformFlags(selection.platform, selection.arch),
            ...artifactNameConfig(selection.platform, productName),
            ...iconConfig(iconBasePath)
        ];
        if (autoUpdatePolicy) {
            builderArgs.push(
                "--config.publish.provider=generic",
                `--config.publish.url=${autoUpdatePolicy.url}`
            );
        }
        if (!sign && selection.platform === "macos") {
            builderArgs.push("--config.mac.identity=-", "--config.mac.hardenedRuntime=false");
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
            renameMacArtifacts(outputRoot, productName, productVersion, selection.arch);
        }
    }
    finally {
        fs.rmSync(buildConfigPath, { force: true });
    }
};
main();
