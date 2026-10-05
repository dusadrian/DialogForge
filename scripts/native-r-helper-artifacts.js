"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
    listArtifactFiles, fileSha256, readArtifactFileHashes,
    readHelperPackageVersion, hashHelperSourceFiles
} = require("./r-helper-artifact-files");

const packageName = "dialogforgeruntime";
const sourceRelativePath = "src/runtime/providers/r/native/" + packageName;
const nativeRelativePath = "r-runtime/native";

const readPackageVersion = function(sourceRoot) {
    return readHelperPackageVersion(sourceRoot, packageName);
};

const readSourceSha256 = function(sourceRoot) {
    return hashHelperSourceFiles(sourceRoot, listArtifactFiles(path.join(sourceRoot, sourceRelativePath)));
};

const targetDirectory = function(target) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(target.runtimePlatform)
        || !/^\d+\.\d+\.\d+$/.test(target.runtimeVersion)) {
        throw new Error("Invalid pinned native R target.");
    }
    const platform = /apple-darwin/.test(target.runtimePlatform) ? "darwin"
        : /mingw/.test(target.runtimePlatform) ? "win32"
        : /linux/.test(target.runtimePlatform) ? "linux" : "";
    const arch = /^(aarch64|arm64)-/.test(target.runtimePlatform) ? "arm64"
        : /^x86_64-/.test(target.runtimePlatform) ? "x64" : "";
    if (!platform || !arch || target.platform !== platform || target.arch !== arch) {
        throw new Error("Native helper OS/architecture does not match its R platform.");
    }
    return target.runtimePlatform + "-" + target.runtimeVersion;
};

const readJson = function(filePath) {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Invalid helper receipt: " + filePath);
    }
    return value;
};

const assertNativeHelperPayload = function(sourceRoot, artifactRoot, target, acceptSigningChange) {
    const directory = path.join(artifactRoot, targetDirectory(target));
    const receiptPath = path.join(directory, packageName + ".build.json");
    if (fileSha256(receiptPath) !== target.receiptSha256) {
        throw new Error("Native helper receipt differs from its release pin: " + receiptPath);
    }
    const receipt = readJson(receiptPath);
    if (receipt.format !== 1 || receipt.packageName !== packageName
        || receipt.packageVersion !== readPackageVersion(sourceRoot)
        || receipt.sourceSha256 !== readSourceSha256(sourceRoot)
        || receipt.runtimePlatform !== target.runtimePlatform
        || receipt.runtimeVersion !== target.runtimeVersion
        || receipt.platform !== target.platform || receipt.arch !== target.arch
        || receipt.acceptance?.status !== "passed"
        || !Array.isArray(receipt.acceptance.cases) || receipt.acceptance.cases.length === 0
        || receipt.acceptance.scope !== "canonical-native-abi-with-declared"
        || !Number.isFinite(Date.parse(receipt.acceptance.completedAt))
        || !["before-and-after-native-acceptance", "retained-accepted-library-at-promotion"]
            .includes(receipt.acceptance.payloadHashTiming)
        || !/^[a-f0-9]{64}$/.test(receipt.acceptance.reportSha256)) {
        throw new Error("Native helper is stale, unqualified or for another target: " + directory);
    }
    const packageDirectory = path.join(directory, packageName);
    const files = readArtifactFileHashes(packageDirectory);
    if (JSON.stringify(Object.keys(files)) !== JSON.stringify(Object.keys(receipt.files || {}))) {
        throw new Error("Native helper payload differs from its verified checksums: " + packageDirectory);
    }
    for (const [name, hash] of Object.entries(files)) {
        if (hash === receipt.files[name]) {
            continue;
        }
        if (!acceptSigningChange || target.platform !== "darwin" || !/^libs\/.*\.so$/.test(name)) {
            throw new Error("Native helper payload differs from its verified checksums: " + packageDirectory);
        }
        const suppliedPath = path.join(sourceRoot, "vendor", nativeRelativePath,
            targetDirectory(target), packageName, name);
        if (fileSha256(suppliedPath) !== receipt.files[name]) {
            throw new Error("Supplied native helper no longer matches its release pin.");
        }
        acceptSigningChange(suppliedPath, path.join(packageDirectory, name));
    }
    const description = fs.readFileSync(path.join(packageDirectory, "DESCRIPTION"), "utf8").replace(/\r\n/g, "\n");
    const built = description.match(/^Built:\s*R ([\d.]+);\s*([^;]+);/m);
    if (!built || built[1] !== target.runtimeVersion || built[2] !== target.runtimePlatform
        || !description.includes("Package: " + packageName + "\n")
        || !description.includes("Version: " + receipt.packageVersion + "\n")
        || !Object.keys(files).some(name => /^libs\/.*\.(so|dll)$/.test(name))) {
        throw new Error("Installed native helper identity does not match its pin: " + directory);
    }
    return receipt;
};

