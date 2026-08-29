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
    // From the build workflow's output. Empty means "download but do not
    // verify", which the ensure step reports loudly.
    sha256: "841197e36c3d002e813006b25f3b7e884595d0fa6552c60ab4ac80e1df979606"
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


// Intel macOS is the only platform whose iroh binary is not the published one,
// so an @number0/iroh bump silently leaves it behind unless the pin moves too.
// Pre-release verification fails rather than shipping that mismatch.
const assertBindingPinMatchesDependency = function(sourceRoot) {
    const packagePath = path.join(sourceRoot, "package.json");

    if (!fs.existsSync(packagePath)) {
        throw new Error(`DialogForge package.json was not found: ${packagePath}`);
    }

    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const dependencies = packageJson.dependencies || {};
    const declared = String(dependencies["@number0/iroh"] || "").replace(/^[\^~]/, "").trim();

    if (!declared) {
        throw new Error("@number0/iroh is not a declared DialogForge dependency.");
    }
    if (declared !== nativeIrohBindingPin.version) {
        throw new Error([
            "The Intel macOS iroh binding pin does not match the declared"
            + " @number0/iroh dependency.",
            `  dependency: ${declared}`,
            `  binding pin: ${nativeIrohBindingPin.version}`,
            "Intel macOS would ship a binding built against a different iroh"
            + " than every other platform.",
            "Run the \"Build native iroh binding for Intel macOS\" workflow with"
            + ` iroh_version=${declared}, then update version and sha256 in`
            + " scripts/nativeIrohBinding.js."
        ].join("\n"));
    }

    return declared;
};


module.exports = {
    nativeIrohBindingPin,
    requiresSelfBuiltBinding,
    bindingTargetPath,
    ensureNativeIrohBinding,
    assertBindingPinMatchesDependency
};
