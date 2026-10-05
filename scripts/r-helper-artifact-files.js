"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const listArtifactFiles = function(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(function(entry) {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return listArtifactFiles(filePath);
        }
        if (!entry.isFile()) {
            throw new Error("Unsupported helper artifact entry: " + filePath);
        }
        return [filePath];
    });
};

const fileSha256 = function(filePath) {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
};

const readArtifactFileHashes = function(directory) {
    const files = {};
    for (const filePath of listArtifactFiles(directory).sort()) {
        const relativePath = path.relative(directory, filePath).split(path.sep).join("/");
        files[relativePath] = fileSha256(filePath);
    }
    return files;
};

const readHelperPackageVersion = function(sourceRoot, packageName) {
    const descriptionPath = path.join(sourceRoot, "src/runtime/providers/r/native", packageName, "DESCRIPTION");
    const description = fs.readFileSync(descriptionPath, "utf8");
    const version = description.match(/^Version:\s*(\d+(?:\.\d+)+)\s*$/m);
    if (!version) {
        throw new Error("Cannot determine the canonical helper version: " + packageName);
    }
    return version[1];
};

const hashHelperSourceFiles = function(sourceRoot, files) {
    const hash = crypto.createHash("sha256");
    for (const filePath of [...files].sort()) {
        hash.update(path.relative(sourceRoot, filePath).split(path.sep).join("/"));
        hash.update("\0");
        hash.update(fs.readFileSync(filePath));
        hash.update("\0");
    }
    return hash.digest("hex");
};

module.exports = {
    listArtifactFiles, fileSha256, readArtifactFileHashes,
    readHelperPackageVersion, hashHelperSourceFiles
};