const readNativeHelperManifest = function(sourceRoot, artifactRoot, acceptSigningChange) {
    const manifestPath = path.join(artifactRoot, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
        throw new Error("Required prebuilt native helpers are missing: " + manifestPath
            + ". Include verified vendor/r-runtime/native artifacts; desktop builds do not compile a fallback.");
    }
    const manifest = readJson(manifestPath);
    if (manifest.format !== 1 || manifest.packageName !== packageName
        || manifest.packageVersion !== readPackageVersion(sourceRoot)
        || !Array.isArray(manifest.targets) || manifest.targets.length === 0) {
        throw new Error("Invalid or stale native helper release manifest: " + manifestPath);
    }
    const seen = new Set();
    for (const target of manifest.targets) {
        const directory = targetDirectory(target);
        if (seen.has(directory)) {
            throw new Error("Duplicate native helper release target: " + directory);
        }
        seen.add(directory);
        assertNativeHelperPayload(sourceRoot, artifactRoot, target, acceptSigningChange);
    }
    const expectedEntries = ["manifest.json", ...seen].sort();
    if (JSON.stringify(fs.readdirSync(artifactRoot).sort()) !== JSON.stringify(expectedEntries)) {
        throw new Error("Native library contains entries outside its release pins: " + artifactRoot);
    }
    return manifest;
};

const assertNativeRHelperArtifacts = function(sourceRoot, outputRoot, platform, arch, acceptSigningChange) {
    const artifactRoot = path.join(outputRoot, nativeRelativePath);
    const manifest = readNativeHelperManifest(sourceRoot, artifactRoot, acceptSigningChange);
    const supplied = readNativeHelperManifest(sourceRoot, path.join(sourceRoot, "vendor", nativeRelativePath));
    if (JSON.stringify(manifest) !== JSON.stringify(supplied)) {
        throw new Error("Staged native helper manifest differs from the supplied release pins.");
    }
    const selectedPlatform = platform === "macos" ? "darwin" : platform === "windows" ? "win32" : platform;
    if (selectedPlatform && (!arch || !manifest.targets.some(target => {
        return target.platform === selectedPlatform && target.arch === arch;
    }))) {
        throw new Error("No verified native helper for " + selectedPlatform + "/" + arch
            + ". Build and qualify that target before packaging; a different OS/architecture is not a fallback.");
    }
    return manifest;
};

