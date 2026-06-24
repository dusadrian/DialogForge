"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_process_1 = __importDefault(require("node:process"));
const node_child_process_1 = require("node:child_process");
const playwright_1 = require("playwright");
const { findMainWindowPage, productLaunchArgs } = require("./product-launch");
const projectRoot = node_process_1.default.cwd();
const mainEntry = node_path_1.default.join(projectRoot, "dist/scripts/electron-main.js");
const defaultDatasetCandidates = [
    node_path_1.default.join(node_os_1.default.homedir(), "ess9en.rds"),
    node_path_1.default.join(node_os_1.default.homedir(), "ess9ro.rds")
];
const elapsedMs = function (startedAt) {
    return Number(node_process_1.default.hrtime.bigint() - startedAt) / 1000000;
};
const descendantProcessIds = function (parentPid) {
    const output = (0, node_child_process_1.execFileSync)("ps", ["-axo", "pid=,ppid="], {
        encoding: "utf8"
    });
    const children = new Map();
    output.split("\n").forEach((line) => {
        const [pidText, parentText] = line.trim().split(/\s+/);
        const pid = Number(pidText);
        const parent = Number(parentText);
        if (!Number.isInteger(pid) || !Number.isInteger(parent)) {
            return;
        }
        const siblings = children.get(parent) || [];
        siblings.push(pid);
        children.set(parent, siblings);
    });
    const descendants = [];
    const pending = [...(children.get(parentPid) || [])];
    while (pending.length > 0) {
        const pid = pending.shift();
        if (!pid) {
            continue;
        }
        descendants.push(pid);
        pending.push(...(children.get(pid) || []));
    }
    return descendants;
};
const stopProcess = function (pid) {
    try {
        node_process_1.default.kill(pid, "SIGKILL");
    }
    catch {
        // The process already exited.
    }
};
const resolveDatasetPath = function () {
    const requested = String(node_process_1.default.env.DIALOGFORGE_DATA_EDITOR_DATASET || "").trim();
    const candidates = requested
        ? [node_path_1.default.resolve(requested)]
        : defaultDatasetCandidates;
    const datasetPath = candidates.find((candidate) => node_fs_1.default.existsSync(candidate));
    if (!datasetPath) {
        throw new Error("No RDS dataset was found. Set DIALOGFORGE_DATA_EDITOR_DATASET to a readable .rds file.");
    }
    return datasetPath;
};
const waitForMainWindow = async function (app) {
    const page = await findMainWindowPage(app);
    await page.waitForFunction(() => {
        return document.body.dataset.dialogForgeReady === "1";
    }, undefined, {
        timeout: 20000
    });
    await page.waitForFunction(() => {
        const prompt = document.querySelector('#consoleTerminal [data-session-phase="ready"]');
        return Boolean(prompt
            && prompt.dataset.runtimeBusy !== "true"
            && prompt.style.display !== "none");
    }, undefined, {
        timeout: 30000
    });
    return page;
};
const attachRendererDiagnostics = function (page, failures) {
    const pageName = function () {
        return page.url() || "unloaded-renderer";
    };
    page.on("pageerror", (error) => {
        failures.push({
            page: pageName(),
            type: "pageerror",
            message: error.stack || error.message
        });
    });
    page.on("console", (message) => {
        if (message.type() !== "error") {
            return;
        }
        failures.push({
            page: pageName(),
            type: "console",
            message: message.text()
        });
    });
};
const waitForDatasetEditorWindow = async function (app, mainPage, datasetName, failures) {
    const startedAt = node_process_1.default.hrtime.bigint();
    await mainPage.evaluate((name) => {
        const bridge = window.dialogForge;
        if (!bridge?.openDatasetEditor) {
            throw new Error("DialogForge dataset editor bridge is not ready.");
        }
        void bridge.openDatasetEditor(name);
    }, datasetName);
    let page;
    let windowCreatedMs = 0;
    const deadline = Date.now() + 20000;
    while (!page && Date.now() < deadline) {
        page = app.windows().find((candidate) => {
            return candidate !== mainPage
                && candidate.url().includes("datasetEditor.html");
        });
        if (!page) {
            await new Promise((resolve) => {
                setTimeout(resolve, 20);
            });
        }
    }
    if (!page) {
        throw new Error("Dataset editor window was not created within 20 seconds.");
    }
    windowCreatedMs = elapsedMs(startedAt);
    attachRendererDiagnostics(page, failures);
    await page.waitForLoadState("domcontentloaded");
    return {
        page,
        startedAt,
        windowCreatedMs
    };
};
const measureGridCoverage = async function (page) {
    return page.evaluate(() => {
        const viewport = document.getElementById("datasetEditorDataScroll");
        const table = viewport?.querySelector("table.dataset-grid--data");
        const viewportRect = viewport?.getBoundingClientRect();
        const tableRect = table?.getBoundingClientRect();
        const viewportWidth = Math.round(viewportRect?.width || 0);
        const paintedGridWidth = Math.round(tableRect?.width || 0);
        return {
            dataColumnCount: table?.querySelectorAll("thead th:not(.row-index)").length || 0,
            dataRowCount: table?.querySelectorAll("tbody tr").length || 0,
            viewportWidth,
            paintedGridWidth,
            uncoveredViewportWidth: Math.max(0, viewportWidth - paintedGridWidth)
        };
    });
};
const runMeasurement = async function () {
    const datasetPath = resolveDatasetPath();
    const datasetName = String(node_process_1.default.env.DIALOGFORGE_DATA_EDITOR_OBJECT || "dialogforge_perf").trim();
    const runId = new Date().toISOString().replaceAll(":", "-");
    const artifactsDirectory = node_path_1.default.join(projectRoot, "artifacts/electron-data-editor", runId);
    const rendererFailures = [];
    const electronExecutable = require("electron");
    node_fs_1.default.mkdirSync(artifactsDirectory, {
        recursive: true
    });
    const app = await playwright_1._electron.launch({
        executablePath: electronExecutable,
        args: productLaunchArgs(mainEntry),
        cwd: projectRoot,
        env: {
            ...node_process_1.default.env,
            DIALOGFORGE_ELECTRON_MEASUREMENT: "1"
        }
    });
    const appProcess = app.process();
    const appPid = appProcess.pid;
    if (!appPid) {
        throw new Error("Playwright did not expose the Electron process id.");
    }
    app.on("window", (page) => {
        attachRendererDiagnostics(page, rendererFailures);
    });
    try {
        const mainPage = await waitForMainWindow(app);
        attachRendererDiagnostics(mainPage, rendererFailures);
        const loadResult = await mainPage.evaluate(async ({ name, filePath }) => {
            return window.dialogForge.executeInvisibleQuery({
                query: `assign(${JSON.stringify(name)}, readRDS(${JSON.stringify(filePath)}), envir = .GlobalEnv)`,
                source: "electron.data-editor-measurement"
            });
        }, {
            name: datasetName,
            filePath: datasetPath
        });
        if (loadResult.status !== "ready") {
            throw new Error(`Could not load the measurement dataset: ${loadResult.message}`);
        }
        const editor = await waitForDatasetEditorWindow(app, mainPage, datasetName, rendererFailures);
        await editor.page.locator("[data-data-cell=true]").first().waitFor({
            state: "visible",
            timeout: 20000
        });
        const dataFirstPaintMs = elapsedMs(editor.startedAt);
        await editor.page.screenshot({
            path: node_path_1.default.join(artifactsDirectory, "data-first-paint.png"),
            fullPage: true
        });
        const coverage = await measureGridCoverage(editor.page);
        const variablesStartedAt = node_process_1.default.hrtime.bigint();
        await editor.page.locator("#datasetEditorTabVariables").click();
        await editor.page.locator("[data-variable-row]").first().waitFor({
            state: "visible",
            timeout: 20000
        });
        const variablesFirstPaintMs = elapsedMs(variablesStartedAt);
        const variablesRowCount = await editor.page
            .locator("[data-variable-row]")
            .count();
        await editor.page.screenshot({
            path: node_path_1.default.join(artifactsDirectory, "variables-first-paint.png"),
            fullPage: true
        });
        const cleanupResult = await mainPage.evaluate(async (name) => {
            return window.dialogForge.executeInvisibleQuery({
                query: `rm(list = ${JSON.stringify(name)}, envir = .GlobalEnv)`,
                source: "electron.data-editor-measurement.cleanup"
            });
        }, datasetName);
        if (cleanupResult.status !== "ready") {
            throw new Error(`Could not remove the measurement dataset: ${cleanupResult.message}`);
        }
        return {
            datasetName,
            datasetPath,
            windowCreatedMs: editor.windowCreatedMs,
            dataFirstPaintMs,
            variablesFirstPaintMs,
            variablesRowCount,
            artifactsDirectory,
            rendererFailures,
            ...coverage
        };
    }
    finally {
        const launchedProcessIds = descendantProcessIds(appPid);
        const closeTimeout = new Promise((resolve) => {
            setTimeout(resolve, 2000);
        });
        await Promise.race([
            app.close().catch(() => { }),
            closeTimeout
        ]);
        if (appProcess.exitCode === null) {
            stopProcess(appPid);
        }
        launchedProcessIds.reverse().forEach(stopProcess);
    }
};
const main = async function () {
    const measurement = await runMeasurement();
    const outputPath = node_path_1.default.join(measurement.artifactsDirectory, "measurement.json");
    node_fs_1.default.writeFileSync(outputPath, JSON.stringify(measurement, null, 4) + "\n", "utf8");
    node_process_1.default.stdout.write(JSON.stringify(measurement, null, 4) + "\n");
};
void main().catch((error) => {
    node_process_1.default.stderr.write((error instanceof Error ? error.stack || error.message : String(error)) + "\n");
    node_process_1.default.exitCode = 1;
});
