"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const runtimeProviderRegistry_1 = require("../shared/runtime/providers/runtimeProviderRegistry");
const productResolver_1 = require("../shared/base-app/bootstrap/productResolver");
const packagedRuntimeDependencies_1 = require("./packagedRuntimeDependencies");
const distDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(__dirname, "../..");
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
    const result = (0, child_process_1.spawnSync)(process.execPath, [
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
    const missing = packagedRuntimeDependencies_1.packagedRuntimeDependencies.filter((packageName) => {
        return !fs.existsSync(path.join(distDir, "node_modules", packageName, "package.json"));
    });
    if (missing.length > 0) {
        throw new Error("Missing staged runtime dependencies: " + missing.join(", "));
    }
};
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
const compileProductContribution = function (location, targetPath) {
    const tsconfigPath = path.join(location.rootPath, "tsconfig.json");
    if (!fs.existsSync(tsconfigPath)) {
        return;
    }
    const tscPath = require.resolve("typescript/bin/tsc", {
        paths: [distDir]
    });
    const result = (0, child_process_1.spawnSync)(process.execPath, [
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
    compileProductContribution(location, targetPath);
    const stagedContributionPath = path.join(targetPath, "bootstrap/productContribution.js");
    if (!fs.existsSync(stagedContributionPath)) {
        throw new Error(`Missing compiled product contribution at "${stagedContributionPath}". ` +
            `Ensure the product contains a TypeScript tsconfig.json or a plain ` +
            `bootstrap/productContribution.js contribution.`);
    }
    return targetPath;
};
const main = function () {
    const selection = parseArgs();
    const location = (0, productResolver_1.resolveProductLocation)(projectRoot, "base", selection.productPath);
    const stagedProductPath = stageProductForPackaging(location);
    const productManifest = readProductManifest(path.join(stagedProductPath, "product.json"));
    const runtimeProviders = readProductRuntimeProviders(productManifest);
    const defaultRuntimeProvider = readProductDefaultRuntimeProvider(productManifest, runtimeProviders);
    const productVersion = String(productManifest.version || "").trim();
    const outputDir = path.join(projectRoot, "build/output");
    const noSign = Boolean(selection.nosign);
    const mainFile = generatedMainFile(location.id);
    const productName = String(productManifest.name || location.id).trim() || location.id;
    const appId = String(productManifest.appId || "").trim()
        || defaultAppId(location.id);
    const iconBasePath = path.join(stagedProductPath, "assets/icons/icon");
    const macConfigPath = selection.platform === "macos"
        ? createMacConfigPath(selection.arch)
        : "";
    if (runtimeProviders.length > 0) {
        runtimeProviders.forEach((runtimeProviderId) => {
            (0, runtimeProviderRegistry_1.assertRuntimeProviderIsRegistered)(runtimeProviderId);
        });
    }
    else {
        (0, runtimeProviderRegistry_1.assertRuntimeProviderIsRegistered)(defaultRuntimeProvider);
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
            "--config.electronVersion=40.6.1",
            `--config.extraMetadata.main=${mainFile}`,
            `--config.extraMetadata.productName=${productName}`,
            `--config.extraMetadata.version=${productVersion}`,
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
        const result = (0, child_process_1.spawnSync)(process.execPath, [electronBuilderBinary(), ...builderArgs], {
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
