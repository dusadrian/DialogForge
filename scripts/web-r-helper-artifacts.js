"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");
const { listArtifactFiles, readHelperPackageVersion, hashHelperSourceFiles } = require("./r-helper-artifact-files");

const helpers = [
    { name: "dialogforgeruntime", directory: "r-runtime", builder: "build-r-runtime-helper.js" }
];

const readWebRHelperArtifacts = function(sourceRoot) {
    const configurationPath = path.join(sourceRoot, "node_modules/webr/dist/webR/config.d.ts");
    const configuration = fs.readFileSync(configurationPath, "utf8");
    const runtimeVersion = configuration.match(/\bR_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/);
    if (!runtimeVersion) {
        throw new Error("Cannot determine the installed WebR R version from " + configurationPath);
    }
    return helpers.map(function(helper) {
        const sourceDirectory = path.join(sourceRoot, "src/runtime/providers/r/native", helper.name);
        const packageVersion = readHelperPackageVersion(sourceRoot, helper.name);
        return {
            ...helper, sourceDirectory, packageVersion, runtimeVersion: runtimeVersion[1],
            relativePath: path.join(helper.directory, "webr", runtimeVersion[1], `${helper.name}_${packageVersion}.tgz`)
        };
    });
};

const createHelperBuildIdentity = function(sourceRoot, helper) {
    const files = listArtifactFiles(helper.sourceDirectory).concat([
        path.join(sourceRoot, "scripts", helper.builder),
        path.join(sourceRoot, "scripts/build-r-helper-webr.R"),
        path.join(sourceRoot, "node_modules/webr/package.json"),
        path.join(sourceRoot, "node_modules/webr/dist/webR/config.d.ts")
    ]).sort();
    return {
        format: 1,
        packageName: helper.name,
        packageVersion: helper.packageVersion,
        runtimeVersion: helper.runtimeVersion,
        toolchainImage: process.env.DIALOGFORGE_WEBR_BUILD_IMAGE || "ghcr.io/r-wasm/webr:v0.6.0",
        sourceSha256: hashHelperSourceFiles(sourceRoot, files)
    };
};

const readHelperArchiveHash = function(archivePath) {
    const bytes = fs.readFileSync(archivePath);
    if (bytes.length < 20 || bytes[0] !== 0x1f || bytes[1] !== 0x8b
        || zlib.gunzipSync(bytes).length === 0) {
        throw new Error("Invalid WebR helper archive: " + archivePath);
    }
    return crypto.createHash("sha256").update(bytes).digest("hex");
};

const readCurrentHelperBuild = function(archivePath, identity) {
    if (!fs.existsSync(archivePath) || !fs.existsSync(archivePath + ".build.json")) {
        return null;
    }
    let receipt;
    let archiveSha256;
    try {
        receipt = JSON.parse(fs.readFileSync(archivePath + ".build.json", "utf8"));
        if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
            return null;
        }
        archiveSha256 = readHelperArchiveHash(archivePath);
    } catch (error) {
        if (error.code === "EACCES" || error.code === "EPERM") {
            throw error;
        }
        return null;
    }
    if (Object.keys(identity).some(key => receipt[key] !== identity[key])
        || receipt.archiveSha256 !== archiveSha256) {
        return null;
    }
    return receipt;
};

const copyHelperArtifact = function(sourceRoot, outputRoot, helper, identity) {
    const archivePath = path.join(sourceRoot, helper.relativePath);
    const receipt = readCurrentHelperBuild(archivePath, identity);
    if (!receipt) {
        throw new Error("Prebuilt WebR helper is missing, stale or invalid: " + archivePath
            + ". A maintainer must run npm run build:r-helper:webr and include the regenerated"
            + " vendor/r-runtime artifacts with the source change. Deployment will not download a compiler.");
    }
    const outputPath = path.join(outputRoot, helper.relativePath);
    const currentReceipt = readCurrentHelperBuild(outputPath, identity);
    if (!currentReceipt || currentReceipt.archiveSha256 !== receipt.archiveSha256) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.copyFileSync(archivePath, outputPath);
        fs.copyFileSync(archivePath + ".build.json", outputPath + ".build.json");
    }
};

const prepareWebRHelperArtifacts = function(sourceRoot) {
    const artifacts = readWebRHelperArtifacts(sourceRoot);
    for (const helper of artifacts) {
        const identity = createHelperBuildIdentity(sourceRoot, helper);
        copyHelperArtifact(path.join(sourceRoot, "vendor"), path.join(sourceRoot, "dist"), helper, identity);
        console.log("Using verified prebuilt WebR helper: " + helper.relativePath);
    }
    return artifacts;
};

