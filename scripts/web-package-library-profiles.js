"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const readProfile = function(manifest, name, libraryDir) {
    const profile = manifest.profiles?.[name];
    if (!profile || profile.documentation_stripped) {
        throw new Error(`Missing documented WebR profile: ${name}`);
    }
    const result = {
        available: true,
        mountpoint: `/.dialogforge-${name}`
    };
    const hashes = [];
    for (const [kind, asset] of Object.entries(profile.assets)) {
        if (!['data', 'metadata'].includes(kind)
            || path.basename(asset.filename) !== asset.filename
            || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
            throw new Error("Invalid WebR profile asset.");
        }
        const bytes = fs.readFileSync(path.join(libraryDir, asset.filename));
        const hash = crypto.createHash("sha256").update(bytes).digest("hex");
        if (hash !== asset.sha256 || bytes.length !== asset.bytes) {
            throw new Error(`WebR profile asset failed validation: ${asset.filename}`);
        }
        result[`${kind}Url`] = `/webr-library/${asset.filename}`;
        hashes.push(`${kind}:${hash}`);
    }
    if (!result.dataUrl || !result.metadataUrl) {
        throw new Error("Incomplete WebR profile pair.");
    }
    result.contentHash = hashes.sort().join("|");
    return result;
};

const readSplitLibraryManifest = function(libraryDir) {
    const file = path.join(libraryDir, "vfs-manifest.json");
    if (!fs.existsSync(file)) {
        return null;
    }
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!manifest.startup_profile || !manifest.deferred_profile) {
        return null;
    }
    if (manifest.schema !== "roda-webr-vfs-manifest" || manifest.runtime !== "serial") {
        throw new Error("Unsupported WebR library manifest.");
    }
    return {
        ...readProfile(manifest, manifest.startup_profile, libraryDir),
        deferred: readProfile(manifest, manifest.deferred_profile, libraryDir)
    };
};

const downloadSplitLibrary = async function(libraryDir, releaseAssets, downloadFile) {
    const asset = releaseAssets.get("vfs-manifest.json");
    if (!asset) {
        return;
    }
    const staging = fs.mkdtempSync(path.join(libraryDir, ".profiles-"));
    try {
        const manifestFile = path.join(staging, "vfs-manifest.json");
        await downloadFile(asset.browser_download_url, manifestFile);
        const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
        if (!manifest.startup_profile || !manifest.deferred_profile) {
            return;
        }
        for (const name of [manifest.startup_profile, manifest.deferred_profile]) {
            for (const entry of Object.values(manifest.profiles[name].assets)) {
                if (path.basename(entry.filename) !== entry.filename) {
                    throw new Error("Invalid WebR release filename.");
                }
                const releaseAsset = releaseAssets.get(entry.filename);
                if (!releaseAsset) {
                    throw new Error(`Missing WebR release asset: ${entry.filename}`);
                }
                await downloadFile(releaseAsset.browser_download_url, path.join(staging, entry.filename));
            }
        }
        readSplitLibraryManifest(staging);
        for (const file of fs.readdirSync(staging)) {
            if (file !== "vfs-manifest.json") {
                fs.copyFileSync(path.join(staging, file), path.join(libraryDir, file));
            }
        }
        fs.renameSync(manifestFile, path.join(libraryDir, "vfs-manifest.json"));
    }
    finally {
        fs.rmSync(staging, { recursive: true, force: true });
    }
};

module.exports = { readSplitLibraryManifest, downloadSplitLibrary };
