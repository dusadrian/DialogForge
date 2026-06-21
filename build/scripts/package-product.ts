import * as path from "path";
import { spawnSync } from "child_process";
import * as fs from "fs";

import {
    assertRuntimeProviderIsRegistered
} from "../../shared/runtime/providers/runtimeProviderRegistry";
import {
    resolveProductLocation
} from "../../shared/base-app/bootstrap/productResolver";
import type {
    ResolvedProductLocation
} from "../../shared/core/contracts/productLocation";


interface BuildSelection {
    platform: "linux" | "windows" | "macos";
    productPath: string;
    nosign: boolean;
    stageOnly?: boolean;
    arch?: "arm64" | "x64";
}


const distDir = path.resolve(__dirname, "../..");
const projectRoot = path.resolve(__dirname, "../../..");


const parseArgs = function(): BuildSelection {
    const selection: Partial<BuildSelection> = {};

    for (let index = 2; index < process.argv.length; index += 1) {
        const current = process.argv[index];
        const next = process.argv[index + 1];

        if (current === "--product-path" && next) {
            selection.productPath = next;
            index += 1;
        }
        else if (current === "--platform" && next) {
            selection.platform = next as BuildSelection["platform"];
            index += 1;
        }
        else if (current === "--arch" && next) {
            selection.arch = next as BuildSelection["arch"];
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
        const requestedArch = selection.arch || (
            process.env.DIALOGFORGE_MAC_ARCH === "x64"
                ? "x64"
                : "arm64"
        );

        if (
            requestedArch === "x64"
            && process.env.GITHUB_ACTIONS !== "true"
        ) {
            throw new Error(
                "macOS Intel packaging is owned by GitHub Actions. "
                + "Local macOS packaging must target arm64."
            );
        }

        selection.arch = requestedArch;
    }

    return selection as BuildSelection;
};


const electronBuilderBinary = function(): string {
    return require.resolve("electron-builder/out/cli/cli.js", {
        paths: [distDir]
    });
};


const createMacConfigPath = function(arch: BuildSelection["arch"]): string {
    const configPath = path.join(distDir, "electron-builder-macos.override.json");
    const packageJsonPath = path.join(distDir, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
        build?: Record<string, unknown>;
    };
    const baseBuild = JSON.parse(JSON.stringify(packageJson.build || {})) as Record<string, unknown>;

    fs.writeFileSync(
        configPath,
        JSON.stringify(
            Object.assign(baseBuild, {
                mac: Object.assign({}, baseBuild.mac || {}, {
                    target: [
                        {
                            target: "dmg",
                            arch: [arch || "arm64"]
                        }
                    ]
                })
            }),
            null,
            4
        )
    );

    return configPath;
};


const readProductManifest = function(manifestPath: string): {
    appId?: string;
    runtimeProviders?: string[];
    defaultRuntimeProvider?: string;
    id: string;
    name: string;
    version?: string;
} {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        appId?: string;
        runtimeProviders?: string[];
        defaultRuntimeProvider?: string;
        id: string;
        name: string;
        version?: string;
    };
};


const readProductRuntimeProviders = function(productManifest: {
    runtimeProviders?: string[];
    defaultRuntimeProvider?: string;
}): string[] {
    const providers = Array.isArray(productManifest.runtimeProviders)
        ? productManifest.runtimeProviders.map((entry) => {
            return String(entry || "").trim();
        }).filter(Boolean)
        : [];

    return Array.from(new Set(providers));
};


const readProductDefaultRuntimeProvider = function(productManifest: {
    runtimeProviders?: string[];
    defaultRuntimeProvider?: string;
}, runtimeProviders: string[]): string {
    const explicitDefault = String(productManifest.defaultRuntimeProvider || "").trim();

    if (explicitDefault) {
        return explicitDefault;
    }

    return runtimeProviders[0] || "r";
};


const platformFlags = function(
    platform: BuildSelection["platform"],
    arch?: BuildSelection["arch"]
): string[] {
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


const renameMacArtifacts = function(
    productName: string,
    version: string,
    arch: BuildSelection["arch"]
): void {
    const result = spawnSync(
        process.execPath,
        [
            path.join(distDir, "build/scripts/rename-binaries-mac.js"),
            "--root",
            projectRoot,
            "--version",
            version,
            "--product-name",
            productName,
            "--arch",
            arch || "arm64"
        ],
        {
            cwd: distDir,
            stdio: "inherit"
        }
    );

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(
            `rename-binaries-mac failed with exit code ${String(result.status)}.`
        );
    }
};


const safeEntryName = function(productId: string): string {
    return productId.replace(/[^A-Za-z0-9_-]/g, "-");
};


