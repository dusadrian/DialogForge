"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const node_process_1 = __importDefault(require("node:process"));
const node_child_process_1 = require("node:child_process");
const playwright_1 = require("playwright");
const { findMainWindowPage, productLaunchArgs } = require("./product-launch");
const projectRoot = node_process_1.default.cwd();
const mainEntry = node_path_1.default.join(projectRoot, "dist/build/scripts/electron-main.js");
const productPath = String(
    node_process_1.default.env.DIALOGFORGE_ELECTRON_PRODUCT_PATH || ""
).trim();
const stageProduct = function () {
    const result = (0, node_child_process_1.spawnSync)(
        node_process_1.default.execPath,
        [
            node_path_1.default.join(
                projectRoot,
                "dist/build/scripts/package-product.js"
            ),
            "--product-path",
            productPath,
            "--stage-only"
        ],
        {
            cwd: projectRoot,
            env: node_process_1.default.env,
            stdio: "inherit"
        }
    );

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`Product staging exited with status ${result.status}.`);
    }
};
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
const writeSystemClipboard = function (app, text) {
    return app.evaluate(({ clipboard }, value) => {
        clipboard.writeText(value);
    }, text);
};
const readSystemClipboard = function (app) {
    return app.evaluate(({ clipboard }) => clipboard.readText());
};
const dragSelectTranscriptText = async function (page, expected) {
    const endpoints = await page.evaluate((text) => {
        const root = document.querySelector("[data-console-transcript-island]");
        const rows = Array.from(root?.querySelectorAll(
            "[data-console-transcript-row]"
        ) || []);
        const row = rows.find((candidate) => {
            return String(candidate.textContent || "").includes(text);
        });

        if (!row) {
            return null;
        }

        const nodes = [];
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();

        while (node) {
            const value = String(node.nodeValue || "");

            for (let index = 0; index < value.length; index += 1) {
                const range = document.createRange();

                range.setStart(node, index);
                range.setEnd(node, index + 1);
                const rect = range.getBoundingClientRect();

                if (rect.width > 0 && rect.height > 0) {
                    nodes.push({
                        value: value[index],
                        left: rect.left,
                        right: rect.right,
                        top: rect.top,
                        bottom: rect.bottom
                    });
                }
            }

            node = walker.nextNode();
        }

        const rendered = nodes.map((entry) => entry.value).join("");
        const start = rendered.indexOf(text);

        if (start < 0) {
            return null;
        }

        const first = nodes[start];
        const last = nodes[start + text.length - 1];

        return {
            start: {
                x: first.left + 1,
                y: (first.top + first.bottom) / 2
            },
            end: {
                x: last.right - 1,
                y: (last.top + last.bottom) / 2
            }
        };
    }, expected);

    if (!endpoints) {
        throw new Error(
            `Could not locate transcript text ${JSON.stringify(expected)} for mouse selection.`
        );
    }

    await page.mouse.move(endpoints.start.x, endpoints.start.y);
    await page.mouse.down();
    await page.mouse.move(endpoints.end.x, endpoints.end.y, {
        steps: 12
    });
    await page.mouse.up();

    return page.evaluate(() => String(window.getSelection()?.toString() || ""));
};
const waitForConsoleText = async function (page, expected) {
    await page.waitForFunction((text) => {
        const terminal = document.getElementById("consoleTerminal");
        return String(terminal?.innerText || "").includes(text);
    }, expected, {
        timeout: 30000
    });
};
const waitForPathCompletion = async function (page) {
    try {
        await page.waitForFunction(() => {
            const input = document.getElementById("visibleCommandInput");
            const value = String(
                input?.dialogForgeConsoleInputView?.getText?.() || ""
            );
            const suggestions = Array.from(document.querySelectorAll(
                ".suggest-widget .monaco-list-row"
            )).map((row) => String(row.textContent || ""));

            return value.includes('~/Documents/')
                || suggestions.some((label) => label.includes("Documents/"));
        }, undefined, {
            timeout: 10000
        });
    }
    catch (error) {
        const state = await page.evaluate(async () => {
            const code = 'ess <- readRDS("~/Do';
            const input = document.getElementById("visibleCommandInput");
            const runtimeResult = await window.dialogForge.readCompletions({
                code,
                cursorColumn: code.length + 1,
                timeoutMs: 3200,
                source: "electron.console-tab-completion"
            });

            return {
                input: String(
                    input?.dialogForgeConsoleInputView?.getText?.() || ""
                ),
                suggestionText: String(
                    document.querySelector(".suggest-widget")?.textContent || ""
                ),
                runtimeResult: {
                    status: runtimeResult.status,
                    itemCount: runtimeResult.items.length,
                    pathItems: runtimeResult.items.filter((item) => {
                        return item.kind === "file"
                            || item.kind === "folder";
                    }),
                    symbols: runtimeResult.symbols
                }
            };
        });

        throw new Error(
            `Path completion failed: ${JSON.stringify(state)}. ${String(error)}`
        );
    }
};
const modifier = node_process_1.default.platform === "darwin" ? "Meta" : "Control";
const closeWithoutSavingWorkspace = async function (app) {
    await app.evaluate(({ dialog }) => {
        dialog.showMessageBox = async function () {
            return {
                response: 1,
                checkboxChecked: false
            };
        };
    });
    await app.close();
};
const run = async function () {
    stageProduct();
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
        await withConsoleInput(page, function (view) {
            view.setText('ess <- readRDS("~/Do');
            view.focus();
        });
        await page.keyboard.press("Tab");
        await waitForPathCompletion(page);
        await page.waitForFunction(() => {
            const input = document.querySelector("#consoleTerminal .monaco-editor");
            const active = document.activeElement;
            return Boolean(input && active && input.contains(active));
        }, undefined, {
            timeout: 10000
        });
        const selectedTranscriptText = await dragSelectTranscriptText(
            page,
            "[1] 2"
        );
        if (selectedTranscriptText !== "[1] 2") {
            throw new Error(
                `Could not select console transcript text: ${JSON.stringify(selectedTranscriptText)}.`
            );
        }
        await writeSystemClipboard(app, "dialogforge-copy-not-run");
        await page.keyboard.press(`${modifier}+C`);
        const copiedTranscriptText = await readSystemClipboard(app);
        if (copiedTranscriptText !== "[1] 2") {
            throw new Error(
                `Cmd/Ctrl+C copied ${JSON.stringify(copiedTranscriptText)} instead of selected transcript text.`
            );
        }
        await writeSystemClipboard(app, "dialogforge-context-copy-not-run");
        await page.locator("[data-console-transcript-row]").filter({
            hasText: "[1] 2"
        }).click({
            button: "right"
        });
        const copyMenuItem = page.locator(
            "[data-console-context-action=copy]"
        );

        await copyMenuItem.waitFor({
            state: "visible",
            timeout: 5000
        });
        await copyMenuItem.click();
        const contextCopiedText = await readSystemClipboard(app);

        if (contextCopiedText !== "[1] 2") {
            throw new Error(
                `Console Copy menu copied ${JSON.stringify(contextCopiedText)} instead of selected transcript text.`
            );
        }
        await page.evaluate(() => {
            window.getSelection()?.removeAllRanges();
        });
        await withConsoleInput(page, function (view) {
            view.setText("copy-input-selection");
            view.focus();
        });
        await page.keyboard.press(`${modifier}+A`);
        await writeSystemClipboard(app, "dialogforge-input-copy-not-run");
        await page.keyboard.press(`${modifier}+C`);
        const copiedInputText = await readSystemClipboard(app);
        if (copiedInputText !== "copy-input-selection") {
            throw new Error(
                `Cmd/Ctrl+C copied ${JSON.stringify(copiedInputText)} instead of selected console input text.`
            );
        }
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
        await closeWithoutSavingWorkspace(app);
    }
};
void run().catch((error) => {
    console.error(error);
    node_process_1.default.exitCode = 1;
});
