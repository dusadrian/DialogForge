"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const { DownloadedUpdateHelper } = require("electron-updater/out/DownloadedUpdateHelper");
const asar = require("@electron/asar");

const root = path.resolve(__dirname, "..");


const checkInstalledDependencies = function() {
    const lock = require("../package-lock.json");

    for (const [name, dependency] of Object.entries(lock.packages)) {
        assert.ok(!dependency.deprecated, `${name}: ${dependency.deprecated}`);
    }

    // Verify the archives used by npm match their reviewable adapter sources.
    for (const [dependency, source] of [
        ["lodash.isequal", "lodash-isequal"],
        ["rimraf", "temp-cleanup"]
    ]) {
        for (const file of ["index.js", "package.json", "LICENSE"]) {
            assert.equal(
                fs.readFileSync(path.join(root, "node_modules", dependency, file), "utf8"),
                fs.readFileSync(path.join(root, "vendor", source, file), "utf8"),
                `${dependency}/${file} must match its packed source.`
            );
        }
    }

    const requireUpdater = createRequire(require.resolve("electron-updater"));
    assert.equal(requireUpdater("lodash.isequal"), require("lodash/isEqual"));
};


const checkUpdaterCache = async function(directory) {
    const updateFile = path.join(directory, "update.zip");
    fs.writeFileSync(updateFile, "downloaded update");
    const helper = new DownloadedUpdateHelper(directory);
    const updateInfo = {
        version: "1.2.3",
        files: [{ url: "update.zip", sha512: "checksum", size: 17 }],
        releaseNotes: [{ version: "1.2.3", note: "A release" }]
    };
    const fileInfo = { info: updateInfo.files[0] };
    const logger = { info() {}, warn() {} };
    await helper.setDownloadedFile(updateFile, null, updateInfo, fileInfo, "update.zip", false);

    const validate = (version, file) => {
        return helper.validateDownloadedPath(updateFile, version, file, logger);
    };
    assert.equal(await validate(structuredClone(updateInfo), structuredClone(fileInfo)), updateFile);
    assert.equal(await validate({ ...updateInfo, version: "1.2.4" }, fileInfo), null);
    assert.equal(await validate({ ...updateInfo, releaseNotes: [] }, fileInfo), null);
    assert.equal(await validate(updateInfo, { info: { ...fileInfo.info, sha512: "changed" } }), null);
    fs.unlinkSync(updateFile);
    assert.equal(await validate(updateInfo, fileInfo), null);
};


const checkInstallerCleanup = async function(directory) {
    const requireInstaller = createRequire(require.resolve("electron-winstaller"));
    const temp = requireInstaller("temp").track();

    const createTrackedPaths = function() {
        const folder = temp.mkdirSync({ dir: directory, prefix: "installer [files]-" });
        fs.mkdirSync(path.join(folder, "nested"));
        fs.writeFileSync(path.join(folder, "nested", "file.txt"), "temporary data");
        const file = temp.openSync({ dir: directory, prefix: "installer-" });
        fs.closeSync(file.fd);
        // A removed tracked path must not make later cleanup fail.
        fs.unlinkSync(file.path);
        return folder;
    };

    for (const mode of ["sync", "callback", "promise"]) {
        const folder = createTrackedPaths();
        let counts;

        if (mode === "sync") {
            counts = temp.cleanupSync();
        }
        else if (mode === "callback") {
            counts = await new Promise((resolve, reject) => {
                temp.cleanup((error, result) => error ? reject(error) : resolve(result));
            });
        }
        else {
            counts = await temp.cleanup();
        }

        assert.deepEqual(counts, { files: 1, dirs: 1 }, mode);
        assert.equal(fs.existsSync(folder), false, mode);
    }

    const child = spawnSync(process.execPath, ["-e", [
        'const temp = require(process.argv[1]).track();',
        'console.log(temp.mkdirSync({ dir: process.argv[2] }));'
    ].join("\n"), requireInstaller.resolve("temp"), directory], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(fs.existsSync(child.stdout.trim()), false, "Process-exit cleanup");
};


const checkArchiveContents = async function(directory) {
    const source = path.join(directory, "archive-source");
    const output = path.join(directory, "contents.asar");
    fs.mkdirSync(path.join(source, "native"), { recursive: true });
    fs.writeFileSync(path.join(source, ".settings.json"), "{}");
    fs.writeFileSync(path.join(source, "native", "helper.node"), "native payload");
    fs.writeFileSync(path.join(source, "omit.map"), "excluded");
    await asar.createPackageWithOptions(source, output, {
        globOptions: { ignore: "**/*.map" },
        unpack: "**/*.node"
    });

    assert.equal(asar.extractFile(output, ".settings.json").toString(), "{}");
    assert.equal(asar.statFile(output, "native/helper.node").unpacked, true);
    assert.equal(fs.readFileSync(`${output}.unpacked/native/helper.node`, "utf8"), "native payload");
    assert.ok(!asar.listPackage(output).some((file) => file.endsWith("omit.map")));
};


const main = async function() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "packaging-dependencies-"));

    try {
        checkInstalledDependencies();
        await checkUpdaterCache(directory);
        await checkInstallerCleanup(directory);
        await checkArchiveContents(directory);
        console.log("Dependency metadata, updater cache, installer cleanup and ASAR contents passed.");
    }
    finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
