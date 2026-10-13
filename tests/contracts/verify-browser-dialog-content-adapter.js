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

const adapter = read("src/base-app/features/dialog-host/dialogContentAdapter.ts");
const dialogContentSize = read("src/base-app/features/dialog-host/dialogContentSize.ts");
const shell = read("src/shell-web/pages/shell.js");
const tsconfig = read("tsconfig.shell-web.json");


[
    "readDialogContentSize",
    "createDialogContentApiPath",
    "readDialogContentSizeFromSource"
].forEach((needle) => {
    assertIncludes(adapter, needle, "shared dialog content adapter");
});
[
    "/api/dialog/${encodeURIComponent",
    "readDialogContentSize",
    "Math.max(200",
    "Math.max(120",
    "record.width",
    "record.height"
].forEach((needle) => {
    assertIncludes(dialogContentSize, needle, "shared dialog content size helper");
});
[
    "properties.width",
    "properties.height",
    "Math.max(200",
    "Math.max(120"
].forEach((needle) => {
    assertNotIncludes(adapter, needle, "shared dialog content adapter");
});

assertIncludes(
    shell,
    "/browser-esm/src/base-app/features/dialog-host/dialogContentSize.js",
    "shared dialog content adapter import"
);
assertIncludes(
    shell,
    "readDialogContentSizeFromSource(entry.payload)",
    "shared dialog content adapter usage"
);

[
    "const readDialogContentSize = async function",
    "Math.max(200, Math.round(Number(properties.width) || 640))"
].forEach((needle) => {
    assertNotIncludes(shell, needle, "browser shell duplicate dialog sizing");
});

assertIncludes(
    tsconfig,
    "src/base-app/features/dialog-host/dialogContentAdapter.ts",
    "browser shell TypeScript build"
);
assertIncludes(
    tsconfig,
    "src/base-app/features/dialog-host/dialogContentSize.ts",
    "browser shell TypeScript build"
);

console.log("shared dialog content adapter verified");
