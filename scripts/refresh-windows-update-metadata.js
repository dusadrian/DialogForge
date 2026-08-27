"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const yaml = require("js-yaml");
const { appBuilderPath } = require("app-builder-bin");

const projectRoot = path.resolve(__dirname, "..");

const parseArgs = function() {
    let outputDir = "";

    for (let index = 2; index < process.argv.length; index += 1) {
        const current = process.argv[index];
        const next = process.argv[index + 1];

        if (current === "--output-dir" && next) {
            outputDir = next;
            index += 1;
        }
        else {
            throw new Error(`Unknown metadata refresh argument: ${current}`);
        }
    }

    if (!outputDir) {
        throw new Error("Missing required --output-dir argument.");
    }

    return {
        outputDir: path.resolve(projectRoot, outputDir)
    };
};

const sha512Base64 = function(filePath) {
    const hash = crypto.createHash("sha512");
    hash.update(fs.readFileSync(filePath));
    return hash.digest("base64");
};

const runAppBuilder = function(args) {
    const result = spawnSync(appBuilderPath, args, {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: "pipe"
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        const output = [result.stdout, result.stderr]
            .filter(Boolean)
            .join("\n")
            .trim();

        throw new Error(
            `app-builder failed while refreshing Windows update metadata.\n${output}`
        );
    }
};

const readLatestInfo = function(latestPath) {
    if (!fs.existsSync(latestPath)) {
        throw new Error(`Windows update metadata not found: ${latestPath}`);
    }

    const latestInfo = yaml.load(fs.readFileSync(latestPath, "utf8"));
    if (!latestInfo || typeof latestInfo !== "object") {
        throw new Error(`Invalid Windows update metadata: ${latestPath}`);
    }

    return latestInfo;
};

const resolveInstallerPath = function(outputDir, latestInfo) {
    const installerName = String(latestInfo.path || "").trim();
    if (!installerName) {
        throw new Error("latest.yml does not contain a top-level updater path.");
    }

    const installerPath = path.resolve(outputDir, installerName);
    const relativePath = path.relative(outputDir, installerPath);
    if (
        relativePath.startsWith(`..${path.sep}`) ||
        relativePath === ".." ||
        path.isAbsolute(relativePath)
    ) {
        throw new Error(`Windows updater installer is outside the output directory: ${installerName}`);
    }
    if (!fs.existsSync(installerPath)) {
        throw new Error(`Windows updater installer not found: ${installerPath}`);
    }

    return installerPath;
};

const refreshBlockmap = function(installerPath) {
    const blockmapPath = `${installerPath}.blockmap`;

    runAppBuilder([
        "blockmap",
        "--input",
        installerPath,
        "--output",
        blockmapPath
    ]);

    if (!fs.existsSync(blockmapPath)) {
        throw new Error(`Windows updater blockmap was not created: ${blockmapPath}`);
    }
};

const updateLatestInfo = function(latestPath, latestInfo, installerPath) {
    const installerName = path.basename(installerPath);
    const installerSize = fs.statSync(installerPath).size;
    const installerSha512 = sha512Base64(installerPath);

    latestInfo.path = installerName;
    latestInfo.sha512 = installerSha512;

    if (!Array.isArray(latestInfo.files)) {
        throw new Error("latest.yml does not contain an updater files list.");
    }

    const matchingFiles = latestInfo.files.filter((fileInfo) => {
        if (!fileInfo || typeof fileInfo !== "object") {
            return false;
        }

        const entryPath = String(fileInfo.url || fileInfo.path || "").trim();
        return path.basename(entryPath) === installerName;
    });
    if (matchingFiles.length !== 1) {
        throw new Error(
            `latest.yml must contain exactly one entry for ${installerName}; found ${matchingFiles.length}.`
        );
    }

    const fileInfo = matchingFiles[0];
    fileInfo.sha512 = installerSha512;
    fileInfo.size = installerSize;

    fs.writeFileSync(latestPath, yaml.dump(latestInfo, {
        lineWidth: 120,
        noRefs: true
    }));
};

const main = function() {
    const selection = parseArgs();
    const latestPath = path.join(selection.outputDir, "latest.yml");
    const latestInfo = readLatestInfo(latestPath);
    const installerPath = resolveInstallerPath(selection.outputDir, latestInfo);

    refreshBlockmap(installerPath);
    updateLatestInfo(latestPath, latestInfo, installerPath);

    console.log(
        `Refreshed Windows updater metadata for ${path.basename(installerPath)}.`
    );
};

main();