const buildWebRHelperArtifacts = function(sourceRoot, buildHelper) {
    const artifacts = readWebRHelperArtifacts(sourceRoot);
    for (const helper of artifacts) {
        const identity = createHelperBuildIdentity(sourceRoot, helper);
        const archivePath = path.join(sourceRoot, "dist", helper.relativePath);
        console.log("Building required WebR helper from canonical source: " + helper.name);
        // A successful builder must create the requested archive, not re-certify
        // an older binary left behind for a different source or toolchain.
        for (const filePath of [archivePath, archivePath + ".build.json"]) {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        const builder = path.join(sourceRoot, "scripts", helper.builder);
        const result = buildHelper ? buildHelper(helper) : spawnSync(process.execPath, [builder, "webr"], {
            cwd: sourceRoot, env: process.env, stdio: "inherit"
        });
        if (result.error || result.status !== 0) {
            throw new Error("Cannot build " + helper.name + " for WebR R " + helper.runtimeVersion
                + ". This explicit maintainer build requires R and Docker with " + identity.toolchainImage
                + "; the prebuilt bundle has not been updated. " + (result.error?.message || "Builder exited " + result.status));
        }
        let archiveSha256;
        try {
            archiveSha256 = readHelperArchiveHash(archivePath);
        } catch (error) {
            throw new Error("WebR builder did not produce a valid helper for R "
                + helper.runtimeVersion + " at " + archivePath + ": " + error.message);
        }
        fs.writeFileSync(archivePath + ".build.json", JSON.stringify({ ...identity, archiveSha256 }, null, 2) + "\n");
    }
    return artifacts;
};

const bundleWebRHelperArtifacts = function(sourceRoot, buildHelper) {
    const artifacts = buildWebRHelperArtifacts(sourceRoot, buildHelper);
    for (const helper of artifacts) {
        copyHelperArtifact(path.join(sourceRoot, "dist"), path.join(sourceRoot, "vendor"),
            helper, createHelperBuildIdentity(sourceRoot, helper));
        console.log("Updated versioned prebuilt WebR helper: vendor/" + helper.relativePath);
    }
    return artifacts;
};

const assertWebRHelperArtifacts = function(sourceRoot, outputRoot) {
    const artifacts = readWebRHelperArtifacts(sourceRoot);
    for (const helper of artifacts) {
        const archivePath = path.join(outputRoot, helper.relativePath);
        const identity = createHelperBuildIdentity(sourceRoot, helper);
        const receipt = readCurrentHelperBuild(archivePath, identity);
        const supplied = readCurrentHelperBuild(path.join(sourceRoot, "vendor", helper.relativePath), identity);
        if (!receipt || !supplied || receipt.archiveSha256 !== supplied.archiveSha256) {
            throw new Error("Required WebR helper is missing, stale or invalid: " + archivePath
                + ". Run npm run build:web to prepare and stage all required helpers.");
        }
    }
    return artifacts;
};

exports.readWebRHelperArtifacts = readWebRHelperArtifacts;
exports.prepareWebRHelperArtifacts = prepareWebRHelperArtifacts;
exports.buildWebRHelperArtifacts = buildWebRHelperArtifacts;
exports.bundleWebRHelperArtifacts = bundleWebRHelperArtifacts;
exports.assertWebRHelperArtifacts = assertWebRHelperArtifacts;

const checkServedWebRHelperArtifacts = async function(sourceRoot, outputRoot, baseUrl) {
    const artifacts = assertWebRHelperArtifacts(sourceRoot, outputRoot);
    for (const helper of artifacts) {
        const url = new URL(helper.relativePath.split(path.sep).join("/"), baseUrl.replace(/\/$/, "") + "/");
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (response.status !== 200) {
            throw new Error("Required WebR helper returned HTTP " + response.status + ": " + url);
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        const archiveSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
        const expected = readHelperArchiveHash(path.join(outputRoot, helper.relativePath));
        if (archiveSha256 !== expected) {
            throw new Error("Served WebR helper differs from the checked deployment artifact: " + url);
        }
        console.log("Required WebR helper served with matching SHA256: " + url);
    }
};

exports.checkServedWebRHelperArtifacts = checkServedWebRHelperArtifacts;

if (require.main === module) {
    const sourceRoot = path.resolve(process.env.DIALOGFORGE_SOURCE_ROOT || path.join(__dirname, ".."));
    const mode = process.argv[2];
    if (mode === "--prepare") {
        prepareWebRHelperArtifacts(sourceRoot);
        assertWebRHelperArtifacts(sourceRoot, path.join(sourceRoot, "dist"));
    } else if (mode === "--bundle") {
        bundleWebRHelperArtifacts(sourceRoot);
    } else if (mode === "--check-output" && process.argv[3]) {
        assertWebRHelperArtifacts(sourceRoot, path.resolve(process.argv[3]));
        console.log("Required WebR helper artifact and build receipt are current.");
    } else if (mode === "--check-url" && process.argv[3] && process.argv[4] === "--output-root" && process.argv[5]) {
        checkServedWebRHelperArtifacts(sourceRoot, path.resolve(process.argv[5]), process.argv[3]).catch(function(error) {
            console.error(error.message);
            process.exitCode = 1;
        });
    } else {
        throw new Error("Use --prepare, --bundle, --check-output <directory>, or --check-url <url> --output-root <directory>.");
    }
}
