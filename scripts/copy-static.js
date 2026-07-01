"use strict";

const fs = require("fs");
const path = require("path");
const {
    packagedRuntimeDependencies
} = require("./packagedRuntimeDependencies");
const parentDir = path.resolve(__dirname, "..");
const runningFromDist = path.basename(parentDir) === "dist";
const rootDir = runningFromDist
    ? parentDir
    : path.join(parentDir, "dist");
const sourceRoot = runningFromDist
    ? path.resolve(rootDir, "..")
    : parentDir;
const includeWebRuntime = process.argv.includes("--include-web-runtime");


/**
 * @param {string} sourcePath
 */
const copyFile = function (sourcePath) {
    const relativePath = path.relative(sourceRoot, sourcePath);
    const targetPath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
};


/**
 * @param {string} sourcePath
 * @param {string} targetPath
 */
const copyDirectory = function (sourcePath, targetPath) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.cpSync(sourcePath, targetPath, {
        recursive: true,
        force: true
    });
};


/**
 * @param {string} targetPath
 */
const removeGeneratedDirectory = function (targetPath) {
    fs.rmSync(targetPath, {
        recursive: true,
        force: true
    });
};
const removeGeneratedFile = function (targetPath) {
    fs.rmSync(targetPath, {
        force: true
    });
};
const desktopDependencies = function (dependencies) {
    if (includeWebRuntime) {
        return dependencies;
    }

    const result = { ...dependencies };
    delete result.webr;
    return result;
};
const isWebRuntimePath = function (entryPath) {
    return entryPath.includes(path.join("shared", "shell-web") + path.sep)
        || entryPath === path.join(sourceRoot, "scripts", "build-shell-web-modules.js")
        || entryPath === path.join(sourceRoot, "scripts", "web-dialogr-dev-server.js");
};
const cleanGeneratedAssetDirectories = function () {
    removeGeneratedDirectory(path.join(rootDir, "shared/assets"));
    removeGeneratedDirectory(path.join(rootDir, "shared/base-app/assets"));
    removeGeneratedDirectory(path.join(rootDir, "browser-esm"));
    removeGeneratedDirectory(path.join(rootDir, "build/output"));
    removeGeneratedDirectory(path.join(rootDir, "tests"));
    removeGeneratedDirectory(path.join(rootDir, "artifacts"));
    removeGeneratedDirectory(path.join(rootDir, "products"));
    removeGeneratedDirectory(path.join(rootDir, "scripts"));
    if (!includeWebRuntime) {
        removeGeneratedDirectory(path.join(rootDir, "shared/shell-web"));
        removeGeneratedDirectory(path.join(rootDir, "shared/runtime/providers/server-r"));
        removeGeneratedDirectory(path.join(rootDir, "shared/runtime/providers/webr"));
        removeGeneratedDirectory(path.join(rootDir, "node_modules/webr"));
    }
};
const copyPackageJson = function () {
    const sourcePackagePath = path.join(sourceRoot, "package.json");
    const targetPackagePath = path.join(rootDir, "package.json");
    const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, "utf8"));
    const targetPackage = {
        ...sourcePackage,
        main: "scripts/electron-main.js",
        dependencies: {
            ...desktopDependencies(sourcePackage.dependencies),
            "@dialogforge/core": sourcePackage.version
        },
        build: {
            ...sourcePackage.build,
            files: [
                "scripts/**/*",
                "shared/**/*",
                ...(includeWebRuntime ? ["browser-esm/**/*"] : [
                    "!shared/shell-web/**/*",
                    "!shared/runtime/providers/server-r/**/*",
                    "!shared/runtime/providers/webr/**/*",
                    "!browser-esm/**/*",
                    "!node_modules/webr/**/*"
                ]),
                "schemas/**/*",
                "products/**/*",
                "node_modules/@dialogforge/core/**/*",
                ...packagedRuntimeDependencies.map((packageName) => {
                    return `node_modules/${packageName}/**/*`;
                }),
                "package.json"
            ],
            asarUnpack: [
                "shared/runtime/providers/r/r-sources/**/*"
            ]
        }
    };
    fs.mkdirSync(path.dirname(targetPackagePath), { recursive: true });
    fs.writeFileSync(targetPackagePath, `${JSON.stringify(targetPackage, null, 4)}\n`);
};
const walk = function (dirPath) {
    fs.readdirSync(dirPath, { withFileTypes: true }).forEach((entry) => {
        const entryPath = path.join(dirPath, entry.name);
        if (!includeWebRuntime && isWebRuntimePath(entryPath)) {
            return;
        }
        if (entry.isDirectory()) {
            if (entry.name !== "dist" && entry.name !== "node_modules" && entry.name !== ".git") {
                walk(entryPath);
            }
            return;
        }
        const staticJavaScript = entry.name.endsWith(".js")
            && (entryPath.includes(path.join("shared", "base-app", "pages", "shared"))
                || entryPath.includes(path.join("shared", "base-app", "dialogs"))
                || (includeWebRuntime
                    && entryPath.includes(path.join("shared", "shell-web", "pages")))
                || entryPath.startsWith(path.join(sourceRoot, "scripts") + path.sep));
        if (staticJavaScript || /\.(html|css|json|R|svg|png|ico|icns|ttf|txt)$/.test(entry.name)) {
            copyFile(entryPath);
        }
    });
};
cleanGeneratedAssetDirectories();
["shared", "scripts", "schemas"].forEach((dirName) => {
    walk(path.join(sourceRoot, dirName));
});
copyPackageJson();
packagedRuntimeDependencies.forEach((packageName) => {
    copyDirectory(path.join(sourceRoot, "node_modules", packageName), path.join(rootDir, "node_modules", packageName));
});
