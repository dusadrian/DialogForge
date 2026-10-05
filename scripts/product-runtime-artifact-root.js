"use strict";

const fs = require("node:fs");
const path = require("node:path");

module.exports = function productRuntimeArtifactRoot(context) {
    const resources = context.packager.getResourcesDir(context.appOutDir);
    const applicationRoot = path.join(resources,
        fs.existsSync(path.join(resources, "app.asar")) ? "app.asar.unpacked" : "app");
    // Product builds package staged dist as the app root; direct base builds
    // retain its dist prefix. Both host callbacks use this same resolver.
    return fs.existsSync(path.join(applicationRoot, "r-runtime/native/manifest.json"))
        ? applicationRoot : path.join(applicationRoot, "dist");
};
