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
const cleanGeneratedAssetDirectories = function () {
    removeGeneratedDirectory(path.join(rootDir, "shared/assets"));
    removeGeneratedDirectory(path.join(rootDir, "shared/base-app/assets"));
    removeGeneratedDirectory(path.join(rootDir, "build/output"));
    removeGeneratedDirectory(path.join(rootDir, "tests"));
    removeGeneratedDirectory(path.join(rootDir, "artifacts"));
    removeGeneratedDirectory(path.join(rootDir, "products"));
    removeGeneratedDirectory(path.join(rootDir, "scripts"));
};
const copyPackageJson = function () {
    const sourcePackagePath = path.join(sourceRoot, "package.json");
    const targetPackagePath = path.join(rootDir, "package.json");
    const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, "utf8"));
    const targetPackage = {
        ...sourcePackage,
        main: "scripts/electron-main.js",
        build: {
            ...sourcePackage.build,
            files: [
                "scripts/**/*",
                "shared/**/*",
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
        if (entry.isDirectory()) {
            if (entry.name !== "dist" && entry.name !== "node_modules" && entry.name !== ".git") {
                walk(entryPath);
            }
            return;
        }
        const staticJavaScript = entry.name.endsWith(".js")
            && (entryPath.includes(path.join("shared", "base-app", "pages", "shared"))
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
