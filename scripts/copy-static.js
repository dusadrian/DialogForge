"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("node:child_process");
const {
    packagedRuntimeDependencies
} = require("./packagedRuntimeDependencies");
const { ensureNativeIrohBinding } = require("./nativeIrohBinding");
const { assertWebRHelperArtifacts } = require("./web-r-helper-artifacts");
const { prepareNativeRHelperArtifacts, assertNativeRHelperArtifacts } = require("./native-r-helper-artifacts");
const parentDir = path.resolve(__dirname, "..");
const runningFromDist = path.basename(parentDir) === "dist";
const sourceRoot = path.resolve(
    process.env.DIALOGFORGE_SOURCE_ROOT || (
        runningFromDist
            ? path.resolve(parentDir, "..")
            : parentDir
    )
);
const rootDir = path.resolve(
    process.env.DIALOGFORGE_DIST_DIR || (
        runningFromDist
            ? parentDir
            : path.join(parentDir, "dist")
    )
);
const includeWebRuntime = process.argv.includes("--include-web-runtime");
const webRuntimeDependencies = [
    "@jaames/iro",
    "monaco-editor",
    "preact",
    "webr"
];

const assertCanonicalDialogStylesheet = function () {
    const dialogHtml = fs.readFileSync(
        path.join(sourceRoot, "src/base-app/pages/dialogBuilder.html"),
        "utf8"
    );
    const dialogCss = fs.readFileSync(
        path.join(sourceRoot, "src/base-app/pages/dialogBuilder.css"),
        "utf8"
    );

    [
        "@import url('./shared/dmSelect.css');",
        "@import url('./shared/appCodicon.css');"
    ].forEach((expectedImport) => {
        if (!dialogCss.includes(expectedImport)) {
            throw new Error(
                "The canonical dialog stylesheet must own its shared imports: "
                + expectedImport
            );
        }
    });

    if (!dialogHtml.includes('href="./dialogBuilder.css"')) {
        throw new Error(
            "Desktop and web dialogs must load the same canonical stylesheet."
        );
    }

    if (dialogHtml.includes("/browser-esm/dialogBuilder.css")) {
        throw new Error(
            "Dialogs must not load a separate browser-only stylesheet bundle."
        );
    }
};


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
    fs.rmSync(targetPath, {
        recursive: true,
        force: true
    });
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.cpSync(sourcePath, targetPath, {
        recursive: true,
        force: true,
        verbatimSymlinks: true
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
    return entryPath.includes(path.join("src", "shell-web") + path.sep)
        || entryPath === path.join(sourceRoot, "scripts", "build-shell-web-modules.js")
        || entryPath === path.join(sourceRoot, "scripts", "web-product-dev-server.js");
};
const cleanGeneratedAssetDirectories = function () {
    // These generated packages were consolidated into r-runtime. Never stage
    // an obsolete independent helper beside the single current package.
    ["r-inspection", "r-transport-prototype", "r-output-prototype"].forEach((directory) => {
        removeGeneratedDirectory(path.join(rootDir, directory));
    });
    removeGeneratedDirectory(path.join(rootDir, "shared"));
    removeGeneratedDirectory(path.join(rootDir, "src/assets"));
    removeGeneratedDirectory(path.join(rootDir, "src/base-app/assets"));
    removeGeneratedDirectory(path.join(rootDir, "browser-esm"));
    removeGeneratedDirectory(path.join(rootDir, "build/output"));
    removeGeneratedDirectory(path.join(rootDir, "tests"));
    removeGeneratedDirectory(path.join(rootDir, "artifacts"));
    removeGeneratedDirectory(path.join(rootDir, "browser-product"));
    removeGeneratedDirectory(path.join(rootDir, "product"));
    removeGeneratedDirectory(path.join(rootDir, "products"));
    removeGeneratedDirectory(path.join(rootDir, "scripts"));
    if (!includeWebRuntime) {
        removeGeneratedDirectory(path.join(rootDir, "src/shell-web"));
        removeGeneratedDirectory(path.join(rootDir, "src/runtime/providers/server-r"));
        removeGeneratedDirectory(path.join(rootDir, "src/runtime/providers/webr"));
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
        scripts: {
            ...sourcePackage.scripts,
            "serve:web-product": "node scripts/web-product-dev-server.js"
        },
        dependencies: {
            ...desktopDependencies(sourcePackage.dependencies),
            "@dialogforge/core": sourcePackage.version
        },
        build: {
            ...sourcePackage.build,
            files: [
                "scripts/**/*",
                "r-runtime/native/**/*",
                ...(includeWebRuntime ? ["r-runtime/webr/**/*"] : []),
                "src/**/*",
                ...(includeWebRuntime ? ["browser-esm/**/*"] : [
                    "!src/shell-web/**/*",
                    "!src/runtime/providers/server-r/**/*",
                    "!src/runtime/providers/webr/**/*",
                    "!browser-esm/**/*",
                    "!node_modules/webr/**/*"
                ]),
                "schemas/**/*",
                "product/**/*",
                "node_modules/@dialogforge/core/**/*",
                ...packagedRuntimeDependencies.map((packageName) => {
                    return `node_modules/${packageName}/**/*`;
                }),
                "package.json"
            ],
            asarUnpack: [
                "r-runtime/native/**/*",
                "src/runtime/providers/r/r-sources/**/*",
                "product/runtime/runtimeControlProfile.R",
                "node_modules/@number0/**/*.node"
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
            && (entryPath.includes(path.join("src", "base-app", "pages", "shared"))
                || entryPath.includes(path.join("src", "base-app", "dialogs"))
                || (includeWebRuntime
                    && entryPath.includes(path.join("src", "shell-web", "pages")))
                || entryPath.startsWith(path.join(sourceRoot, "scripts") + path.sep));
        if (staticJavaScript || /\.(html|css|json|R|svg|png|ico|icns|ttf|txt)$/.test(entry.name)) {
            copyFile(entryPath);
        }
    });
};
if (includeWebRuntime) {
    assertWebRHelperArtifacts(sourceRoot, path.join(sourceRoot, "dist"));
} else {
    // Validate and stage before clearing any existing generated app assets.
    prepareNativeRHelperArtifacts(sourceRoot, rootDir);
    assertNativeRHelperArtifacts(sourceRoot, rootDir, process.platform, process.arch);
}
assertCanonicalDialogStylesheet();
cleanGeneratedAssetDirectories();
["src", "scripts", "schemas"].forEach((dirName) => {
    walk(path.join(sourceRoot, dirName));
});
const cacheBuild = spawnSync(process.env.DIALOGFORGE_BUILD_R || "R", [
    "--vanilla", "--slave",
    `--file=${path.join(sourceRoot, "scripts/build-r-control-cache.R")}`,
    "--args", path.join(sourceRoot, "src/runtime/providers/r/r-sources"),
    path.join(rootDir, "src/runtime/providers/r/r-sources/runtime-control-cache.rds")
], { stdio: "inherit" });
if (cacheBuild.error?.code === "ENOENT") {
    console.warn("R is unavailable for generated control bytecode; startup will compile from canonical sources.");
}
else if (cacheBuild.error || cacheBuild.status !== 0) {
    throw cacheBuild.error || new Error("Canonical runtime compilation cache build failed.");
}
copyPackageJson();
for (const helper of [
    { directory: "r-runtime", hosts: includeWebRuntime ? ["webr"] : [] }
]) {
    for (const host of helper.hosts) {
        const helperSource = path.join(sourceRoot, "dist", helper.directory, host);
        const helperTarget = path.join(rootDir, helper.directory, host);
        if (helperSource !== helperTarget && fs.existsSync(helperSource)) {
            copyDirectory(helperSource, helperTarget);
        }
    }
}
if (includeWebRuntime) {
    assertWebRHelperArtifacts(sourceRoot, rootDir);
} else {
    assertNativeRHelperArtifacts(sourceRoot, rootDir, process.platform, process.arch);
}
// Intel macOS carries a self-built iroh binding inside @number0/iroh, so it has
// to be in place before that package is staged.
ensureNativeIrohBinding(sourceRoot);
packagedRuntimeDependencies.forEach((packageName) => {
    copyDirectory(path.join(sourceRoot, "node_modules", packageName), path.join(rootDir, "node_modules", packageName));
});
if (includeWebRuntime) {
    webRuntimeDependencies.forEach((packageName) => {
        copyDirectory(
            path.join(sourceRoot, "node_modules", packageName),
            path.join(rootDir, "node_modules", packageName)
        );
    });
}
