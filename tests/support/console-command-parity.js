"use strict";

const assert = require("node:assert/strict");
const {
    typeConsoleCommand,
    runConsoleCommand
} = require("./console-interactions");


const consoleCommandParityCases = Object.freeze([
    "rivers",
    "continuation",
    "semicolons",
    "history",
    "error",
    "interrupt",
    "messages",
    "package-methods",
    "script-selection"
]);


const riversCommand = [
    "class(rivers)",
    "x <- type.convert(rivers, as.is = TRUE)",
    "class(x)"
].join("\n");

const riversRows = [
    "> class(rivers)",
    '[1] "numeric"',
    "> x <- type.convert(rivers, as.is = TRUE)",
    "> class(x)",
    '[1] "integer"'
];


const readConsoleTranscriptRows = async function(page) {
    return page.evaluate(() => {
        const rows = [];
        const items = document.querySelectorAll(
            "#consoleTerminal [data-console-transcript-row]"
        );

        for (const item of items) {
            const activity = item.firstElementChild;

            if (!activity) {
                continue;
            }

            for (const block of activity.children) {
                const inputRows = block.querySelectorAll(
                    ':scope > [data-console-input-line="true"]'
                );

                if (inputRows.length) {
                    for (const input of inputRows) {
                        const prompt = input.firstElementChild?.textContent || "";
                        rows.push(prompt + input.dataset.consoleInputCode);
                    }

                    continue;
                }

                for (const output of block.children) {
                    const text = output.textContent || "";
                    // The renderer uses one NBSP to give an empty row height.
                    // All other whitespace is part of the observable output.
                    rows.push(text === "\u00a0" ? "" : text);
                }
            }
        }

        return rows;
    });
};


const waitForConsoleReady = async function(page, timeoutMs) {
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
    }, undefined, { timeout: timeoutMs });
};


const waitForTranscriptPaint = async function(page) {
    await page.evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
};


const assertTranscriptRows = async function(page, expected, name) {
    await waitForTranscriptPaint(page);
    const rows = await readConsoleTranscriptRows(page);

    assert.deepEqual(rows, expected, name + " console transcript");

    return rows;
};


const clearConsole = async function(page, timeoutMs) {
    await waitForConsoleReady(page, timeoutMs);
    await page.locator("#consoleToolbarClear").click();
    await page.waitForFunction(() => {
        return document.querySelectorAll(
            "#consoleTerminal [data-console-transcript-row]"
        ).length === 0;
    }, undefined, { timeout: timeoutMs });
};


const readConsoleInput = async function(page) {
    return page.evaluate(() => {
        const editor = window.monaco?.editor?.getEditors?.().find((candidate) => {
            return candidate.getDomNode()?.closest("#consoleTerminal");
        });

        return editor?.getValue({ preserveBOM: false, lineEnding: "\n" });
    });
};


const runConsoleCommandParity = async function(page, options = {}) {
    const names = options.cases || consoleCommandParityCases;
    const timeoutMs = options.timeoutMs || 30000;
    const results = [];

    assert.ok(Array.isArray(names), "Console parity cases must be an array.");

    for (const name of names) {
        assert.ok(
            consoleCommandParityCases.includes(name),
            "Unknown console parity case: " + name
        );

        if (name === "script-selection") {
            continue;
        }

        await clearConsole(page, timeoutMs);
        let rows;

        if (name === "rivers") {
            await runConsoleCommand(page, riversCommand);
            rows = await assertTranscriptRows(page, riversRows, name);
        }
        else if (name === "continuation") {
            await runConsoleCommand(page, [
                "sum(",
                "    1,",
                "    2",
                ")",
                "{",
                "    3",
                "    4",
                "}"
            ].join("\n"));
            rows = await assertTranscriptRows(page, [
                "> sum(",
                "+     1,",
                "+     2",
                "+ )",
                "[1] 3",
                "> {",
                "+     3",
                "+     4",
                "+ }",
                "[1] 4"
            ], name);
        }
        else if (name === "semicolons") {
            await runConsoleCommand(page, [
                "1; 2",
                "x <- 9L; invisible(x)",
                "x"
            ].join("\n"));
            rows = await assertTranscriptRows(page, [
                "> 1; 2",
                "[1] 1",
                "[1] 2",
                "> x <- 9L; invisible(x)",
                "> x",
                "[1] 9"
            ], name);
        }
        else if (name === "history") {
            const command = "history_parity_value <- 17L\nhistory_parity_value";

            await runConsoleCommand(page, command);
            rows = await assertTranscriptRows(page, [
                "> history_parity_value <- 17L",
                "> history_parity_value",
                "[1] 17"
            ], name);
            await page.keyboard.press("ArrowUp");
            assert.equal(
                await readConsoleInput(page),
                command,
                "History must recall the complete multiline submission."
            );
            await typeConsoleCommand(page, "");
        }
        else if (name === "messages") {
            const command = [
                "local({",
                "    emit <- function(text) {",
                "        condition <- structure(list(message = text, call = NULL),",
                '            class = c("packageStartupMessage", "message", "condition"))',
                "        withRestarts({",
                "            signalCondition(condition)",
                '            cat(conditionMessage(condition), "\\n", sep = "", file = stderr())',
                "        }, muffleMessage = function() NULL)",
                "    }",
                '    cat("before\\n")',
                '    emit("first")',
                '    emit("second")',
                '    suppressPackageStartupMessages(emit("hidden"))',
                '    message("base")',
                '    message("joined", appendLF = FALSE)',
                '    cat("-tail\\n")',
                '    signalCondition(simpleMessage("signal-only"))',
                '    cat("after\\n")',
                "})"
            ].join("\n");
            await runConsoleCommand(page, command);
            rows = await assertTranscriptRows(page, [
                ...command.split("\n").map((line, index) => (index === 0 ? "> " : "+ ") + line),
                "before",
                "first",
                "second",
                "base",
                "joined-tail",
                "after"
            ], name);
            const styledMessages = await page.evaluate(() => {
                return Array.from(document.querySelectorAll(
                    "#consoleTerminal [data-execution-id] > div"
                )).filter(block => block.style.borderLeftWidth).length;
            });
            assert.equal(styledMessages, 0,
                "Informational message output must retain ordinary console styling.");
        }
        else if (name === "package-methods") {
            const registration = 'base::registerS3method("head", "DFConsolePackage", function(x, ...) stop("fixture method must not run"), envir = asNamespace("utils"))';
            await runConsoleCommand(page, [
                registration,
                "DF_message_frame <- data.frame(value = 1:2)",
                "DF_message_frame$value[1L] <- 9L",
                "DF_message_frame$value"
            ].join("\n"));
            rows = await assertTranscriptRows(page, [
                "> " + registration,
                "> DF_message_frame <- data.frame(value = 1:2)",
                "> DF_message_frame$value[1L] <- 9L",
                "> DF_message_frame$value",
                "[1] 9 2"
            ], name);
        }
        else if (name === "error") {
            await runConsoleCommand(page, "11\nstop(\"console parity error\")\n99");
            const beforeRecovery = [
                "> 11",
                "[1] 11",
                '> stop("console parity error")',
                "Error: console parity error"
            ];

            await assertTranscriptRows(page, beforeRecovery, name);
            await runConsoleCommand(page, "12");
            rows = await assertTranscriptRows(page, [
                ...beforeRecovery,
                "> 12",
                "[1] 12"
            ], name + " recovery");
        }
        else if (name === "interrupt") {
            await typeConsoleCommand(page, "Sys.sleep(60)\n99");
            await page.keyboard.press("Enter");
            await page.waitForFunction(() => {
                const input = document.querySelector(
                    '#consoleTerminal [data-console-input-line="true"]'
                );
                const stop = document.getElementById("consoleToolbarStop");

                return input?.dataset.consoleInputCode === "Sys.sleep(60)"
                    && stop && !stop.disabled;
            }, undefined, { timeout: timeoutMs });
            await page.locator("#consoleToolbarStop").click();
            await waitForConsoleReady(page, timeoutMs);
            await assertTranscriptRows(page, ["> Sys.sleep(60)"], name);
            await runConsoleCommand(page, "13");
            rows = await assertTranscriptRows(page, [
                "> Sys.sleep(60)",
                "> 13",
                "[1] 13"
            ], name + " recovery");
        }

        const result = { name, rows };
        results.push(result);

        if (options.onCase) {
            await options.onCase(result);
        }
    }

    return results;
};


