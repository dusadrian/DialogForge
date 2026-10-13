"use strict";

const { assertDialogTargetEnabled, assertDialogControlState } = require("../support/dialog-interactions");

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const {
    assertDialogCommand,
    assertTranscriptContainsDialogCommand
} = require("../support/dialog-behavior-contract");
const {
    dialogQCATruthTableBehavior
} = require("../fixtures/product-dialog-behavior");
const { runConsoleCommand } = require("../support/console-interactions");


const projectRoot = path.resolve(__dirname, "../..");
const dialogQCARoot = path.resolve(projectRoot, "../DialogQCA");
const webDist = path.join(dialogQCARoot, "dist", "web");

process.env.DIALOGFORGE_DIST_DIR = webDist;
process.env.DIALOGFORGE_SOURCE_ROOT = projectRoot;

const serverModule = require(
    path.join(webDist, "scripts", "web-product-dev-server.js")
);


const listen = function(server) {
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            resolve(server.address().port);
        });
    });
};


const close = function(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
};


const request = function(port, pathname) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: "127.0.0.1",
            port,
            path: pathname,
            method: "GET"
        }, (response) => {
            const chunks = [];

            response.on("data", (chunk) => {
                chunks.push(chunk);
            });
            response.on("end", () => {
                resolve({
                    statusCode: response.statusCode,
                    body: Buffer.concat(chunks)
                });
            });
        });

        req.on("error", reject);
        req.end();
    });
};


const { openMenuItem } = require("../support/menu-interactions");


const waitForDialogReady = async function(page, dialogId) {
    const layerSelector =
        `.dialogforge-web-dialog-layer[data-dialog-id="${dialogId}"]`;

    await page.locator(layerSelector).waitFor({
        state: "visible",
        timeout: 30000
    });
    await page.locator(
        `${layerSelector} .dialogforge-web-dialog__frame`
    ).waitFor({
        state: "attached",
        timeout: 30000
    });
    try {
        await page.waitForFunction((expectedDialogId) => {
            const layer = document.querySelector(
                `.dialogforge-web-dialog-layer[data-dialog-id="${
                    CSS.escape(expectedDialogId)
                }"]`
            );

            return Boolean(
                layer
                && !document.body.classList.contains("console-cover-visible")
            );
        }, dialogId, {
            timeout: 10000
        });
    }
    catch (error) {
        const diagnostics = await page.evaluate((expectedDialogId) => {
            const frame = document.querySelector(
                `.dialogforge-web-dialog-layer[data-dialog-id="${
                    CSS.escape(expectedDialogId)
                }"] iframe`
            );

            return {
                coverVisible:
                    document.body.classList.contains("console-cover-visible"),
                coverMessage:
                    document.getElementById("consoleCoverMessage")?.textContent || "",
                frameAttached: Boolean(frame),
                frameText: frame?.contentDocument?.body?.innerText || "",
                frameReadyState: frame?.contentDocument?.readyState || "",
                frameScripts: Array.from(
                    frame?.contentDocument?.scripts || []
                ).map((script) => {
                    return script.src || script.textContent || "";
                }),
                profileModules: Array.isArray(
                    frame?.contentWindow?.dialogForgeProfileCustomJSModules
                )
                    ? frame.contentWindow.dialogForgeProfileCustomJSModules.length
                    : -1,
                hasDialogForge: Boolean(frame?.contentWindow?.dialogForge)
            };
        }, dialogId);

        throw new Error(
            `Dialog ${dialogId} did not become ready: ${
                JSON.stringify(diagnostics)
            }. ${error instanceof Error ? error.message : String(error)}`
        );
    }

    const frame = page.frameLocator(`${layerSelector} .dialogforge-web-dialog__frame`);
    const source = JSON.parse(fs.readFileSync(path.join(
        dialogQCARoot, "dialogs/r", dialogId, "dialog.json"
    ), "utf8"));

    for (const element of source.elements) {
        if (element.type === "Checkbox") {
            await assertDialogControlState(frame, element.nameid, {
                checked: element.isChecked === true
            });
        }
    }
    return frame;
};


