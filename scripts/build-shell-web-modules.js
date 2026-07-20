"use strict";

const childProcess = require("child_process");
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const sourceRoot = path.resolve(process.env.DIALOGFORGE_SOURCE_ROOT || rootDir);
const outputRoot = path.resolve(process.env.DIALOGFORGE_DIST_DIR || path.join(sourceRoot, "dist"));
const tscPath = path.join(sourceRoot, "node_modules/typescript/bin/tsc");

childProcess.execFileSync(process.execPath, [
    tscPath,
    "-p",
    path.join(sourceRoot, "tsconfig.shell-web.json"),
    "--outDir",
    path.join(outputRoot, "browser-esm")
], {
    cwd: sourceRoot,
    stdio: "inherit"
});

const qrCodeOutput = path.join(outputRoot, "vendor", "qrcode", "qrcode.mjs");
fs.mkdirSync(path.dirname(qrCodeOutput), { recursive: true });
esbuild.buildSync({
    entryPoints: [path.join(sourceRoot, "node_modules", "qrcode", "lib", "browser.js")],
    outfile: qrCodeOutput,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022"
});
