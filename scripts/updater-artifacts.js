"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const yaml = require("js-yaml");
const { buildBlockMap } = require("app-builder-lib/out/targets/blockmap/blockmap");


const writeUpdaterBlockmap = async function(artifactPath, blockmapPath) {
    if (!blockmapPath) {
        throw new Error("An output path is required for an external updater blockmap.");
    }

    // Use the same external gzip blockmap writer as the pinned packager.
    return buildBlockMap(artifactPath, "gzip", blockmapPath);
};


const rebuildMacUpdaterZip = async function(appPath, channelPath) {
    const outputDir = path.dirname(channelPath);
    const latest = yaml.load(fs.readFileSync(channelPath, "utf8")) || {};
    const files = Array.isArray(latest.files) ? latest.files : [];
    const zipEntry = files.find((entry) => {
        return /\.zip$/i.test(String((entry || {}).url || ""));
    });

    if (!zipEntry) {
        throw new Error(`No updater ZIP is listed in ${channelPath}.`);
    }

    const zipPath = path.join(outputDir, String(zipEntry.url));
    const blockmapPath = `${zipPath}.blockmap`;
    const temporaryZipPath = `${zipPath}.stapled`;
    const temporaryBlockmapPath = `${blockmapPath}.stapled`;
    const temporaryChannelPath = `${channelPath}.stapled`;

    console.log(`Rebuilding ${path.basename(zipPath)} from the stapled application.`);

    try {
        fs.rmSync(temporaryZipPath, { force: true });
        fs.rmSync(temporaryBlockmapPath, { force: true });
        fs.rmSync(temporaryChannelPath, { force: true });

        const result = spawnSync("ditto", [
            "-c",
            "-k",
            "--sequesterRsrc",
            "--keepParent",
            appPath,
            temporaryZipPath
        ], {
            stdio: "inherit"
        });

        if (result.error) {
            throw result.error;
        }
        if (result.status !== 0) {
            throw new Error(`ditto failed with exit code ${String(result.status)}.`);
        }

        const updateInfo = await writeUpdaterBlockmap(
            temporaryZipPath,
            temporaryBlockmapPath
        );

        zipEntry.size = updateInfo.size;
        zipEntry.sha512 = updateInfo.sha512;
        latest.files = [zipEntry];
        latest.path = String(zipEntry.url);
        latest.sha512 = updateInfo.sha512;
        fs.writeFileSync(temporaryChannelPath, yaml.dump(latest, {
            lineWidth: -1,
            noRefs: true
        }));

        fs.renameSync(temporaryZipPath, zipPath);
        fs.renameSync(temporaryBlockmapPath, blockmapPath);
        fs.renameSync(temporaryChannelPath, channelPath);
    } finally {
        fs.rmSync(temporaryZipPath, { force: true });
        fs.rmSync(temporaryBlockmapPath, { force: true });
        fs.rmSync(temporaryChannelPath, { force: true });
    }
};


module.exports = { writeUpdaterBlockmap, rebuildMacUpdaterZip };