const generatedMainFile = function(productId: string): string {
    const fileName = `electron-main-product-${safeEntryName(productId)}.js`;
    const filePath = path.join(distDir, "build/scripts", fileName);
    const stagedProductPath = path.join("../..", "products", productId);

    fs.writeFileSync(
        filePath,
        [
            `"use strict";`,
            `const path = require("path");`,
            `process.argv.push("--product-path", path.join(__dirname, ${JSON.stringify(stagedProductPath)}));`,
            `require("./electron-main");`,
            ``
        ].join("\n")
    );

    return `build/scripts/${fileName}`;
};


const defaultAppId = function(productId: string): string {
    return `org.dialogforge.${productId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
};


const iconConfig = function(iconBasePath: string): string[] {
    return [
        `--config.mac.icon=${iconBasePath}.icns`,
        `--config.win.icon=${iconBasePath}.ico`,
        `--config.linux.icon=${iconBasePath}.png`
    ];
};


const copyProductSourceFiles = function(sourcePath: string, targetPath: string): void {
    fs.cpSync(sourcePath, targetPath, {
        recursive: true,
        force: true,
        filter: function(candidatePath): boolean {
            const relativePath = path.relative(sourcePath, candidatePath);
            const parts = relativePath.split(path.sep);
            const baseName = path.basename(candidatePath);

            if (
                parts.includes("dist")
                || parts.includes("node_modules")
                || parts.includes(".git")
            ) {
                return false;
            }

            return !baseName.endsWith(".ts");
        }
    });
};


const compileProductContribution = function(location: ResolvedProductLocation, targetPath: string): void {
    const tsconfigPath = path.join(location.rootPath, "tsconfig.json");

    if (!fs.existsSync(tsconfigPath)) {
        return;
    }

    const tscPath = require.resolve("typescript/bin/tsc", {
        paths: [distDir]
    });
    const result = spawnSync(
        process.execPath,
        [
            tscPath,
            "-p",
            tsconfigPath,
            "--rootDir",
            location.rootPath,
            "--outDir",
            targetPath,
            "--noEmit",
            "false"
        ],
        {
            cwd: location.rootPath,
            env: process.env,
            stdio: "inherit"
        }
    );

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(
            `Product contribution check failed with exit code ${String(result.status)}.`
        );
    }
};


const stageProductForPackaging = function(location: ResolvedProductLocation): string {
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

    const stagedContributionPath = path.join(
        targetPath,
        "bootstrap/productContribution.js"
    );

    if (!fs.existsSync(stagedContributionPath)) {
        throw new Error(
            `Missing compiled product contribution at "${stagedContributionPath}". ` +
            `Ensure the product contains a TypeScript tsconfig.json or a plain ` +
            `bootstrap/productContribution.js contribution.`
        );
    }

    return targetPath;
};


const main = function(): void {
    const selection = parseArgs();
    const location = resolveProductLocation(
        projectRoot,
        "base",
        selection.productPath
    );
    const stagedProductPath = stageProductForPackaging(location);
    const productManifest = readProductManifest(
        path.join(stagedProductPath, "product.json")
    );
    const runtimeProviders = readProductRuntimeProviders(productManifest);
    const defaultRuntimeProvider = readProductDefaultRuntimeProvider(
        productManifest,
        runtimeProviders
    );
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
            assertRuntimeProviderIsRegistered(runtimeProviderId);
        });
    }
    else {
        assertRuntimeProviderIsRegistered(defaultRuntimeProvider);
    }

    if (
        runtimeProviders.length > 0
        && !runtimeProviders.includes(defaultRuntimeProvider)
    ) {
        throw new Error(
            `Default runtime provider "${defaultRuntimeProvider}" is not listed in ${location.manifestPath} runtimeProviders.`
        );
    }

    if (!productVersion) {
        throw new Error(`Missing version in ${location.manifestPath}.`);
    }

    if (selection.stageOnly) {
        return;
    }

    try {
        const builderArgs = [
            "--config.electronVersion=40.6.1",
            `--config.extraMetadata.main=${mainFile}`,
            `--config.extraMetadata.version=${productVersion}`,
            `--config.directories.output=${outputDir}`,
            `--config.appId=${appId}`,
            `--config.productName=${productName}`,
            ...(macConfigPath ? ["--config", macConfigPath] : []),
            "--publish=never",
            ...platformFlags(selection.platform, selection.arch),
            ...iconConfig(iconBasePath)
        ];

        if (noSign && selection.platform === "macos") {
            builderArgs.push(
                "--config.mac.identity=null",
                "--config.mac.hardenedRuntime=false"
            );
        }

        const result = spawnSync(
            process.execPath,
            [electronBuilderBinary(), ...builderArgs],
            {
            cwd: distDir,
                stdio: "inherit"
            }
        );

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
