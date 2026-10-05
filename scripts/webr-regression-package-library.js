"use strict";

// Test-only resource serving. Package loading/mounting executes the production
// adapter, not a fixture implementation or a substituted R metadata reader.
const fs = require("node:fs");
const path = require("node:path");
const { readSplitLibraryManifest } = require("./web-package-library-profiles");

const readRegressionPackageLibrary = function(root, includeDeferred = false) {
    const directory = process.env.DIALOGFORGE_TEST_WEBR_LIBRARY
        || path.join(root, "dist/product/library/R");
    const manifest = readSplitLibraryManifest(directory);
    if (!manifest) {
        throw new Error("Prepare the canonical WebR split package library before this regression.");
    }
    const profiles = includeDeferred ? [manifest, manifest.deferred] : [manifest];
    const resources = new Map();
    for (const profile of profiles) {
        for (const url of [profile.metadataUrl, profile.dataUrl]) {
            resources.set(url, path.join(directory, path.basename(url)));
        }
    }
    return { profiles, resources };
};

const regressionPackageLibrarySource = function(library) {
    return `
        import { mountBrowserProductPackageLibrary } from
            "./src/runtime/providers/webr/webRBrowserPackageLibraryAdapter";
        window.mountRegressionPackageLibrary = async function(runtime) {
            const timings = [];
            const progress = { setStatus() {}, progressFromStage() { return 0; } };
            for (const profile of ${JSON.stringify(library.profiles)}) {
                const started = performance.now();
                const result = await mountBrowserProductPackageLibrary(runtime, profile, progress);
                if (!result.mounted) {
                    throw new Error("Regression package library did not mount.");
                }
                timings.push({ mountpoint: result.mountpoint, milliseconds: performance.now() - started });
            }
            return timings;
        };
    `;
};

const serveRegressionPackageLibrary = function(pathname, response, library) {
    const file = library.resources.get(pathname);
    if (!file) {
        return false;
    }
    const bytes = fs.readFileSync(file);
    response.setHeader("Content-Type", file.endsWith(".gz")
        ? "application/gzip" : "application/json");
    response.setHeader("Content-Length", bytes.length);
    response.end(bytes);
    return true;
};

module.exports = {
    readRegressionPackageLibrary,
    regressionPackageLibrarySource,
    serveRegressionPackageLibrary
};
