const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../..");

const read = function(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
};

const assertIncludes = function(text, needle, label) {
    if (!text.includes(needle)) {
        throw new Error(`${label} is missing: ${needle}`);
    }
};

const assertNotIncludes = function(text, needle, label) {
    if (text.includes(needle)) {
        throw new Error(`${label} should not contain: ${needle}`);
    }
};

const adapter = read("src/shell-web/browserRuntimeProgressAdapter.ts");
const cover = read("src/console/renderer/consoleCoverController.ts");
const webRProgress = read("src/runtime/providers/webr/webRStartupProgress.ts");
const shell = read("src/shell-web/pages/shell.js");
const tsconfig = read("tsconfig.shell-web.json");

[
    "createBrowserRuntimeProgressController",
    "createConsoleCoverController",
    "cover.setProgress",
    "progressFromStage",
    "setStatus"
].forEach((needle) => {
    assertIncludes(adapter, needle, "browser runtime progress adapter");
});
[
    "Loading web runtime...",
    "Downloading WebR package library...",
    "Running application startup tasks...",
    "WebR ready",
    "defaultWebRStartupProgressMessage",
    "readWebRStartupProgressStage",
    "readWebRStartupProgressFromStage",
    "clampWebRStartupProgress"
].forEach((needle) => {
    assertIncludes(webRProgress, needle, "WebR startup progress helper");
});
[
    "const runtimeProgressStages",
    "Downloading WebR package library..."
].forEach((needle) => {
    assertNotIncludes(adapter, needle, "browser runtime progress adapter");
});

assertIncludes(
    shell,
    "/browser-esm/src/shell-web/browserRuntimeProgressAdapter.js",
    "browser shell runtime progress adapter import"
);
[
    "createBrowserRuntimeProgressController({",
    "browserRuntimeProgress().progressFromStage(message, fraction)",
    "browserRuntimeProgress().setStatus(text, progress)"
].forEach((needle) => {
    assertIncludes(shell, needle, "browser shell runtime progress adapter usage");
});

[
    "const runtimeProgressStages = {",
    "let runtimeProgressValue = 4",
    "const writeRuntimeProgress = function",
    "const stopRuntimeProgressTrickle = function",
    "const startRuntimeProgressTrickle = function"
].forEach((needle) => {
    assertNotIncludes(shell, needle, "browser shell duplicate runtime progress implementation");
});

assertIncludes(
    tsconfig,
    "src/shell-web/browserRuntimeProgressAdapter.ts",
    "browser shell TypeScript build"
);
assertIncludes(
    tsconfig,
    "src/runtime/providers/webr/webRStartupProgress.ts",
    "browser shell TypeScript build"
);

for (const marker of ["consoleCoverProgress", "--console-cover-progress", "is-indeterminate", "console-cover-visible"]) {
    assertIncludes(cover, marker, "shared console cover owner");
}
console.log("browser runtime progress adapter verified");
