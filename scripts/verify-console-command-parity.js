"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { _electron, chromium } = require("playwright");
const {
    findMainWindowPage
} = require("../tests/electron/product-launch");
const {
    consoleCommandParityCases,
    clearConsoleForParity,
    runConsoleCommandParity,
    runScriptSelectionParity
} = require("../tests/support/console-command-parity");
const { openMenuItem } = require("../tests/support/menu-interactions");

const rootDir = path.resolve(__dirname, "..");


const readArgs = function(argv = process.argv.slice(2)) {
    const options = {
        host: "both",
        distDir: path.join(rootDir, "dist"),
        webDist: "",
        productPath: "",
        electronApp: "",
        buildWeb: false,
        cases: undefined,
        report: path.join(rootDir, "artifacts/console-command-parity/paired.json"),
        timeoutMs: 120000
    };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];

        if (argument === "--build-web") {
            options.buildWeb = true;
            continue;
        }

        const fields = {
            "--host": "host",
            "--dist-dir": "distDir",
            "--web-dist": "webDist",
            "--product-path": "productPath",
            "--electron-app": "electronApp",
            "--cases": "cases",
            "--report": "report",
            "--timeout-ms": "timeoutMs"
        };
        const field = fields[argument];

        if (!field || index + 1 >= argv.length) {
            throw new Error(`Unknown or incomplete console parity argument: ${argument}`);
        }

        index += 1;
        options[field] = argv[index];
    }

    return normalizeOptions(options);
};


const normalizeOptions = function(options) {
    if (!["native", "web", "both"].includes(options.host)) {
        throw new Error("--host must be native, web or both.");
    }

    options.distDir = path.resolve(options.distDir);
    options.webDist = path.resolve(options.webDist || options.distDir);
    options.productPath = options.productPath ? path.resolve(options.productPath) : "";
    options.electronApp = options.electronApp ? path.resolve(options.electronApp) : "";
    options.report = options.report ? path.resolve(options.report) : "";
    options.cases = typeof options.cases === "string"
        ? options.cases.split(",").map(value => value.trim()).filter(Boolean)
        : options.cases;
    if (options.cases && (
        options.cases.length === 0
        || options.cases.some(name => !consoleCommandParityCases.includes(name))
    )) {
        throw new Error("--cases must name one or more known console acceptance cases.");
    }
    options.timeoutMs = Number(options.timeoutMs);

    if (
        !Number.isFinite(options.timeoutMs)
        || options.timeoutMs <= 0
        || options.timeoutMs > 120000
    ) {
        throw new Error("--timeout-ms must be between 1 and 120000.");
    }

    return options;
};


const runBuildStep = function(script, args, environment) {
    const result = spawnSync(process.execPath, [
        path.join(rootDir, "scripts", script),
        ...args
    ], {
        cwd: rootDir,
        env: environment,
        stdio: "inherit"
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`${script} exited with status ${result.status}.`);
    }
};


const createConsoleProduct = function(temporaryRoot) {
    const productPath = path.join(temporaryRoot, "product");
    fs.mkdirSync(path.join(productPath, "bootstrap"), { recursive: true });
    fs.mkdirSync(path.join(productPath, "settings"), { recursive: true });
    fs.writeFileSync(path.join(productPath, "package.json"), JSON.stringify({
        name: "dialogforge-console-parity",
        version: "0.0.0",
        description: "Product-independent console acceptance fixture",
        product: {
            id: "ConsoleParity",
            name: "Console Parity",
            runtimeProviders: ["r", "webr"],
            defaultRuntimeProvider: "r"
        }
    }, null, 4) + "\n");
    fs.writeFileSync(path.join(productPath, "bootstrap/productContribution.js"), [
        '"use strict";',
        "module.exports.productContribution = {",
        '    id: "ConsoleParity",',
        "    dialogForgeProductContract: 1,",
        "    createDialogExternalCallHosts: function() { return {}; }",
        "};",
        ""
    ].join("\n"));
    fs.writeFileSync(path.join(productPath, "settings/settings.json"), JSON.stringify({
        runtimeStartup: {
            providerId: "webr",
            autoStart: true,
            processLifecycle: false
        }
    }, null, 4) + "\n");

    return productPath;
};


