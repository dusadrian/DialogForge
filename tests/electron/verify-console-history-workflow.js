"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_process_1 = __importDefault(require("node:process"));
const playwright_1 = require("playwright");
const { findMainWindowPage, productLaunchArgs, requiredProductId } = require("./product-launch");
const projectRoot = node_process_1.default.cwd();
const mainEntry = node_path_1.default.join(projectRoot, "dist/build/scripts/electron-main.js");
const productId = requiredProductId();
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
const seedPersistedHistory = async function (page, history) {
    await page.evaluate(async ({ inputHistory, selectedProductId }) => {
        await window.dialogForge.writeConsoleHistory({
            productId: selectedProductId,
            runtimeId: "r",
            history: inputHistory
        });
    }, {
        inputHistory: history,
        selectedProductId: productId
    });
};
const readPersistedHistory = async function (page) {
    return page.evaluate(async (selectedProductId) => {
        return await window.dialogForge.readConsoleHistory({
            productId: selectedProductId,
            runtimeId: "r"
        });
    }, productId);
};
const launch = async function (electronExecutable, userDataDir) {
    return playwright_1._electron.launch({
        executablePath: electronExecutable,
        args: productLaunchArgs(mainEntry),
        cwd: projectRoot,
        env: {
            ...node_process_1.default.env,
            DIALOGFORGE_ELECTRON_HISTORY_TEST: "1",
            DIALOGFORGE_TEST_USER_DATA_PATH: userDataDir
        }
    });
};
const run = async function () {
    const electronExecutable = require("electron");
    const userDataDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "dialogforge-history-"));
    let app = null;
    try {
        app = await launch(electronExecutable, userDataDir);
        let page = await waitForMainWindow(app);
        await seedPersistedHistory(page, [
            "101 + 1",
            '{ cat("__DIALOGFORGE_DATASET_READY_TEST__", "\\n") }'
        ]);
        await page.waitForTimeout(1000);
        await app.close();
        app = await launch(electronExecutable, userDataDir);
        page = await waitForMainWindow(app);
        await page.waitForTimeout(1000);
        const latestHistory = await withConsoleInput(page, function (view) {
            view.setText("");
            view.historyPrevious();
            return view.getText();
        });
        if (latestHistory !== "101 + 1") {
            throw new Error("Internal runtime command leaked into console history: "
                + JSON.stringify(latestHistory));
        }
        const restoredHistory = await withConsoleInput(page, function (view) {
            view.setText("");
            view.historyPrevious();
            return view.getText();
        });
        if (restoredHistory !== "101 + 1") {
            throw new Error("User console history was not restored after relaunch: "
                + JSON.stringify(restoredHistory));
        }
        const persistedHistory = await readPersistedHistory(page);
        if (persistedHistory.some((command) => {
            return command.includes("__DIALOGFORGE_DATASET_READY_");
        })) {
            throw new Error("Internal runtime command was not cleaned from persisted history: "
                + JSON.stringify(persistedHistory));
        }
        console.log("Console history workflow verified in Electron.");
    }
    finally {
        if (app) {
            await app.close().catch(() => undefined);
        }
        node_fs_1.default.rmSync(userDataDir, {
            recursive: true,
            force: true
        });
    }
};
void run().catch((error) => {
    console.error(error);
    node_process_1.default.exitCode = 1;
});
