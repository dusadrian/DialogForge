"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");


const rootDir = process.cwd();
const read = function(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
};
const packageJson = JSON.parse(read("package.json"));
const watchProductSource = read("scripts/watch-product.js");


assert.strictEqual(
    packageJson.scripts["dev:product"],
    "npm run build && node scripts/watch-product.js",
    "product development mode must build the base app once and then run the watcher"
);
[
    "Usage: npm run dev:product -- /path/to/Product [electron args...]",
    'path.join(distDir, "scripts/package-product.js")',
    '"--stage-only"',
    '"dist/scripts/electron-main.js"',
    '"--product-path"',
    "ignoredDirectories",
    '"node_modules"',
    '"dist"',
    '".git"',
    "readTreeSnapshot",
    "snapshotsAreEqual",
    "Product staging failed",
    "Product refresh failed",
    "pendingRefresh",
    "pending product file change",
    "stoppingForRestart",
    "stopElectron",
    "startElectron"
].forEach((expected) => {
    assert.ok(
        watchProductSource.includes(expected),
        "product watch script is missing: " + expected
    );
});