const readFingerprints = function(directory) {
    const files = [
        "src/console/renderer/consoleVisibleCommandController.js",
        "src/console/renderer/mainConsoleCoordinator.js",
        "src/script-editor/renderer/scriptExecutionController.js",
        "src/runtime/providers/r/r-sources/runtimeDispatchCore.R",
        "src/runtime/providers/r/r-sources/runtimeOrderedCapturePrototype.R",
        "browser-esm/shell.js",
        "browser-esm/scriptEditor.js"
    ];
    const fingerprints = {};

    for (const relativePath of files) {
        const filePath = path.join(directory, relativePath);

        if (fs.existsSync(filePath)) {
            fingerprints[relativePath] = createHash("sha256")
                .update(fs.readFileSync(filePath)).digest("hex");
        }
    }

    return fingerprints;
};


const readPackagedFingerprints = function(executable) {
    const resources = process.platform === "darwin"
        ? path.resolve(path.dirname(executable), "../Resources")
        : path.join(path.dirname(executable), "resources");
    const archive = path.join(resources, "app.asar");
    const files = [executable, archive];
    const fingerprints = {};

    for (const filePath of files) {
        assert.ok(fs.existsSync(filePath),
            `Packaged console acceptance requires the actual artifact: ${filePath}`);
        fingerprints[filePath] = createHash("sha256")
            .update(fs.readFileSync(filePath)).digest("hex");
    }

    return fingerprints;
};


const captureTaskProcessTree = function(mainPid) {
    if (process.platform === "win32") {
        return [mainPid];
    }

    const snapshot = spawnSync("ps", ["-axo", "pid=,ppid="], {
        encoding: "utf8",
        timeout: 2000
    });
    if (snapshot.error || snapshot.status !== 0) {
        throw snapshot.error || new Error("Could not capture the task-owned process tree.");
    }

    const rows = snapshot.stdout.trim().split("\n").map(line => {
        return line.trim().split(/\s+/).map(Number);
    });
    const owned = [mainPid];

    for (let index = 0; index < owned.length; index += 1) {
        for (const [pid, parent] of rows) {
            if (parent === owned[index] && !owned.includes(pid)) {
                owned.push(pid);
            }
        }
    }

    return owned;
};


const stopTaskProcessTree = async function(child, owned) {
    // These disposable fixtures intentionally contain an unsaved script. This
    // is process teardown, not an application quit/save workflow acceptance.
    // All UI handles have already been discarded before sending any signal.
    if (process.platform === "win32") {
        const stopped = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            timeout: 5000,
            windowsHide: true,
            encoding: "utf8"
        });
        if (stopped.error || (stopped.status !== 0 && child.exitCode === null && child.signalCode === null)) {
            throw stopped.error || new Error("Could not stop the task-owned Electron process tree.");
        }
    }
    else {
        for (const pid of owned.slice().reverse()) {
            try {
                process.kill(pid, "SIGKILL");
            }
            catch (error) {
                if (error.code !== "ESRCH") {
                    throw error;
                }
            }
        }
    }

    const deadline = Date.now() + 5000;
    while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(child.exitCode !== null || child.signalCode !== null,
        "Task-owned Electron main process did not exit after fixture teardown.");
};


const observePageFailures = function(page, failures) {
    page.on("pageerror", error => failures.push(String(error)));
    page.on("console", message => {
        if (message.type() === "error") {
            failures.push(message.text());
        }
    });
};


const waitForConsoleReady = async function(page, timeoutMs) {
    await page.waitForFunction(() => {
        const editor = window.monaco?.editor?.getEditors?.().find(candidate => {
            return candidate.getDomNode()?.closest("#consoleTerminal");
        });
        return document.body.classList.contains("consoleMonacoReady")
            && editor && typeof editor.getValue === "function";
    }, undefined, { timeout: timeoutMs });

    const start = page.locator("#consoleToolbarStart");
    if (await start.isEnabled()) {
        await start.click();
    }

    await page.waitForFunction(() => {
        const prompt = document.querySelector(
            '#consoleTerminal [data-session-phase="ready"]'
        );
        return prompt && prompt.dataset.runtimeBusy !== "true"
            && prompt.style.display !== "none";
    }, undefined, { timeout: timeoutMs });
};