const selectControl = async function(frame, name, value) {
    const row = frame.locator(
        `[data-control-name="${name}"] .container-item[data-value="${value}"], `
        + `[data-control-name="${name}"] .dm-choice-item[data-value="${value}"]`
    ).first();

    await row.waitFor({
        state: "visible",
        timeout: 30000
    });

    await assertDialogTargetEnabled(row, `${name}: ${value}`);
    if (await row.evaluate((node) => node.classList.contains("active"))) {
        return;
    }

    await row.click();
    await frame.locator(
        `[data-control-name="${name}"] .container-item.active[data-value="${value}"], `
        + `[data-control-name="${name}"] .dm-choice-item.active[data-value="${value}"]`
    ).first().waitFor({ state: "visible", timeout: 10000 });
};


const closeDialog = async function(page, dialogId) {
    const layerSelector =
        `.dialogforge-web-dialog-layer[data-dialog-id="${dialogId}"]`;

    await page.locator(
        `${layerSelector} .dialogforge-web-dialog__close`
    ).click();
    await page.locator(layerSelector).waitFor({
        state: "hidden",
        timeout: 10000
    });
};


const assertServerContracts = async function(server, port) {
    const composition = await request(port, "/api/composition");
    const compositionJson = JSON.parse(composition.body.toString("utf8"));
    const runtime = await request(port, "/api/product-dialog-runtime.js");
    const runtimeSource = runtime.body.toString("utf8");

    assert.strictEqual(composition.statusCode, 200);
    assert.strictEqual(compositionJson.product.id, "DialogQCA");
    assert.strictEqual(compositionJson.runtime.id, "webr");
    assert.deepStrictEqual(
        compositionJson.productDialogs.map((dialog) => dialog.id),
        [
            "calibrate",
            "recode",
            "truthTable",
            "incoherent",
            "minimize",
            "xyplot",
            "venn",
            "fiss"
        ]
    );
    assert.strictEqual(runtime.statusCode, 200);
    assert.ok(runtimeSource.includes("qca.initializeCalibrateDialog"));
    assert.ok(runtimeSource.includes("dialogForgeProfileCustomJSModules"));

    void server;
};