const prepareNativeRHelperArtifacts = function(sourceRoot, outputRoot) {
    const suppliedRoot = path.join(sourceRoot, "vendor", nativeRelativePath);
    const manifest = readNativeHelperManifest(sourceRoot, suppliedRoot);
    const destination = path.join(outputRoot, nativeRelativePath);
    if (path.resolve(destination) === path.resolve(suppliedRoot)) {
        throw new Error("Generated helper output must not replace the supplied release artifacts.");
    }
    if (fs.existsSync(destination)) {
        try {
            const current = readNativeHelperManifest(sourceRoot, destination);
            if (JSON.stringify(current) === JSON.stringify(manifest)) {
                console.log("Using verified pinned native runtime helpers.");
                return manifest;
            }
        } catch (error) {
            if (error.code === "EACCES" || error.code === "EPERM") {
                throw error;
            }
            // An ignored cache cannot override the supplied release pins.
        }
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const staging = fs.mkdtempSync(path.join(path.dirname(destination), "native-stage-"));
    for (const target of manifest.targets) {
        const directory = targetDirectory(target);
        const source = path.join(suppliedRoot, directory);
        const packageDestination = path.join(staging, directory, packageName);
        fs.cpSync(path.join(source, packageName), packageDestination, { recursive: true });
        fs.copyFileSync(path.join(source, packageName + ".build.json"),
            path.join(staging, directory, packageName + ".build.json"));
    }
    fs.copyFileSync(path.join(suppliedRoot, "manifest.json"), path.join(staging, "manifest.json"));
    readNativeHelperManifest(sourceRoot, staging);
    // Do not retain unlisted cache entries in the shipped library: R's exact
    // platform/version lookup could otherwise load an old, unpinned package.
    let backup = "";
    if (fs.existsSync(destination)) {
        backup = fs.mkdtempSync(path.join(path.dirname(destination), "native-retired-"));
        fs.renameSync(destination, path.join(backup, "native"));
    }
    try {
        fs.renameSync(staging, destination);
    } catch (error) {
        if (backup) {
            fs.renameSync(path.join(backup, "native"), destination);
        }
        throw error;
    }
    assertNativeRHelperArtifacts(sourceRoot, outputRoot);
    console.log("Staged pinned native runtime helpers: " + manifest.targets.map(targetDirectory).join(", "));
    return manifest;
};

const importNativeRHelperArtifacts = function(sourceRoot, artifactRoot) {
    const incoming = readNativeHelperManifest(sourceRoot, artifactRoot);
    const suppliedRoot = path.join(sourceRoot, "vendor", nativeRelativePath);
    if (path.resolve(artifactRoot) === path.resolve(suppliedRoot)) {
        throw new Error("Import from a reviewed build artifact, not from the destination itself.");
    }
    const manifestPath = path.join(suppliedRoot, "manifest.json");
    const manifest = fs.existsSync(manifestPath) ? readNativeHelperManifest(sourceRoot, suppliedRoot)
        : { format: 1, packageName, packageVersion: readPackageVersion(sourceRoot), targets: [] };
    for (const target of incoming.targets) {
        const existing = manifest.targets.find(entry => targetDirectory(entry) === targetDirectory(target));
        if (existing && existing.receiptSha256 !== target.receiptSha256) {
            throw new Error("Import would replace an immutable native release pin: " + targetDirectory(target));
        }
    }
    fs.mkdirSync(suppliedRoot, { recursive: true });
    const staging = fs.mkdtempSync(path.join(sourceRoot, "vendor/r-runtime/native-import-"));
    const added = [];
    const previousManifest = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath) : null;
    try {
        for (const target of incoming.targets) {
            if (manifest.targets.some(entry => targetDirectory(entry) === targetDirectory(target))) {
                continue;
            }
            const directory = targetDirectory(target);
            fs.cpSync(path.join(artifactRoot, directory), path.join(staging, directory), { recursive: true });
            assertNativeHelperPayload(sourceRoot, staging, target);
            fs.renameSync(path.join(staging, directory), path.join(suppliedRoot, directory));
            added.push(directory);
            manifest.targets.push(target);
        }
        manifest.targets.sort((left, right) => targetDirectory(left).localeCompare(targetDirectory(right)));
        fs.writeFileSync(path.join(staging, "manifest.json"), JSON.stringify(manifest, null, 4) + "\n");
        fs.renameSync(path.join(staging, "manifest.json"), manifestPath);
        readNativeHelperManifest(sourceRoot, suppliedRoot);
    } catch (error) {
        for (const directory of added) {
            fs.renameSync(path.join(suppliedRoot, directory), path.join(staging, directory));
        }
        if (previousManifest) {
            fs.writeFileSync(manifestPath, previousManifest);
        } else if (fs.existsSync(manifestPath)) {
            fs.renameSync(manifestPath, path.join(staging, "failed-manifest.json"));
        }
        throw error;
    }
    // Keep failed imports recoverable; successful empty staging needs no backup.
    fs.rmdirSync(staging);
    console.log("Imported reviewed pinned native helper targets: " + added.join(", "));
};

