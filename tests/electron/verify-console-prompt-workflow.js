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
        const input = document.getElementById("visibleCommandInput");
        return document.body.dataset.dialogForgeReady === "1"
            && document.body.classList.contains("consoleMonacoReady")
            && Boolean(input?.dialogForgeConsoleInputView);
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
const submitConsoleCommand = async function (page, command) {
    await page.evaluate(async ({ source, commandText }) => {
        const input = document.getElementById("visibleCommandInput");
        const view = input?.dialogForgeConsoleInputView;
        if (!view) {
            throw new Error("DialogForge console input is not ready.");
        }
        const callback = eval(`(${source})`);
        await callback(view, commandText);
    }, {
        source: (function (view, text) {
            view.setText(text);
            view.focus();
            setTimeout(() => {
                void view.submit();
            }, 0);
            return true;
        }).toString(),
        commandText: command
    });
};
const waitForConsoleText = async function (page, expected) {
    try {
        await page.waitForFunction((text) => {
            const terminal = document.getElementById("consoleTerminal");
            return String(terminal?.innerText || "").includes(text);
        }, expected, {
            timeout: 30000
        });
    }
    catch (error) {
        const transcript = await page.evaluate(() => {
            return String(document.getElementById("consoleTerminal")?.innerText || "");
        });
        throw new Error("Timed out waiting for console text "
            + JSON.stringify(expected)
            + ". Transcript: "
            + JSON.stringify(transcript), {
            cause: error
        });
    }
};
const waitForRequestInput = async function (page) {
    try {
        await page.waitForFunction(() => {
            const slot = document.querySelector("[data-request-input-slot]");
            const input = slot?.querySelector("input") || null;
            return Boolean(input
                && document.activeElement === input);
        }, undefined, {
            timeout: 30000
        });
    }
    catch (error) {
        const state = await page.evaluate(() => {
            const slot = document.querySelector("[data-request-input-slot]");
            const input = slot?.querySelector("input");
            const terminal = document.getElementById("consoleTerminal");
            return {
                hasSlot: Boolean(slot),
                hasInput: Boolean(input),
                activeTag: document.activeElement?.tagName || "",
                activeType: document.activeElement?.type || "",
                transcript: String(terminal?.innerText || "")
            };
        });
        throw new Error("Timed out waiting for focused request input: "
            + JSON.stringify(state), {
            cause: error
        });
    }
};
const answerPrompt = async function (page, answer) {
    await page.locator("[data-request-input-slot] input").fill(answer);
    await page.keyboard.press("Enter");
};
const run = async function () {
    const electronExecutable = require("electron");
    const app = await playwright_1._electron.launch({
        executablePath: electronExecutable,
        args: productLaunchArgs(mainEntry),
        cwd: projectRoot,
        env: {
            ...node_process_1.default.env,
            DIALOGFORGE_ELECTRON_PROMPT_TEST: "1"
        }
    });
    try {
        const page = await waitForMainWindow(app);
        await submitConsoleCommand(page, "cat(readline('Name: '))");
        await waitForConsoleText(page, "Name:");
        await waitForRequestInput(page);
        await answerPrompt(page, "Ada");
        await waitForConsoleText(page, "Ada");
        await page.waitForFunction(() => {
            const prompt = document.querySelector('#consoleTerminal [data-session-phase="ready"]');
            return Boolean(prompt
                && prompt.dataset.runtimeBusy !== "true"
                && prompt.style.display !== "none");
        }, undefined, {
            timeout: 30000
        });
        console.log("Console prompt workflow verified in Electron.");
    }
    finally {
        await app.close();
    }
};
void run().catch((error) => {
    console.error(error);
    node_process_1.default.exitCode = 1;
});