const assertRenderedContracts = async function(port) {
    const browser = await chromium.launch();

    try {
        const page = await browser.newPage({
            viewport: {
                width: 1280,
                height: 860
            }
        });
        const failures = [];

        page.on("pageerror", (error) => {
            failures.push(`pageerror: ${error.message}`);
            console.error(`DialogQCA browser pageerror: ${error.message}`);
        });
        page.on("console", (message) => {
            if (message.type() === "error") {
                failures.push(`console: ${message.text()}`);
                console.error(`DialogQCA browser console: ${message.text()}`);
            }
        });
        page.on("response", response => {
            if (response.status() >= 400) console.error(`DialogQCA browser HTTP: ${response.status()} ${response.url()}`);
        });
        page.on("requestfailed", (request) => {
            failures.push(
                `requestfailed: ${request.url()} ${
                    request.failure()?.errorText || ""
                }`
            );
        });

        await page.goto(`http://127.0.0.1:${port}/`, {
            waitUntil: "domcontentloaded"
        });
        await page.waitForFunction(() => {
            return window.dialogForgeWebConsole?.session?.getSessionPhase?.()
                === "ready"
                && !document.body.classList.contains("console-cover-visible");
        }, null, {
            timeout: 90000
        });
        assert.strictEqual(await page.title(), "DialogQCA Web");
        await page.locator("#webMenuBar .web-menu-button", {
            hasText: "Data"
        }).waitFor({
            state: "visible"
        });
        await page.locator("#webMenuBar .web-menu-button", {
            hasText: "Analyze"
        }).waitFor({
            state: "visible"
        });
        await page.locator("#webMenuBar .web-menu-button", {
            hasText: "Graphs"
        }).waitFor({
            state: "visible"
        });

        await page.locator('#consoleTerminal [data-console-input-line="true"]').filter({
            hasText: "library(QCA)"
        }).waitFor({ state: "visible", timeout: 30000 });
        await page.waitForFunction(() => {
            return window.dialogForgeWebConsole?.session?.getSessionPhase?.() === "ready"
                && !document.body.classList.contains("console-runtime-busy");
        }, undefined, { timeout: 30000 });
        await runConsoleCommand(page, "data(LR)");
        await runConsoleCommand(page, "data(LF)");
        await page.locator(
            '#workspaceSummary [data-workspace-variable="LR"]'
        ).waitFor({
            timeout: 30000
        });
        await page.locator(
            '#workspaceSummary [data-workspace-variable="LF"]'
        ).waitFor({
            timeout: 30000
        });
        const loadedLF = await page.locator(
            '[data-workspace-variable-row="LF"]'
        ).textContent();
        assert.ok(
            loadedLF.includes("18 rows x 6 columns"),
            `data(LF) did not appear as a dataset: ${loadedLF}`
        );

        await openMenuItem(page, "Calibrate");
        const calibrate = await waitForDialogReady(page, "calibrate");

        await selectControl(calibrate, "c_datasets", "LR");
        await selectControl(calibrate, "c_variables", "DEV");
        await page.locator("#command", {
            hasText: "calibrate(DEV"
        }).waitFor({
            timeout: 30000
        });
        try {
            await calibrate.locator(
                '[data-control-name="plot_calibrate"] svg circle'
            ).first().waitFor({
                state: "visible",
                timeout: 30000
            });
        }
        catch (error) {
            const diagnostics = await calibrate.locator("body").evaluate(() => {
                const plot = document.querySelector(
                    '[data-control-name="plot_calibrate"]'
                );
                const dataset = document.querySelector(
                    '[data-control-name="c_datasets"]'
                );
                const variables = document.querySelector(
                    '[data-control-name="c_variables"]'
                );

                return {
                    plot: plot?.outerHTML || "",
                    dataset: dataset?.outerHTML || "",
                    variables: variables?.outerHTML || "",
                    profileModules: Array.isArray(
                        globalThis.dialogForgeProfileCustomJSModules
                    )
                        ? globalThis.dialogForgeProfileCustomJSModules.map(
                            (module) => Object.keys(module || {})
                        )
                        : []
                };
            });

            throw new Error(
                `Calibrate preview did not render: ${
                    JSON.stringify(diagnostics)
                }. ${error instanceof Error ? error.message : String(error)}`
            );
        }
        assert.strictEqual(
            await calibrate.locator(
                '[data-control-name="plot_calibrate"] svg circle'
            ).count(),
            18
        );
        await closeDialog(page, "calibrate");

        await openMenuItem(page, "Truth table");
        const truthTable = await waitForDialogReady(page, "truthTable");

        for (const selection of dialogQCATruthTableBehavior.selections) {
            await selectControl(
                truthTable,
                selection.name,
                selection.value
            );
            if (selection.name === "c_datasets") {
                assert.deepStrictEqual(
                    await truthTable.locator(
                        '[data-control-name="c_conditions"] .container-item'
                    ).evaluateAll((items) => {
                        return items.map((item) => item.getAttribute("data-value"));
                    }),
                    ["DEV", "URB", "LIT", "IND", "STB", "SURV"]
                );
            }
        }
        try {
            await page.waitForFunction((expectedCommand) => {
                return document.getElementById("command")?.dataset
                    .consoleSyntaxValue === expectedCommand;
            }, dialogQCATruthTableBehavior.command, {
                timeout: 30000
            });
        }
        catch (error) {
            const diagnostics = await page.evaluate(() => {
                const frame = document.querySelector(
                    '.dialogforge-web-dialog-layer[data-dialog-id="truthTable"] iframe'
                );
                const frameDocument = frame?.contentDocument;

                return {
                    command: document.getElementById("command")?.dataset
                        .consoleSyntaxValue || "",
                    outcome: Array.from(frameDocument?.querySelectorAll(
                        '[data-control-name="c_outcome"] .active'
                    ) || []).map((node) => node.getAttribute("data-value")),
                    conditions: Array.from(frameDocument?.querySelectorAll(
                        '[data-control-name="c_conditions"] .active'
                    ) || []).map((node) => node.getAttribute("data-value"))
                };
            });

            throw new Error(
                `Truth table preview did not match the shared command: ${
                    JSON.stringify(diagnostics)
                }. ${error instanceof Error ? error.message : String(error)}`
            );
        }
        assertDialogCommand(
            await page.locator("#command").getAttribute(
                "data-console-syntax-value"
            ),
            dialogQCATruthTableBehavior.command,
            "DialogQCA browser preview"
        );
        await truthTable.locator(".smart-button", {
            hasText: "Run"
        }).click();
        try {
            await page.waitForFunction((expectedCommand) => {
                const inputCommands = Array.from(document.querySelectorAll(
                    "#consoleTerminal [data-console-input-line=\"true\"]"
                )).map((line) => {
                    return String(line.dataset.consoleInputCode || "")
                        .replace(/\r\n/g, "\n")
                        .replace(/\r/g, "\n")
                        .replace(/\n+$/g, "");
                });
                const expectedLines = expectedCommand.split("\n");

                return inputCommands.some((_, index) => {
                    return expectedLines.every((line, offset) => {
                        return inputCommands[index + offset] === line;
                    });
                });
            }, dialogQCATruthTableBehavior.command, {
                timeout: 30000
            });
        }
        catch (error) {
            const diagnostics = await page.evaluate(() => {
                return {
                    terminal:
                        document.getElementById("consoleTerminal")?.innerText
                        || "",
                    command:
                        document.getElementById("command")?.innerText
                        || "",
                    inputCommands: Array.from(document.querySelectorAll(
                        "#consoleTerminal [data-console-input-line=\"true\"]"
                    )).map((line) => {
                        return String(line.dataset.consoleInputCode || "");
                    }),
                    coverVisible:
                        document.body.classList.contains("console-cover-visible"),
                    coverMessage:
                        document.getElementById("consoleCoverMessage")?.textContent
                        || ""
                };
            });

            throw new Error(
                `Truth table command did not complete: ${
                    JSON.stringify(diagnostics)
                }. ${error instanceof Error ? error.message : String(error)}`
            );
        }
        assertTranscriptContainsDialogCommand(
            await page.evaluate(() => {
                return Array.from(document.querySelectorAll(
                    "#consoleTerminal [data-console-input-line=\"true\"]"
                )).map((line) => {
                    return String(line.dataset.consoleInputCode || "");
                });
            }),
            dialogQCATruthTableBehavior.command,
            "DialogQCA browser transcript"
        );
        await page.locator(
            '.dialogforge-web-dialog-layer[data-dialog-id="truthTable"]'
        ).waitFor({
            state: "hidden",
            timeout: 30000
        });

        await openMenuItem(page, "XY plot");
        const xyplot = await waitForDialogReady(page, "xyplot");

        await selectControl(xyplot, "c_datasets", "LF");
        await selectControl(xyplot, "c_x", "DEV");
        await selectControl(xyplot, "c_y", "URB");
        const xyplotCanvas = xyplot.locator(
            '[data-control-name="plot_xy"] canvas[data-point-count]'
        );
        await xyplotCanvas.waitFor({
            state: "visible",
            timeout: 30000
        });
        await xyplotCanvas.evaluate((canvas, expectedCount) => {
            return new Promise((resolve, reject) => {
                const startedAt = Date.now();
                const check = function() {
                    if (
                        canvas.dataset.loading === "false"
                        && Number(canvas.dataset.pointCount || 0)
                            === expectedCount
                    ) {
                        resolve(undefined);
                        return;
                    }
                    if (Date.now() - startedAt >= 30000) {
                        reject(new Error(
                            `XY plot canvas did not reach ${expectedCount} points.`
                        ));
                        return;
                    }
                    requestAnimationFrame(check);
                };

                check();
            });
        }, 18);
        assert.strictEqual(
            Number(await xyplotCanvas.getAttribute("data-point-count")),
            18
        );
        await closeDialog(page, "xyplot");

        const smokeDialogs = [
            { id: "recode", label: "Recode conditions" },
            { id: "incoherent", label: "Incoherent configurations" },
            { id: "minimize", label: "Minimize" },
            { id: "venn", label: "Venn diagram" },
            { id: "fiss", label: "Fiss chart" }
        ];

        for (const dialog of smokeDialogs) {
            await openMenuItem(page, dialog.label);
            const frame = await waitForDialogReady(page, dialog.id);

            await frame.locator("#paper .dm-el").first().waitFor({
                state: "visible",
                timeout: 30000
            });
            await closeDialog(page, dialog.id);
        }

        assert.deepStrictEqual(failures, []);
    }
    finally {
        await browser.close();
    }
};


void (async function() {
    const server = serverModule.createWebProductDevServer({
        productPath: dialogQCARoot
    });
    const port = await listen(server);

    try {
        await assertServerContracts(server, port);
        await assertRenderedContracts(port);
        console.log("Browser-runnable DialogQCA web entry verified.");
    }
    finally {
        await close(server);
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
