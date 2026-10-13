"use strict";


const typeConsoleCommand = async function(page, command) {
    await page.locator("#consoleTerminal .monaco-editor").last().click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.press("Backspace");
    if (page.url().startsWith("http")) {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    }
    if (command) {
        await page.evaluate((text) => navigator.clipboard.writeText(text), command);
        await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
    }
    await page.waitForFunction((expected) => {
        const editor = window.monaco?.editor?.getEditors?.().find((candidate) => {
            return candidate.getDomNode()?.closest("#consoleTerminal");
        });
        return editor?.getValue() === expected;
    }, command, { timeout: 10000 }).catch(async (error) => {
        const actual = await page.evaluate(() => {
            return window.monaco?.editor?.getEditors?.().filter((candidate) => {
                return candidate.getDomNode()?.closest("#consoleTerminal");
            }).map((candidate) => candidate.getValue());
        });
        console.error("Console typing mismatch", { expected: command, actual });
        throw error;
    });
};


const runConsoleCommand = async function(page, command) {
    const inputCount = await page.locator(
        '#consoleTerminal [data-console-input-line="true"]'
    ).count();
    await typeConsoleCommand(page, command);
    await page.keyboard.press("Enter");
    await page.waitForFunction((previousCount) => {
        return document.querySelectorAll(
            '#consoleTerminal [data-console-input-line="true"]'
        ).length > previousCount;
    }, inputCount, { timeout: 30000 });
    await page.waitForFunction(() => {
        const prompts = Array.from(document.querySelectorAll(
            '#consoleTerminal [data-session-phase="ready"]'
        ));
        const prompt = prompts[prompts.length - 1];
        const editor = window.monaco?.editor?.getEditors?.().find((candidate) => {
            return candidate.getDomNode()?.closest("#consoleTerminal");
        });
        return prompt && prompt.dataset.runtimeBusy !== "true"
            && prompt.style.display !== "none"
            && editor?.getValue() === ""
            && editor.getOption(window.monaco.editor.EditorOption.readOnly) === false;
    }, undefined, { timeout: 30000 });
};


module.exports = { typeConsoleCommand, runConsoleCommand };