const runNative = async function(options, report, temporaryRoot) {
    let app;
    let page;
    let primaryFailure;
    const failures = [];
    const args = options.electronApp
        ? []
        : [
            path.join(options.distDir, "scripts/electron-main.js"),
            "--product", "base", "--runtime", "r"
        ];

    report.native = {
        executable: options.electronApp || require("electron"),
        fingerprints: options.electronApp
            ? readPackagedFingerprints(options.electronApp)
            : readFingerprints(options.distDir),
        cases: []
    };

    try {
        app = await _electron.launch({
            executablePath: options.electronApp || require("electron"),
            args,
            cwd: temporaryRoot,
            timeout: options.timeoutMs,
            env: {
                ...process.env,
                DIALOGFORGE_TEST_USER_DATA_PATH: path.join(temporaryRoot, "native-profile")
            }
        });
        const child = app.process();
        assert.ok(child && child.exitCode === null && child.signalCode === null,
            "The task-owned Electron process must be live before UI control.");
        page = await findMainWindowPage(app, options.timeoutMs);
        observePageFailures(page, failures);
        await waitForConsoleReady(page, options.timeoutMs);
        // The preload searches cwd/dist before its own modules. A fresh cwd
        // prevents an installed/copied app from silently loading this checkout.
        assert.equal(fs.existsSync(path.join(temporaryRoot, "dist")), false);
        report.native.pageUrl = page.url();
        report.native.launchDirectory = temporaryRoot;
        await runConsoleCommandParity(page, {
            cases: options.cases,
            timeoutMs: options.timeoutMs,
            onCase: async function(result) {
                assert.equal(child.exitCode, null, "The task-owned Electron process exited.");
                assert.equal(child.signalCode, null, "The task-owned Electron process was signalled.");
                report.native.cases.push(result);
                console.log(`OK native console ${result.name}`);
            }
        });
        if (!options.cases || options.cases.includes("script-selection")) {
            await clearConsoleForParity(page, options.timeoutMs);
            const opening = app.waitForEvent("window", { timeout: options.timeoutMs });
            assert.equal(child.exitCode, null, "The task-owned Electron process exited.");
            assert.equal(child.signalCode, null, "The task-owned Electron process was signalled.");
            await app.evaluate(({ Menu, BrowserWindow }) => {
                const menu = Menu.getApplicationMenu();
                const item = menu?.getMenuItemById("ScriptEditor");
                if (!item || !item.enabled || typeof item.click !== "function") {
                    throw new Error("The Script editor menu command is unavailable.");
                }
                item.click(item, BrowserWindow.getFocusedWindow(), {});
            });
            const scriptPage = await opening;
            await scriptPage.waitForURL("**/src/base-app/pages/scriptEditor.html", {
                timeout: options.timeoutMs
            });
            observePageFailures(scriptPage, failures);
            await runScriptSelectionParity(page, scriptPage, {
                timeoutMs: options.timeoutMs,
                clearConsole: false,
                onCase: async function(result) {
                    report.native.cases.push(result);
                    console.log(`OK native console ${result.name}`);
                }
            });
        }
        assert.deepEqual(failures, [], "Electron renderer errors must fail console acceptance.");

        if (options.report) {
            report.native.screenshot = options.report + ".native.png";
            await page.screenshot({ path: report.native.screenshot });
        }
    }
    catch (error) {
        primaryFailure = error;
        const child = app?.process();
        if (
            options.report && page && !page.isClosed()
            && child?.exitCode === null && child.signalCode === null
        ) {
            report.native.screenshot = options.report + ".native.png";
            await page.screenshot({ path: report.native.screenshot }).catch(() => undefined);
        }
        throw error;
    }
    finally {
        if (app) {
            const child = app.process();
            let owned = [];
            if (child && child.exitCode === null && child.signalCode === null) {
                try {
                    owned = captureTaskProcessTree(child.pid);
                }
                catch (error) {
                    // The known main PID still belongs to this launch even when
                    // the process-listing utility fails. Stop it and fail cleanup.
                    owned = [child.pid];
                    report.native.cleanupError = String(error);
                }
            }
            app = null;
            page = null;
            try {
                if (owned.length > 0) {
                    await stopTaskProcessTree(child, owned);
                }
                if (report.native.cleanupError) {
                    throw new Error(report.native.cleanupError);
                }
            }
            catch (error) {
                report.native.cleanupError = String(error);
                if (!primaryFailure) {
                    throw error;
                }
                console.error("Console fixture cleanup failed: " + error);
            }
        }
    }
};


