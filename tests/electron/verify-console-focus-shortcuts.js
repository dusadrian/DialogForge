"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const node_process_1 = __importDefault(require("node:process"));
const playwright_1 = require("playwright");
const { findMainWindowPage, productLaunchArgs } = require("./product-launch");
const projectRoot = node_process_1.default.cwd();
const mainEntry = node_path_1.default.join(projectRoot, "dist/build/scripts/electron-main.js");
const waitForMainWindow = async function (app) {
    const page = await findMainWindowPage(app);
    await page.waitForFunction(() => {
        return document.body.dataset.dialogForgeReady === "1"
            && document.body.classList.contains("consoleMonacoReady");
    }, undefined, {
        timeout: 30000
    });
    await page.waitForFunction(() => {
        const input = document.getElementById("visibleCommandInput");
        return Boolean(input?.dialogForgeConsoleInputView);
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
const withConsoleInput = async function (page, action) {
    return page.evaluate(async (source) => {
        const input = document.getElementById("visibleCommandInput");
        const view = input?.dialogForgeConsoleInputView;
        if (!view) {
            throw new Error("DialogForge console input is not ready.");
        }
        const callback = eval(`(${source})`);
        return await callback(view);
    }, action.toString());
};
const consoleHasFocus = function (page) {
    return page.evaluate(() => {
        const input = document.querySelector("#consoleTerminal .monaco-editor");
        const active = document.activeElement;
        return Boolean(input && active && input.contains(active));
    });
};
const waitForConsoleText = async function (page, expected) {
    await page.waitForFunction((text) => {
        const terminal = document.getElementById("consoleTerminal");
        return String(terminal?.innerText || "").includes(text);
    }, expected, {
        timeout: 30000
    });
};
const modifier = node_process_1.default.platform === "darwin" ? "Meta" : "Control";
const run = async function () {
    const electronExecutable = require("electron");
    const app = await playwright_1._electron.launch({
        executablePath: electronExecutable,
        args: productLaunchArgs(mainEntry),
        cwd: projectRoot,
        env: {
            ...node_process_1.default.env,
            DIALOGFORGE_ELECTRON_FOCUS_TEST: "1"
        }
    });
    try {
        const page = await waitForMainWindow(app);
        await withConsoleInput(page, async function (view) {
            view.setText("1 + 1");
            view.focus();
            await view.submit();
        });
        await waitForConsoleText(page, "[1] 2");
        await page.waitForFunction(() => {
            const input = document.querySelector("#consoleTerminal .monaco-editor");
            const active = document.activeElement;
            return Boolean(input && active && input.contains(active));
        }, undefined, {
            timeout: 10000
        });
        await page.evaluate(() => {
            document.getElementById("consoleToolbarInfo")?.focus();
        });
        await page.keyboard.press(`${modifier}+ArrowDown`);
        if (!await consoleHasFocus(page)) {
            throw new Error("Cmd/Ctrl+Down did not restore focus to the console prompt.");
        }
        await withConsoleInput(page, function (view) {
            view.setText("middle");
            view.focus();
        });
        await page.keyboard.press(`${modifier}+ArrowLeft`);
        await page.keyboard.type("start-");
        const afterHome = await withConsoleInput(page, function (view) {
            return view.getText();
        });
        if (afterHome !== "start-middle") {
            throw new Error(`Cmd/Ctrl+Left produced ${JSON.stringify(afterHome)}.`);
        }
        await page.keyboard.press(`${modifier}+ArrowRight`);
        await page.keyboard.type("-end");
        const afterEnd = await withConsoleInput(page, function (view) {
            return view.getText();
        });
        if (afterEnd !== "start-middle-end") {
            throw new Error(`Cmd/Ctrl+Right produced ${JSON.stringify(afterEnd)}.`);
        }
        console.log("Console focus shortcuts verified in Electron.");
    }
    finally {
        await app.close();
    }
};
void run().catch((error) => {
    console.error(error);
    node_process_1.default.exitCode = 1;
});
