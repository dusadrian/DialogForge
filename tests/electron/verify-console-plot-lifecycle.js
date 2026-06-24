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
const mainEntry = node_path_1.default.join(projectRoot, "dist/scripts/electron-main.js");
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
const submitCommand = async function (page, command) {
    await page.evaluate(async ({ source, commandText }) => {
        const input = document.getElementById("visibleCommandInput");
        const view = input?.dialogForgeConsoleInputView;
        if (!view) {
            throw new Error("DialogForge console input is not ready.");
        }
        const callback = eval(`(${source})`);
        await callback(view, commandText);
    }, {
        source: (async function (view, text) {
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
    await page.waitForFunction((text) => {
        const terminal = document.getElementById("consoleTerminal");
        return String(terminal?.innerText || "").includes(text);
    }, expected, {
        timeout: 30000
    });
};
const waitForPlotWindow = async function (app) {
    const existing = app.windows().find((page) => {
        return page.url().endsWith("/plotViewer.html");
    });
    const page = existing || await app.waitForEvent("window", {
        timeout: 30000
    });
    await page.waitForSelector("#historyList", {
        timeout: 30000
    });
    return page;
};
const waitForPlotHistoryCount = async function (page, expected) {
    await page.waitForFunction((count) => {
        return document.querySelectorAll("#historyList .plot-thumb").length
            === count;
    }, expected, {
        timeout: 30000
    });
};
const run = async function () {
    const electronExecutable = require("electron");
    const app = await playwright_1._electron.launch({
        executablePath: electronExecutable,
        args: productLaunchArgs(mainEntry),
        cwd: projectRoot,
        env: {
            ...node_process_1.default.env,
            DIALOGFORGE_ELECTRON_PLOT_TEST: "1"
        }
    });
    try {
        const mainPage = await waitForMainWindow(app);
        await submitCommand(mainPage, "plot(1:11)");
        const firstPlotPage = await waitForPlotWindow(app);
        await waitForPlotHistoryCount(firstPlotPage, 1);
        await firstPlotPage.close();
        await submitCommand(mainPage, "1 + 1");
        await waitForConsoleText(mainPage, "[1] 2");
        await mainPage.waitForTimeout(1000);
        const reopenedAfterNonPlot = app.windows().some((page) => {
            return page.url().endsWith("/plotViewer.html");
        });
        if (reopenedAfterNonPlot) {
            throw new Error("The closed plot window reopened after a non-plot command.");
        }
        await submitCommand(mainPage, "plot(1:5)");
        const secondPlotPage = await waitForPlotWindow(app);
        await waitForPlotHistoryCount(secondPlotPage, 2);
        console.log("Console plot lifecycle verified in Electron.");
    }
    finally {
        await app.close();
    }
};
void run().catch((error) => {
    console.error(error);
    node_process_1.default.exitCode = 1;
});