const runScriptSelectionParity = async function(
    consolePage,
    scriptSurface,
    options = {}
) {
    const timeoutMs = options.timeoutMs || 30000;
    const scriptPage = typeof scriptSurface.page === "function"
        ? scriptSurface.page()
        : scriptSurface;
    const modifier = process.platform === "darwin" ? "Meta" : "Control";

    if (options.clearConsole !== false) {
        await clearConsole(consolePage, timeoutMs);
    }
    else {
        await assertTranscriptRows(consolePage, [], "script-selection setup");
    }

    await scriptSurface.locator(".monaco-editor").last().click();
    await scriptPage.keyboard.press(modifier + "+A");
    await scriptPage.keyboard.press("Backspace");

    if (scriptPage.url().startsWith("http")) {
        await scriptPage.context().grantPermissions([
            "clipboard-read",
            "clipboard-write"
        ]);
    }

    await scriptSurface.evaluate((text) => navigator.clipboard.writeText(text), riversCommand);
    await scriptPage.keyboard.press(modifier + "+V");
    await scriptSurface.waitForFunction((expected) => {
        return window.monaco?.editor?.getEditors?.().some((editor) => {
            return editor.getValue({ preserveBOM: false, lineEnding: "\n" }) === expected;
        });
    }, riversCommand, { timeout: timeoutMs });
    await scriptPage.keyboard.press(modifier + "+A");
    await scriptSurface.waitForFunction((expected) => {
        return window.monaco?.editor?.getEditors?.().some((editor) => {
            const selection = editor.getSelection();

            return selection
                && editor.getModel()?.getValueInRange(selection, window.monaco.editor.EndOfLinePreference.LF) === expected;
        });
    }, riversCommand, { timeout: timeoutMs });
    await scriptSurface.locator(".dm-script-btn-run").click();
    await consolePage.waitForFunction(() => {
        return Array.from(document.querySelectorAll(
            '#consoleTerminal [data-console-input-line="true"]'
        )).some((input) => input.dataset.consoleInputCode === "class(x)");
    }, undefined, { timeout: timeoutMs });

    // The final input is echoed before its request enters WebR. At that point
    // the prompt can still be ready from the previous statement, so readiness
    // alone does not establish that the selected batch has finished.
    await consolePage.waitForFunction(() => {
        return Array.from(document.querySelectorAll(
            "#consoleTerminal [data-execution-id] > div > div"
        )).some((output) => output.textContent === '[1] "integer"');
    }, undefined, { timeout: timeoutMs });
    await waitForConsoleReady(consolePage, timeoutMs);

    const rows = await assertTranscriptRows(
        consolePage,
        riversRows,
        "script-selection"
    );
    const result = { name: "script-selection", rows };

    if (options.onCase) {
        await options.onCase(result);
    }

    return result;
};


module.exports = {
    consoleCommandParityCases,
    clearConsoleForParity: clearConsole,
    readConsoleTranscriptRows,
    runConsoleCommandParity,
    runScriptSelectionParity
};
