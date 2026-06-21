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
const waitForScriptEditor = async function (app, mainPage, filePath) {
    const opened = await mainPage.evaluate((nextPath) => {
        return window.dialogForge.openScriptFilePathInEditor(nextPath);
    }, filePath);
    if (opened.status !== "ready") {
        throw new Error("Could not open the script file in the editor: "
            + opened.message);
    }
    const deadline = Date.now() + 30000;
    let editorPage;
    while (!editorPage && Date.now() < deadline) {
        editorPage = app.windows().find((candidate) => {
            return candidate !== mainPage
                && candidate.url().includes("scriptEditor.html");
        });
        if (!editorPage) {
            await mainPage.waitForTimeout(25);
        }
    }
    if (!editorPage) {
        throw new Error("Script Editor window was not created.");
    }
    await editorPage.locator(".monaco-editor textarea").waitFor({
        state: "visible",
        timeout: 30000
    });
    await editorPage.waitForFunction((expectedPath) => {
        return document.title.includes(pathBasename(expectedPath));
        function pathBasename(value) {
            return value.split(/[\\/]/).pop() || value;
        }
    }, filePath, {
        timeout: 20000
    });
    return editorPage;
};
const run = async function () {
    const tempDirectory = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "dialogforge-script-editor-"));
    const scriptPath = node_path_1.default.join(tempDirectory, "workflow.R");
    const initialContent = "value <- 1\n";
    const insertedContent = "print(value)\n";
    node_fs_1.default.writeFileSync(scriptPath, initialContent, "utf8");
    const electronExecutable = require("electron");
    const app = await playwright_1._electron.launch({
        executablePath: electronExecutable,
        args: productLaunchArgs(mainEntry),
        cwd: projectRoot,
        env: {
            ...node_process_1.default.env,
            DIALOGFORGE_ELECTRON_SCRIPT_EDITOR_TEST: "1",
            DIALOGFORGE_TEST_USER_DATA_PATH: node_path_1.default.join(tempDirectory, "user-data")
        }
    });
    const appProcess = app.process();
    const appPid = appProcess.pid;
    if (!appPid) {
        throw new Error("Playwright did not expose the Electron process id.");
    }
    try {
        const mainPage = await waitForMainWindow(app);
        const editorPage = await waitForScriptEditor(app, mainPage, scriptPath);
        const inserted = await mainPage.evaluate((code) => {
            return window.dialogForge.insertScriptEditorCode({
                code
            });
        }, insertedContent);
        if (inserted.status !== "submitted") {
            throw new Error("Could not insert code into the Script Editor: "
                + inserted.message);
        }
        try {
            await editorPage.waitForFunction(() => {
                return document.title.includes("•")
                    && Boolean(document.querySelector(".dm-script-tab.active")?.textContent?.includes("•"));
            }, undefined, {
                timeout: 10000
            });
        }
        catch (error) {
            const state = await editorPage.evaluate(() => {
                return {
                    title: document.title,
                    tabs: Array.from(document.querySelectorAll(".dm-script-tab")).map((tab) => tab.textContent || ""),
                    editorText: Array.from(document.querySelectorAll(".view-line")).map((line) => line.textContent || "").join("\n")
                };
            });
            throw new Error("Script Editor did not become dirty after code insertion: "
                + JSON.stringify(state), {
                cause: error
            });
        }
        await editorPage.keyboard.press(node_process_1.default.platform === "darwin" ? "Meta+S" : "Control+S");
        try {
            await editorPage.waitForFunction(() => {
                return !document.title.includes("•")
                    && !document.querySelector(".dm-script-tab.active")?.textContent?.includes("•");
            }, undefined, {
                timeout: 10000
            });
        }
        catch (error) {
            const state = await editorPage.evaluate(() => {
                return {
                    title: document.title,
                    tabText: document.querySelector(".dm-script-tab.active")?.textContent || ""
                };
            });
            throw new Error("Script Editor did not clear dirty state after save: "
                + JSON.stringify({
                    state,
                    fileContent: node_fs_1.default.readFileSync(scriptPath, "utf8")
                }), {
                cause: error
            });
        }
        const savedContent = node_fs_1.default.readFileSync(scriptPath, "utf8");
        if (!savedContent.includes("value <- 1")
            || !savedContent.includes("print(value)")) {
            throw new Error("Script Editor saved unexpected content: "
                + JSON.stringify(savedContent));
        }
        await editorPage.close();
        await mainPage.waitForTimeout(250);
        if (app.windows().some((page) => {
            return page.url().includes("scriptEditor.html");
        })) {
            throw new Error("Clean Script Editor window did not close.");
        }
        console.log("Script Editor dirty state, save, and clean close verified in Electron.");
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
        node_fs_1.default.rmSync(tempDirectory, {
            recursive: true,
            force: true
        });
    }
};
void run().catch((error) => {
    console.error(error);
    node_process_1.default.exitCode = 1;
});
