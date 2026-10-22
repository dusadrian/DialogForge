"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { _electron } = require("playwright");
const asar = require("@electron/asar");
const { findMainWindowPage } = require("../electron/product-launch");

const output = path.resolve(process.argv[2]);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-rollback-"));
const userData = path.join(temporary, "profile");
const installed = path.join(temporary, "installed");
const previousAssets = {
    darwin: ["DialogR-1.0.26-x64-mac.zip", "1034e7f59138ca176dcaf34bdcdee28ab5c3ffb3c57c40ef2d0d8c024f7c147b"],
    linux: ["DialogR_intel.AppImage", "65999b382aac06aac41a75074dd8d8c5613aaf96d1a8773bf4f69afe1e6b0883"],
    win32: ["DialogR_setup_intel.exe", "caef7428677d5ed3ec15fbd33b6388c03de5a065950f6c5a8f50f342e3f0f8ab"]
};
const [previousName, previousHash] = previousAssets[process.platform];
const previous = path.join(temporary, previousName);
const record = { platform: process.platform, arch: process.arch, previousHash, phases: [], scope: "installer replacement and manual rollback, not automatic updater UI" };
const run = function(command, args, options = {}) {
    return execFileSync(command, args, { timeout: 600000, maxBuffer: 32 * 1024 * 1024, ...options });
};

const install = function(artifact) {
    if (process.platform === "win32") {
        run(artifact, ["/S", `/D=${installed}`]);
        return { executable: path.join(installed, "DialogR.exe"), resources: path.join(installed, "resources") };
    }
    fs.rmSync(installed, {recursive: true, force: true});
    fs.mkdirSync(installed, {recursive: true});
    if (process.platform === "darwin") {
        run("ditto", ["-x", "-k", artifact, installed]);
        const application = path.join(installed, "DialogR.app");
        run("codesign", ["--verify", "--deep", "--strict", application]);
        return { executable: path.join(application, "Contents/MacOS/DialogR"), resources: path.join(application, "Contents/Resources") };
    }
    fs.chmodSync(artifact, 0o755);
    run(artifact, ["--appimage-extract"], {cwd: installed});
    return {
        executable: path.join(installed, "squashfs-root/dialogr"),
        resources: path.join(installed, "squashfs-root/resources")
    };
};

const preservedFiles = {
    "research.R": "# țară\nx <- c(1, NA, 3)\n",
    "research.csv": "id,value\n1,3.14\n2,\n"
};

const acceptInstalled = async function(artifact, version, phase) {
    const application = install(artifact);
    asar.uncacheAll();
    const manifest = JSON.parse(asar.extractFile(path.join(application.resources, "app.asar"), "package.json"));
    assert.equal(manifest.version, version);
    const app = await _electron.launch({
        executablePath: application.executable,
        args: process.platform === "linux" ? ["--no-sandbox"]
            : process.platform === "win32" ? ["--disable-gpu"] : [],
        cwd: installed,
        env: {...process.env, DIALOGFORGE_TEST_USER_DATA_PATH: userData},
        timeout: 60000
    });
    const child = app.process();
    let page;
    let processOutput = "";
    child.stdout?.on("data", chunk => { processOutput += chunk.toString(); });
    child.stderr?.on("data", chunk => { processOutput += chunk.toString(); });
    try {
        const identity = await app.evaluate(({app}) => ({
            version: app.getVersion(), profile: app.getPath("userData"),
            electron: process.versions.electron
        }));
        assert.equal(identity.version, version);
        assert.equal(identity.profile, userData);
        page = await findMainWindowPage(app);
        const settings = await page.evaluate(() => window.dialogForge.readSettings());
        assert.equal(settings.showAttributesColumn, true);
        assert.equal(settings.terminalSettings.cursorBlink, false);
        const runtime = await page.evaluate(() => window.dialogForge.startRuntime());
        for (const [name, content] of Object.entries(preservedFiles)) {
            assert.equal(fs.readFileSync(path.join(userData, name), "utf8"), content);
        }
        await page.screenshot({path: path.join(output, `${phase}.png`)});
        record.phases.push({
            phase, version, electron: identity.electron, runtime: runtime.status,
            runtimeMessage: runtime.message, settingsConsumed: true,
            preservedFiles: Object.keys(preservedFiles)
        });
        assert.equal(runtime.status, "ready", JSON.stringify(runtime));
    }
    finally {
        if (child.exitCode === null) {
            await app.close();
        }
        fs.writeFileSync(path.join(output, `${phase}.log`), processOutput);
    }
};

const main = async function() {
    try {
        const response = await fetch(`https://github.com/RODA/DialogR/releases/download/latest/${previousName}`);
        assert.ok(response.ok, `Previous artifact download: ${response.status}`);
        fs.writeFileSync(previous, Buffer.from(await response.arrayBuffer()));
        const actualHash = crypto.createHash("sha256").update(fs.readFileSync(previous)).digest("hex");
        assert.equal(actualHash, previousHash, "Previous release changed; review its pin before retesting");
        fs.mkdirSync(userData, {recursive: true});
        fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify({
            notifyUpdates: false, showAttributesColumn: true,
            terminalSettings: {cursorBlink: false, cursorStyle: "bar", inputMode: "console"}
        }));
        for (const [name, content] of Object.entries(preservedFiles)) {
            fs.writeFileSync(path.join(userData, name), content);
        }
        const candidate = path.join(output, process.platform === "darwin" ? "DialogR-1.0.27-x64-mac.zip" : previousName);
        const failures = [];
        for (const [artifact, version, phase] of [
            [previous, "1.0.26", "before-upgrade"],
            [candidate, "1.0.27", "after-upgrade"],
            [previous, "1.0.26", "after-rollback"]
        ]) {
            try {
                await acceptInstalled(artifact, version, phase);
            }
            catch (error) {
                failures.push({phase, error: error.stack});
            }
        }
        record.failures = failures;
        assert.equal(failures.length, 0, JSON.stringify(failures));
        record.result = "passed";
    }
    catch (error) {
        record.result = "failed";
        record.error = error.stack;
        throw error;
    }
    finally {
        fs.writeFileSync(path.join(output, "upgrade-rollback-acceptance.json"), JSON.stringify(record, null, 4));
        if (process.platform === "win32") {
            const uninstaller = path.join(installed, "Uninstall DialogR.exe");
            if (fs.existsSync(uninstaller)) {
                run(uninstaller, ["/S"]);
            }
        }
        fs.rmSync(temporary, {recursive: true, force: true, maxRetries: 20, retryDelay: 500});
    }
};

main().catch(error => {console.error(error); process.exitCode = 1;});
