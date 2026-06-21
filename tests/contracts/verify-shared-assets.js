"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const rootDir = path.resolve(__dirname, "../..");
const distDir = path.join(rootDir, "dist");
const requiredSharedAssets = [
    "assets/fonts/Inter/Inter-Regular.ttf",
    "assets/fonts/Inter/Inter-Bold.ttf",
    "assets/fonts/liberation-mono/LiberationMono-Regular.ttf",
    "assets/fonts/liberation-mono/LiberationMono-Bold.ttf",
    "assets/fonts/liberation-mono/LiberationMono-Italic.ttf",
    "assets/fonts/liberation-mono/LiberationMono-BoldItalic.ttf",
    "assets/icons/plus.svg",
    "assets/icons/restart.svg",
    "assets/icons/restartworkspace.svg",
    "assets/icons/folder.svg",
    "assets/icons/fit.svg",
    "assets/icons/home.svg",
    "assets/icons/info.svg",
    "assets/icons/clear-all.svg",
    "assets/icons/chevron-right.svg",
    "assets/icons/chevron-left.svg",
    "assets/icons/trash.svg",
    "assets/icons/arrow-left.svg",
    "assets/icons/arrow-right.svg",
    "assets/icons/xcircle.svg",
    "assets/icons/save.svg",
    "assets/icons/saveas.svg",
    "assets/codicons/codicon.ttf",
    "assets/codicons/CODICONS-LICENSE.txt"
];
const forbiddenSharedAssets = [
    "assets/fonts/app-extra-codicon.ttf",
    "assets/fonts/positron-codicon.ttf"
];
for (const assetPath of requiredSharedAssets) {
    const sourcePath = path.join(rootDir, "shared", assetPath);
    const distPath = path.join(distDir, "shared", assetPath);
    assert.ok(fs.existsSync(sourcePath), `shared assets is missing ${assetPath}.`);
    assert.ok(fs.statSync(sourcePath).size > 0, `shared assets ${assetPath} is empty.`);
    assert.ok(fs.existsSync(distPath), `build output is missing shared ${assetPath}.`);
}
for (const assetPath of forbiddenSharedAssets) {
    assert.strictEqual(fs.existsSync(path.join(rootDir, "shared", assetPath)), false, `shared assets must use SVG assets instead of ${assetPath}.`);
}
console.log("Shared assets verified.");
