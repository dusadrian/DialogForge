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
const query = async function (page, code) {
    return page.evaluate(async (queryText) => {
        return window.dialogForge.executeInvisibleQuery({
            query: queryText,
            source: "electron.runtime-recovery"
        });
    }, code);
};
const requireReadySession = function (snapshot, operation) {
    if (snapshot.status !== "ready") {
        throw new Error(operation
            + " did not produce a ready runtime: "
            + snapshot.message);
    }
};
const requireQueryValue = async function (page, code, expected) {
    const result = await query(page, code);
    if (result.status !== "ready"
        || String(result.value) !== expected) {
        throw new Error("Unexpected query result after runtime lifecycle operation: "
            + JSON.stringify({
                code,
                expected,
                result
            }));
    }
};
const run = async function () {
    const electronExecutable = require("electron");
    const app = await playwright_1._electron.launch({
        executablePath: electronExecutable,
        args: productLaunchArgs(mainEntry),
        cwd: projectRoot,
        env: {
            ...node_process_1.default.env,
            DIALOGFORGE_ELECTRON_RUNTIME_RECOVERY_TEST: "1"
        }
    });
    try {
        const page = await waitForMainWindow(app);
        const created = await query(page, "dialogforge_restart_value <- 73");
        if (created.status !== "ready") {
            throw new Error("Could not create the restart test object: "
                + created.message);
        }
        const restored = await page.evaluate(() => {
            return window.dialogForge.restartRuntime("restore");
        });
        requireReadySession(restored, "Restore restart");
        await requireQueryValue(page, "as.character(dialogforge_restart_value)", "73");
        const cleaned = await page.evaluate(() => {
            return window.dialogForge.restartRuntime("clean");
        });
        requireReadySession(cleaned, "Clean restart");
        await requireQueryValue(page, 'as.character(exists("dialogforge_restart_value", envir = .GlobalEnv))', "FALSE");
        const stopped = await page.evaluate(() => {
            return window.dialogForge.stopRuntime();
        });
        if (stopped.status === "ready") {
            throw new Error("Stopped runtime incorrectly remained ready.");
        }
        const unavailable = await query(page, "1 + 1");
        if (unavailable.status === "ready") {
            throw new Error("Invisible query unexpectedly succeeded while runtime was stopped.");
        }
        const started = await page.evaluate(() => {
            return window.dialogForge.startRuntime();
        });
        requireReadySession(started, "Runtime start after stop");
        await requireQueryValue(page, "as.character(1 + 1)", "2");
        console.log("Runtime restore, clean restart, stop, and recovery workflow verified in Electron.");
    }
    finally {
        await app.close();
    }
};
void run().catch((error) => {
    console.error(error);
    node_process_1.default.exitCode = 1;
});
