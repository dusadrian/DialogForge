"use strict";

// Maintainer release transport only. Qualification and payload validation stay
// in the canonical native runner and shared artifact reader.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { readNativeHelperManifest } = require("./native-r-helper-artifacts");
const { fileSha256, readHelperPackageVersion } = require("./r-helper-artifact-files");

const sourceRoot = path.resolve(__dirname, "..");
const packageName = "dialogforgeruntime";
const packageVersion = readHelperPackageVersion(sourceRoot, packageName);
const gh = function(arguments_) {
    return execFileSync("gh", arguments_, { encoding: "utf8" }).trim();
};

const packQualifiedHelper = function(bundleRoot, outputRoot) {
    const manifest = readNativeHelperManifest(sourceRoot, path.join(bundleRoot, "r-runtime/native"));
    if (manifest.targets.length !== 1) {
        throw new Error("Each release archive must contain exactly one qualified native target.");
    }
    const target = manifest.targets[0];
    const receipt = JSON.parse(fs.readFileSync(path.join(bundleRoot, "r-runtime/native",
        target.runtimePlatform + "-" + target.runtimeVersion, packageName + ".build.json"), "utf8"));
    if (fileSha256(path.join(bundleRoot, "native-acceptance.json")) !== receipt.acceptance.reportSha256) {
        throw new Error("The release archive must retain the exact qualification report named in its receipt.");
    }
    const name = packageName + "_" + packageVersion + "-native-"
        + target.runtimePlatform + "-" + target.runtimeVersion + ".tar.gz";
    fs.mkdirSync(outputRoot, { recursive: true });
    const destination = path.join(outputRoot, name);
    if (fs.existsSync(destination)) {
        throw new Error("Refusing to replace an existing release archive: " + destination);
    }
    execFileSync("tar", ["-czf", destination, "-C", bundleRoot,
        "r-runtime/native", "native-acceptance.json"], { stdio: "inherit" });
    const metadata = {
        format: 1, packageName, packageVersion,
        sourceCommit: process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        archive: name, archiveSha256: fileSha256(destination), target,
        sourceSha256: receipt.sourceSha256,
        qualificationRun: process.env.GITHUB_RUN_ID ? "https://github.com/"
            + process.env.GITHUB_REPOSITORY + "/actions/runs/" + process.env.GITHUB_RUN_ID : null
    };
    fs.writeFileSync(destination + ".json", JSON.stringify(metadata, null, 4) + "\n", { flag: "wx" });
    console.log("Packed qualified helper: " + name);
};

const uploadQualifiedHelpers = function(artifactRoot, tag, expectedTargets) {
    const repository = process.env.GITHUB_REPOSITORY;
    const commit = process.env.GITHUB_SHA;
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository || "") || !/^[a-f0-9]{40}$/.test(commit || "")
        || !/^r-runtime-helpers-[a-zA-Z0-9_.-]+$/.test(tag || "")
        || !Number.isInteger(expectedTargets) || expectedTargets < 1) {
        throw new Error("Supply a pinned GitHub commit, helper release tag and expected target count.");
    }
    const release = JSON.parse(gh(["release", "view", tag, "--repo", repository,
        "--json", "isDraft,isPrerelease,assets"]));
    // Licensing approval and final target review precede public publication.
    if (!release.isDraft || !release.isPrerelease) {
        throw new Error("Upload requires the explicitly created draft pre-release; public releases are immutable.");
    }
    const taggedCommit = gh(["api", "repos/" + repository + "/commits/" + tag, "--jq", ".sha"]);
    if (taggedCommit !== commit) {
        throw new Error("The helper release tag does not point to this qualified source commit.");
    }
    const metadataFiles = fs.readdirSync(artifactRoot).filter(name => name.endsWith(".tar.gz.json")).sort();
    if (metadataFiles.length !== expectedTargets) {
        throw new Error("The complete requested native target matrix must pass before release upload.");
    }
    const entries = [];
    const assets = [];
    const seen = new Set();
    for (const name of metadataFiles) {
        const entry = JSON.parse(fs.readFileSync(path.join(artifactRoot, name), "utf8"));
        const archiveName = name.slice(0, -5);
        if (entry.format !== 1 || entry.packageName !== packageName || entry.packageVersion !== packageVersion
            || entry.sourceCommit !== commit || entry.archive !== archiveName
            || !/^[a-f0-9]{64}$/.test(entry.sourceSha256 || "")
            || entry.archiveSha256 !== fileSha256(path.join(artifactRoot, archiveName))) {
            throw new Error("Downloaded build artifact does not match its qualified release identity: " + name);
        }
        const key = entry.target.runtimePlatform + "-" + entry.target.runtimeVersion;
        if (seen.has(key)) {
            throw new Error("Duplicate release target: " + key);
        }
        seen.add(key);
        entries.push(entry);
        assets.push(archiveName, name);
    }
    if (new Set(entries.map(entry => entry.sourceSha256)).size !== 1) {
        throw new Error("All native targets must have been built from the same canonical helper files.");
    }
    const sourceArchive = packageName + "_" + packageVersion + "-source.tar.gz";
    execFileSync("git", ["archive", "--format=tar.gz", "--output=" + path.join(artifactRoot, sourceArchive),
        commit, "src/runtime/providers/r/native/dialogforgeruntime"], { stdio: "inherit" });
    assets.push(sourceArchive);
    const releaseManifest = {
        format: 1, packageName, packageVersion, sourceCommit: commit,
        qualification: "canonical-native-abi-with-declared; not full application release acceptance",
        targets: entries, sourceArchive, sourceArchiveSha256: fileSha256(path.join(artifactRoot, sourceArchive))
    };
    fs.writeFileSync(path.join(artifactRoot, "RELEASE-MANIFEST.json"), JSON.stringify(releaseManifest, null, 4) + "\n");
    assets.push("RELEASE-MANIFEST.json");
    fs.writeFileSync(path.join(artifactRoot, "SHA256SUMS"), assets.map(name => {
        return fileSha256(path.join(artifactRoot, name)) + "  " + name;
    }).join("\n") + "\n");
    assets.push("SHA256SUMS");

    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-release-"));
    try {
        // Check every existing name before any upload. Never use --clobber:
        // retries may reuse identical bytes, but may not silently change a pin.
        for (const name of assets) {
            if (release.assets.some(asset => asset.name === name)) {
                gh(["release", "download", tag, "--repo", repository, "--pattern", name, "--dir", temporary]);
                if (fileSha256(path.join(temporary, name)) !== fileSha256(path.join(artifactRoot, name))) {
                    throw new Error("Existing release asset has different immutable bytes: " + name);
                }
            }
        }
        for (const name of assets) {
            if (!release.assets.some(asset => asset.name === name)) {
                gh(["release", "upload", tag, path.join(artifactRoot, name), "--repo", repository]);
            }
        }
    } finally {
        for (const name of fs.readdirSync(temporary)) {
            fs.unlinkSync(path.join(temporary, name));
        }
        fs.rmdirSync(temporary);
    }
    console.log("Uploaded complete qualified matrix to draft pre-release: " + tag);
};

if (process.argv[2] === "--pack" && process.argv[3] && process.argv[4]) {
    packQualifiedHelper(path.resolve(process.argv[3]), path.resolve(process.argv[4]));
} else if (process.argv[2] === "--upload" && process.argv[3] && process.argv[4]) {
    uploadQualifiedHelpers(path.resolve(process.argv[3]), process.argv[4], Number(process.argv[5]));
} else {
    throw new Error("Use --pack <qualified-bundle-root> <archive-root> or --upload <archive-root> <tag> <target-count>.");
}
