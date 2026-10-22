"use strict";

// Exercise the distributable, not merely electron-builder's unpacked staging
// directory. Every extraction/installation is confined to a disposable path.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const asar = require("@electron/asar");
const yaml = require("js-yaml");

const root = path.resolve(__dirname, "../..");
const productPath = path.resolve(process.argv[2]);
const outputDir = path.resolve(process.argv[3]);
const product = JSON.parse(fs.readFileSync(path.join(productPath, "package.json"), "utf8"));
const name = product.product.name;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-installer-"));
const receipt = { platform: process.platform, arch: process.arch, version: product.version, files: {} };
const run = function(command, args, options = {}) {
    return execFileSync(command, args, {
        encoding: "utf8",
        timeout: 600000,
        stdio: ["ignore", "pipe", "pipe"],
        ...options
    });
};
const digest = function(file, algorithm, encoding) {
    return crypto.createHash(algorithm).update(fs.readFileSync(file)).digest(encoding);
};

try {
    const channel = process.platform === "darwin" ? `latest-${process.arch}-mac.yml`
        : process.platform === "win32" ? "latest.yml" : "latest-linux.yml";
    const metadata = yaml.load(fs.readFileSync(path.join(outputDir, channel), "utf8"));
    assert.equal(metadata.version, product.version);
    assert.ok(metadata.files.length > 0);
    for (const file of metadata.files) {
        assert.equal(path.basename(file.url), file.url, "Updater asset must be a local filename");
        const artifact = path.join(outputDir, file.url);
        assert.equal(digest(artifact, "sha512", "base64"), file.sha512);
        assert.equal(fs.statSync(artifact).size, file.size);
        receipt.files[file.url] = digest(artifact, "sha256", "hex");
    }
    let resources;
    if (process.platform === "darwin") {
        const dmg = path.join(outputDir, `${name}_${process.arch === "arm64" ? "silicon" : "intel"}.dmg`);
        const mount = path.join(temporary, "volume");
        const destination = path.join(temporary, "mac", `${name}.app`);
        run("hdiutil", ["attach", dmg, "-readonly", "-nobrowse", "-mountpoint", mount]);
        try {
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            run("ditto", [path.join(mount, `${name}.app`), destination]);
        }
        finally {
            run("hdiutil", ["detach", mount]);
        }
        run("codesign", ["--verify", "--deep", "--strict", destination]);
        resources = path.join(destination, "Contents", "Resources");
        receipt.files[path.basename(dmg)] = digest(dmg, "sha256", "hex");
    }
    else if (process.platform === "win32") {
        const installer = path.join(outputDir, `${name}_setup_intel.exe`);
        const destination = path.join(temporary, "win-unpacked");
        run(installer, ["/S", `/D=${destination}`]);
        assert.ok(fs.existsSync(path.join(destination, `${name}.exe`)));
        resources = path.join(destination, "resources");
        receipt.files[path.basename(installer)] = digest(installer, "sha256", "hex");
    }
    else {
        const appImage = path.join(outputDir, `${name}_intel.AppImage`);
        fs.chmodSync(appImage, 0o755);
        run(appImage, ["--appimage-extract"], { cwd: temporary, maxBuffer: 16 * 1024 * 1024 });
        fs.renameSync(path.join(temporary, "squashfs-root"), path.join(temporary, "linux-unpacked"));
        resources = path.join(temporary, "linux-unpacked", "resources");
    }
    const manifest = JSON.parse(asar.extractFile(path.join(resources, "app.asar"), "package.json"));
    assert.equal(manifest.version, product.version);
    assert.equal(manifest.dependencies["@number0/iroh"], "1.1.0");
    const installedFeed = yaml.load(fs.readFileSync(path.join(resources, "app-update.yml"), "utf8"));
    assert.equal(installedFeed.provider, "generic");
    assert.equal(installedFeed.url, "https://github.com/RODA/DialogR/releases/download/latest");
    if (process.platform === "darwin") {
        assert.equal(installedFeed.channel, `latest-${process.arch}`);
    }
    process.stdout.write(run(process.execPath, [
        path.join(root, "scripts/verify-production-electron.js"),
        "--product-path", productPath,
        "--output-dir", temporary
    ], { timeout: 900000, maxBuffer: 16 * 1024 * 1024 }));
    receipt.installedApplicationChecks = "all-six-passed";
    fs.writeFileSync(path.join(outputDir, "installer-acceptance.json"), JSON.stringify(receipt, null, 4) + "\n");
    console.log(JSON.stringify(receipt, null, 4));
}
finally {
    if (process.platform === "win32") {
        const uninstaller = path.join(temporary, "win-unpacked", `Uninstall ${name}.exe`);
        if (fs.existsSync(uninstaller)) {
            run(uninstaller, ["/S", `/D=${path.dirname(uninstaller)}`]);
        }
    }
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
}
