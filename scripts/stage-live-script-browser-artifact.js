"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");


const rootDir = path.resolve(__dirname, "..");
const sourceRoot = path.resolve(process.env.DIALOGFORGE_SOURCE_ROOT || rootDir);
const outputRoot = path.resolve(
    process.env.DIALOGFORGE_DIST_DIR || path.join(sourceRoot, "dist")
);
const pinPath = path.join(sourceRoot, "config/live-script-browser-artifact.json");


const sha256 = function(filePath) {
    return crypto.createHash("sha256")
        .update(fs.readFileSync(filePath))
        .digest("hex");
};


const assertPinnedValue = function(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(
            `Pinned live-script browser ${label} does not match: `
            + `expected ${expected}, received ${actual}.`
        );
    }
};


const main = function() {
    const pin = JSON.parse(fs.readFileSync(pinPath, "utf8"));
    const sourceDirectory = path.resolve(sourceRoot, pin.sourceDirectory);
    const manifestPath = path.join(sourceDirectory, "artifact-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    assertPinnedValue(
        sha256(manifestPath),
        pin.artifactManifestSha256,
        "manifest checksum"
    );
    assertPinnedValue(
        manifest.packageVersion,
        pin.packageVersion,
        "package version"
    );
    assertPinnedValue(
        manifest.sourceRevision,
        pin.sourceRevision,
        "source revision"
    );

    for (const [fileName, artifact] of Object.entries(manifest.artifacts || {})) {
        const filePath = path.join(sourceDirectory, fileName);

        assertPinnedValue(
            sha256(filePath),
            artifact.sha256,
            `${fileName} checksum`
        );
        assertPinnedValue(
            fs.statSync(filePath).size,
            artifact.bytes,
            `${fileName} size`
        );
    }

    const outputDirectory = path.resolve(outputRoot, pin.webPath);

    fs.rmSync(outputDirectory, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(outputDirectory), { recursive: true });
    fs.cpSync(sourceDirectory, outputDirectory, {
        recursive: true,
        force: true
    });

    console.log(
        `Staged DialogForgeIroh ${manifest.packageVersion} at `
        + path.relative(outputRoot, outputDirectory)
        + "."
    );
};


main();