const runWeb = async function(options, report, temporaryRoot) {
    const productPath = options.productPath || createConsoleProduct(temporaryRoot);
    const previousDist = process.env.DIALOGFORGE_DIST_DIR;
    const previousSource = process.env.DIALOGFORGE_SOURCE_ROOT;
    const previousLiveScript = process.env.DIALOGFORGE_LIVE_SCRIPT_ENABLED;
    let browser;
    let server;
    let page;
    const failures = [];

    report.web = {
        productPath,
        fingerprints: readFingerprints(options.webDist),
        cases: []
    };

    process.env.DIALOGFORGE_DIST_DIR = options.webDist;
    process.env.DIALOGFORGE_SOURCE_ROOT = rootDir;
    process.env.DIALOGFORGE_LIVE_SCRIPT_ENABLED = "false";

    try {
        if (options.buildWeb) {
            const environment = {
                ...process.env,
                PATH: path.join(rootDir, "node_modules/.bin")
                    + path.delimiter + process.env.PATH
            };
            delete environment.DIALOGFORGE_WEB_PRODUCT_PATH;
            runBuildStep("build-web.js", ["--out-dir", options.webDist], environment);
            runBuildStep("stage-product-browser-dialog-runtime.js", [
                "--product-path", productPath,
                "--out-dir", options.webDist
            ], environment);
        }

        const { createWebProductDevServer } = require(path.join(
            options.webDist, "scripts/web-product-dev-server.js"
        ));
        server = createWebProductDevServer({ productPath });
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
        const baseUrl = `http://127.0.0.1:${server.address().port}/`;
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            permissions: ["clipboard-read", "clipboard-write"]
        });
        page = await context.newPage();
        observePageFailures(page, failures);
        await page.goto(baseUrl);
        await waitForConsoleReady(page, options.timeoutMs);
        report.web.baseUrl = baseUrl;
        report.web.fingerprints = readFingerprints(options.webDist);
        await runConsoleCommandParity(page, {
            cases: options.cases,
            timeoutMs: options.timeoutMs,
            onCase: async function(result) {
                report.web.cases.push(result);
                console.log(`OK WebR console ${result.name}`);
            }
        });
        if (!options.cases || options.cases.includes("script-selection")) {
            await clearConsoleForParity(page, options.timeoutMs);
            await openMenuItem(page, "Script editor");
            const scriptElement = await page.waitForSelector(
                "iframe.dialogforge-web-script-editor-frame",
                { timeout: options.timeoutMs }
            );
            const scriptFrame = await scriptElement.contentFrame();
            assert.ok(scriptFrame, "The browser Script editor frame is unavailable.");
            await runScriptSelectionParity(page, scriptFrame, {
                timeoutMs: options.timeoutMs,
                clearConsole: false,
                onCase: async function(result) {
                    report.web.cases.push(result);
                    console.log(`OK WebR console ${result.name}`);
                }
            });
        }
        assert.deepEqual(failures, [], "Browser errors must fail console acceptance.");

        if (options.report) {
            report.web.screenshot = options.report + ".web.png";
            await page.screenshot({ path: report.web.screenshot });
        }
    }
    catch (error) {
        if (options.report && page && !page.isClosed()) {
            report.web.screenshot = options.report + ".web.png";
            await page.screenshot({ path: report.web.screenshot }).catch(() => undefined);
        }
        throw error;
    }
    finally {
        if (browser) {
            const closing = browser;
            browser = null;
            page = null;
            await closing.close();
        }
        if (server) {
            server.closeAllConnections();
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }

        for (const [name, previous] of [
            ["DIALOGFORGE_DIST_DIR", previousDist],
            ["DIALOGFORGE_SOURCE_ROOT", previousSource],
            ["DIALOGFORGE_LIVE_SCRIPT_ENABLED", previousLiveScript]
        ]) {
            if (previous === undefined) {
                delete process.env[name];
            }
            else {
                process.env[name] = previous;
            }
        }
    }
};


const runConsoleParity = async function(input = {}) {
    const options = normalizeOptions({
        ...readArgs([]),
        ...input,
        webDist: input.webDist || input.distDir || readArgs([]).webDist
    });
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-console-parity-"));
    const report = {
        startedAt: new Date().toISOString(),
        sourceRoot: rootDir,
        host: options.host,
        ok: false
    };

    if (options.report) {
        fs.mkdirSync(path.dirname(options.report), { recursive: true });
    }

    try {
        if (options.host === "native" || options.host === "both") {
            await runNative(options, report, temporaryRoot);
        }
        if (options.host === "web" || options.host === "both") {
            await runWeb(options, report, temporaryRoot);
        }
        report.ok = true;
        return report;
    }
    catch (error) {
        report.error = error instanceof Error ? error.stack : String(error);
        throw error;
    }
    finally {
        report.finishedAt = new Date().toISOString();
        if (options.report) {
            fs.writeFileSync(options.report, JSON.stringify(report, null, 4) + "\n");
        }
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
};


if (require.main === module) {
    runConsoleParity(readArgs()).catch(error => {
        console.error(error instanceof Error ? error.stack : String(error));
        process.exitCode = 1;
    });
}


module.exports = { readArgs, runConsoleParity };