const bundleNativeRHelperArtifacts = function(sourceRoot, reportPath, bundleRoot = path.join(sourceRoot, "vendor")) {
    const report = readJson(reportPath);
    if (report.status !== "passed" || report.error || !report.declaredBranchesAvailable
        || !Array.isArray(report.builds) || !Array.isArray(report.results)
        || report.builds.length === 0 || report.results.length === 0
        || [...report.builds, ...report.results].some(entry => entry.status !== "passed" || entry.exitCode !== 0)) {
        throw new Error("Only a fully passed native ABI report with declared coverage can qualify a helper.");
    }
    const requiredCases = fs.readdirSync(path.join(sourceRoot, "scripts"))
        .filter(name => /^check-.*\.R$/.test(name));
    for (const name of [...requiredCases, "check-runtime-startup-compilation-cached"]) {
        if (!report.results.some(entry => entry.name === name && entry.status === "passed")) {
            throw new Error("Native acceptance report is missing a required case: " + name);
        }
    }
    const requiredFiles = listArtifactFiles(path.join(sourceRoot, sourceRelativePath))
        .filter(function(file) {
            const relative = path.relative(path.join(sourceRoot, sourceRelativePath), file).split(path.sep).join("/");
            // These are the implementation files built and fingerprinted by
            // the ABI runner. Package-only R CMD check tests are a separate suite.
            return /^(src\/.*\.(c|h)|R\/.*\.R|DESCRIPTION|NAMESPACE|tests\/altrepprobe\.c)$/.test(relative);
        })
        .concat(listArtifactFiles(path.join(sourceRoot, "src/runtime/providers/r/r-sources"))
            .filter(file => file.endsWith(".R")))
        .map(file => path.relative(sourceRoot, file).split(path.sep).join("/"))
        .concat(requiredCases.map(name => "scripts/" + name), ["scripts/check-native-r-platform.js"]);
    const fingerprints = Object.fromEntries(Object.entries(report.fingerprints || {})
        .map(([name, hash]) => [name.replace(/\\/g, "/"), hash]));
    for (const relativePath of requiredFiles) {
        if (fingerprints[relativePath] !== fileSha256(path.join(sourceRoot, relativePath))) {
            throw new Error("Native acceptance does not cover the current source: " + relativePath);
        }
    }
    const installed = path.join(path.dirname(reportPath), "library", packageName);
    const files = readArtifactFileHashes(installed);
    if (JSON.stringify(report.helperFiles) !== JSON.stringify(files)) {
        throw new Error("Tested native helper files changed or the report lacks payload fingerprints; rerun native acceptance.");
    }
    const description = fs.readFileSync(path.join(installed, "DESCRIPTION"), "utf8");
    const built = description.match(/^Built:\s*R ([\d.]+);\s*([^;]+);/m);
    if (!built || !String(report.identity).includes(built[1]) || !String(report.identity).includes(built[2])) {
        throw new Error("Native report and tested library identities do not match.");
    }
    const target = {
        platform: /apple-darwin/.test(built[2]) ? "darwin" : /mingw/.test(built[2]) ? "win32" : "linux",
        arch: /^(aarch64|arm64)-/.test(built[2]) ? "arm64" : "x64",
        runtimePlatform: built[2], runtimeVersion: built[1]
    };
    const directory = targetDirectory(target);
    const receipt = {
        format: 1, packageName, packageVersion: readPackageVersion(sourceRoot), ...target,
        sourceSha256: readSourceSha256(sourceRoot), files,
        acceptance: {
            status: "passed", scope: "canonical-native-abi-with-declared",
            payloadHashTiming: "before-and-after-native-acceptance",
            completedAt: report.finishedAt, reportSha256: fileSha256(reportPath),
            cases: report.results.map(entry => entry.name)
        }
    };
    const suppliedRoot = path.join(bundleRoot, nativeRelativePath);
    const targetRoot = path.join(suppliedRoot, directory);
    const receiptPath = path.join(targetRoot, packageName + ".build.json");
    // Refuse overwrite: a release pin is immutable. Source/version changes need
    // an explicit retirement of the old artifacts, not a silent re-certification.
    if (fs.existsSync(targetRoot)) {
        throw new Error("Native release target already exists; retain its pin or explicitly retire it: " + targetRoot);
    }
    fs.mkdirSync(targetRoot, { recursive: true });
    fs.cpSync(installed, path.join(targetRoot, packageName), { recursive: true });
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 4) + "\n");
    target.receiptSha256 = fileSha256(receiptPath);
    assertNativeHelperPayload(sourceRoot, suppliedRoot, target);
    const manifestPath = path.join(suppliedRoot, "manifest.json");
    const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath)
        : { format: 1, packageName, packageVersion: receipt.packageVersion, targets: [] };
    if (manifest.packageVersion !== receipt.packageVersion) {
        throw new Error("Retire the previous package-version manifest before adding a new release.");
    }
    manifest.targets.push(target);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4) + "\n");
    readNativeHelperManifest(sourceRoot, suppliedRoot);
    console.log("Bundled previously qualified native helper: " + directory);
};

module.exports = {
    prepareNativeRHelperArtifacts, assertNativeRHelperArtifacts,
    bundleNativeRHelperArtifacts, importNativeRHelperArtifacts,
    readNativeHelperManifest
};

if (require.main === module) {
    const sourceRoot = path.resolve(process.env.DIALOGFORGE_SOURCE_ROOT || path.join(__dirname, ".."));
    if (process.argv[2] === "--prepare") {
        prepareNativeRHelperArtifacts(sourceRoot,
            path.resolve(process.env.DIALOGFORGE_DIST_DIR || path.join(sourceRoot, "dist")));
    } else if (process.argv[2] === "--bundle" && process.argv[3]) {
        bundleNativeRHelperArtifacts(sourceRoot, path.resolve(process.argv[3]));
    } else if (process.argv[2] === "--import" && process.argv[3]) {
        importNativeRHelperArtifacts(sourceRoot, path.resolve(process.argv[3]));
    } else {
        throw new Error("Use --prepare, --bundle <passed-native-ABI-results.json>, or --import <reviewed-native-artifact-directory>.");
    }
}
