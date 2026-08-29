"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");


// n0's published 0.35.0 build for macOS x64 crashes on genuine Intel hardware
// (EXC_I386_GPFLT on a tokio worker thread, inside the prebuilt binary itself).
// The same iroh-ffi source rebuilt with a current toolchain is fine, so Intel
// macOS ships a binding built by .github/workflows/build-native-iroh-binding.yml
// instead of @number0/iroh-darwin-universal.
const nativeIrohBindingPin = {
    version: "0.35.0",
    repository: "dusadrian/DialogForge",
    releaseTag: "iroh-bindings-0.35.0",
    assetName: "iroh.darwin-x64.node",
    // Filled in from the build workflow's output. Empty means "download but do
    // not verify", which the ensure step reports loudly.
    sha256: ""
};


const requiresSelfBuiltBinding = function(platform, arch) {
    return platform === "darwin" && arch === "x64";
};


const bindingTargetPath = function(sourceRoot) {
    return path.join(
        sourceRoot,
        "node_modules",
        "@number0",
        "iroh",
        nativeIrohBindingPin.assetName
    );
};


const fileDigest = function(filePath) {
    return crypto
        .createHash("sha256")
        .update(fs.readFileSync(filePath))
        .digest("hex");
};


const downloadBinding = function(targetPath) {
    const url = `https://github.com/${nativeIrohBindingPin.repository}`
        + `/releases/download/${nativeIrohBindingPin.releaseTag}`
        + `/${nativeIrohBindingPin.assetName}`;

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    const download = spawnSync(
        "curl",
        ["--fail", "--silent", "--show-error", "--location", url, "--output", targetPath],
        { encoding: "utf8", timeout: 300000 }
    );

    if (download.status !== 0) {
        throw new Error(
            `Downloading the Intel macOS iroh binding failed (${url}): `
            + `${(download.stderr || "").trim()}`
        );
    }

    return url;
};


// Intel macOS builds must carry a working iroh binding before the runtime
// dependencies are staged, or Live Script crashes the packaged application.
const ensureNativeIrohBinding = function(sourceRoot, platform, arch) {
    if (!requiresSelfBuiltBinding(platform || process.platform, arch || process.arch)) {
        return "";
    }

    const targetPath = bindingTargetPath(sourceRoot);

    if (!fs.existsSync(targetPath)) {
        const url = downloadBinding(targetPath);

        console.log(`Downloaded the Intel macOS iroh binding from ${url}`);
    }

    const digest = fileDigest(targetPath);

    if (!nativeIrohBindingPin.sha256) {
        console.warn(
            `The Intel macOS iroh binding is unpinned. Set sha256 in`
            + ` scripts/nativeIrohBinding.js to ${digest}`
        );

        return targetPath;
    }
    if (digest !== nativeIrohBindingPin.sha256) {
        fs.rmSync(targetPath, { force: true });

        throw new Error(
            "The Intel macOS iroh binding did not match its pinned checksum: "
            + `expected ${nativeIrohBindingPin.sha256}, got ${digest}`
        );
    }

    return targetPath;
};


module.exports = {
    nativeIrohBindingPin,
    requiresSelfBuiltBinding,
    bindingTargetPath,
    ensureNativeIrohBinding
};
