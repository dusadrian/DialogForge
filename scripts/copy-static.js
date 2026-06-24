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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const packagedRuntimeDependencies_1 = require("./packagedRuntimeDependencies");
const parentDir = path.resolve(__dirname, "..");
const runningFromDist = path.basename(parentDir) === "dist";
const rootDir = runningFromDist
    ? parentDir
    : path.join(parentDir, "dist");
const sourceRoot = runningFromDist
    ? path.resolve(rootDir, "..")
    : parentDir;
const copyFile = function (sourcePath) {
    const relativePath = path.relative(sourceRoot, sourcePath);
    const targetPath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
};
const copyDirectory = function (sourcePath, targetPath) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.cpSync(sourcePath, targetPath, {
        recursive: true,
        force: true
    });
};
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
                "products/**/*",
                ...packagedRuntimeDependencies_1.packagedRuntimeDependencies.map((packageName) => {
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
["shared", "scripts"].forEach((dirName) => {
    walk(path.join(sourceRoot, dirName));
});
copyPackageJson();
packagedRuntimeDependencies_1.packagedRuntimeDependencies.forEach((packageName) => {
    copyDirectory(path.join(sourceRoot, "node_modules", packageName), path.join(rootDir, "node_modules", packageName));
});
