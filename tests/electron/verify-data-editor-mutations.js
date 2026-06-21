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
const mainEntry = node_path_1.default.join(projectRoot, "dist/build/scripts/electron-main.js");
const datasetName = "dialogforge_editor_test";
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
const attachRendererDiagnostics = function (page, failures) {
    page.on("pageerror", (error) => {
        failures.push({
            page: page.url() || "unloaded-renderer",
            message: error.stack || error.message
        });
    });
    page.on("console", (message) => {
        if (message.type() === "error") {
            failures.push({
                page: page.url() || "unloaded-renderer",
                message: message.text()
            });
        }
    });
};
const waitForMainWindow = async function (app) {
    const page = await findMainWindowPage(app);
    await page.waitForFunction(() => {
        return document.body.dataset.dialogForgeReady === "1";
    }, undefined, {
        timeout: 30000
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
const executeQuery = async function (page, query) {
    const result = await page.evaluate(async (code) => {
        return window.dialogForge.executeInvisibleQuery({
            query: code,
            source: "electron.data-editor-mutations"
        });
    }, query);
    if (result.status !== "ready") {
        throw new Error("Invisible R query failed: "
            + result.message
            + " Query: "
            + query);
    }
    return result.value;
};
const assertQueryValue = async function (page, query, expected) {
    const value = await executeQuery(page, query);
    if (String(value) !== expected) {
        throw new Error("Unexpected R query result for "
            + query
            + ": expected "
            + JSON.stringify(expected)
            + ", received "
            + JSON.stringify(value));
    }
};
const waitForDatasetEditor = async function (app, mainPage) {
    await mainPage.evaluate(async (name) => {
        await window.dialogForge.openDatasetEditor(name);
    }, datasetName);
    const deadline = Date.now() + 30000;
    let editorPage;
    while (!editorPage && Date.now() < deadline) {
        editorPage = app.windows().find((candidate) => {
            return candidate !== mainPage
                && candidate.url().includes("datasetEditor.html");
        });
        if (!editorPage) {
            await mainPage.waitForTimeout(25);
        }
    }
    if (!editorPage) {
        throw new Error("Dataset Editor window was not created.");
    }
    await editorPage.locator("[data-data-cell=true]").first().waitFor({
        state: "visible",
        timeout: 30000
    });
    return editorPage;
};
const editInlineValue = async function (page, targetSelector, editorSelector, value) {
    await page.locator(targetSelector).dblclick();
    const input = page.locator(editorSelector);
    await input.waitFor({
        state: "visible",
        timeout: 10000
    });
    await input.fill(value);
    await input.press("Enter");
};
const run = async function () {
    const userDataPath = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "dialogforge-data-editor-"));
    const rendererFailures = [];
    const electronExecutable = require("electron");
    const app = await playwright_1._electron.launch({
        executablePath: electronExecutable,
        args: productLaunchArgs(mainEntry),
        cwd: projectRoot,
        env: {
            ...node_process_1.default.env,
            DIALOGFORGE_TEST_USER_DATA_PATH: userDataPath
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
        await executeQuery(mainPage, `${datasetName} <- data.frame(score = c(1, 2), name = c("Ada", "Linus"), row.names = c("case_a", "case_b"), stringsAsFactors = FALSE)`);
        const editorPage = await waitForDatasetEditor(app, mainPage);
        const firstScoreCell = '[data-data-cell="true"][data-data-row="1"][data-data-column="score"]';
        await editInlineValue(editorPage, firstScoreCell, '[data-data-editor="true"][data-data-row="1"][data-data-column="score"]', "42");
        await assertQueryValue(mainPage, `as.character(${datasetName}[1, "score"])`, "42");
        await editorPage.waitForFunction((selector) => {
            return document.querySelector(selector)?.textContent?.trim() === "42";
        }, firstScoreCell, {
            timeout: 10000
        });
        await editInlineValue(editorPage, '[data-row-name="1"]', '[data-rowname-editor="true"][data-data-row="1"]', "edited_case");
        await assertQueryValue(mainPage, `rownames(${datasetName})[1]`, "edited_case");
        await editorPage
            .locator('[data-data-header="score"]')
            .click({ button: "right" });
        await editorPage
            .locator('[data-header-menu-action="rename"]')
            .click();
        const headerInput = editorPage.locator('[data-header-editor="true"][data-data-column="score"]');
        await headerInput.waitFor({
            state: "visible",
            timeout: 10000
        });
        await headerInput.fill("result");
        await headerInput.press("Enter");
        await assertQueryValue(mainPage, `names(${datasetName})[1]`, "result");
        await editorPage.locator("#datasetEditorTabVariables").click();
        const labelInput = editorPage.locator('[data-variable-row="0"][data-variable-field="label"]');
        await labelInput.waitFor({
            state: "visible",
            timeout: 20000
        });
        await labelInput.fill("Test result");
        await labelInput.press("Enter");
        await assertQueryValue(mainPage, `attr(${datasetName}[["result"]], "label")`, "Test result");
        if (rendererFailures.length > 0) {
            throw new Error("Renderer failures occurred during Data Editor mutations: "
                + JSON.stringify(rendererFailures));
        }
        console.log("Data Editor cell, row, column, and metadata mutations verified in Electron.");
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
        node_fs_1.default.rmSync(userDataPath, {
            recursive: true,
            force: true
        });
    }
};
void run().catch((error) => {
    console.error(error);
    node_process_1.default.exitCode = 1;
});
