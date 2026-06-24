"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const process = require("node:process");
const {
    execFileSync,
    spawnSync
} = require("node:child_process");
const { _electron } = require("playwright");
const {
    findMainWindowPage,
    productLaunchArgs
} = require("./product-launch");


const projectRoot = process.cwd();
const mainEntry = path.join(
    projectRoot,
    "dist/scripts/electron-main.js"
);
const productPath = String(
    process.env.DIALOGFORGE_ELECTRON_PRODUCT_PATH || ""
).trim();
const dialogId = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_ID || ""
).trim();
const requiredPackage = String(
    process.env.DIALOGFORGE_ELECTRON_REQUIRED_PACKAGE || ""
).trim();
const setupCommand = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_SETUP_COMMAND || ""
).trim();
const expectedText = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_EXPECTED_TEXT || ""
).trim();
const expectedWorkspaceObject = String(
    process.env.DIALOGFORGE_ELECTRON_WORKSPACE_OBJECT || ""
).trim();
const selectedDataset = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_SELECT_DATASET || ""
).trim();
const selectedVariable = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_SELECT_VARIABLE || ""
).trim();
const expectedPlotPoints = Math.max(
    0,
    Number(process.env.DIALOGFORGE_ELECTRON_DIALOG_EXPECTED_PLOT_POINTS) || 0
);
const minimumControls = Math.max(
    1,
    Number(process.env.DIALOGFORGE_ELECTRON_DIALOG_MIN_CONTROLS) || 1
);
const runDialogCommand = process.env.DIALOGFORGE_ELECTRON_DIALOG_RUN === "1";
const requiredAttachedPackages = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_ATTACHED_PACKAGES || ""
).split(",").map((name) => name.trim()).filter(Boolean);
const expectedHistoryText = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_HISTORY_TEXT || ""
).trim();
const maximumRunLatencyMs = Math.max(
    0,
    Number(process.env.DIALOGFORGE_ELECTRON_DIALOG_MAX_RUN_LATENCY_MS) || 0
);
const expectedActiveDataset = String(
    process.env.DIALOGFORGE_ELECTRON_EXPECT_ACTIVE_DATASET || ""
).trim();
const secondDialogId = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_SECOND_ID || ""
).trim();
const maximumPopulateLatencyMs = Math.max(
    0,
    Number(
        process.env.DIALOGFORGE_ELECTRON_DIALOG_MAX_POPULATE_LATENCY_MS
    ) || 0
);
const maximumReopenLatencyMs = Math.max(
    0,
    Number(
        process.env.DIALOGFORGE_ELECTRON_DIALOG_MAX_REOPEN_LATENCY_MS
    ) || 0
);


const descendantProcessIds = function(parentPid) {
    if (process.platform === "win32") {
        return [];
    }

    const output = execFileSync(
        "ps",
        ["-axo", "pid=,ppid="],
        {
            encoding: "utf8"
        }
    );
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


const stopProcess = function(pid) {
    try {
        process.kill(pid, "SIGKILL");
    }
    catch {
        // The process already exited.
    }
};


const assertConfiguration = function() {
    assert.ok(
        productPath,
        "DIALOGFORGE_ELECTRON_PRODUCT_PATH must select an external product."
    );
    assert.ok(
        dialogId,
        "DIALOGFORGE_ELECTRON_DIALOG_ID must select a product dialog."
    );
};


const stageProduct = function() {
    const result = spawnSync(
        process.execPath,
        [
            path.join(
                projectRoot,
                "dist/scripts/package-product.js"
            ),
            "--product-path",
            productPath,
            "--stage-only"
        ],
        {
            cwd: projectRoot,
            env: process.env,
            stdio: "inherit"
        }
    );

    if (result.error) {
        throw result.error;
    }

    assert.equal(result.status, 0, "Product staging failed.");
};


const waitForMainWindow = async function(app) {
    const page = await findMainWindowPage(app);

    await page.waitForFunction(() => {
        const input = document.getElementById("visibleCommandInput");

        return document.body.dataset.dialogForgeReady === "1"
            && Boolean(input?.dialogForgeConsoleInputView);
    }, undefined, {
        timeout: 30000
    });
    await page.waitForFunction(() => {
        const prompts = Array.from(document.querySelectorAll(
            '#consoleTerminal [data-session-phase="ready"]'
        ));
        const prompt = prompts[prompts.length - 1];

        return Boolean(
            prompt
            && prompt.dataset.runtimeBusy !== "true"
            && prompt.style.display !== "none"
        );
    }, undefined, {
        timeout: 30000
    });

    return page;
};


const waitForRequiredPackage = async function(page) {
    if (!requiredPackage) {
        return;
    }

    const deadline = Date.now() + 30000;
    const query = `if (${JSON.stringify(`package:${requiredPackage}`)} %in% search()) "loaded" else "missing"`;
    let lastResult = null;

    while (Date.now() < deadline) {
        const result = await page.evaluate(async ({ packageQuery }) => {
            return window.dialogForge.executeInvisibleQuery({
                query: packageQuery,
                source: "electron.product-dialog.package-readiness"
            });
        }, {
            packageQuery: query
        });
        lastResult = result;

        if (
            result.status === "ready"
            && JSON.stringify(result.value).includes("loaded")
        ) {
            return;
        }

        await page.waitForTimeout(200);
    }

    throw new Error(
        `Timed out waiting for the ${requiredPackage} package to load. `
        + `Last query result: ${JSON.stringify(lastResult)}.`
    );
};


const submitConsoleCommand = async function(page, command) {
    await page.evaluate(async (commandText) => {
        const input = document.getElementById("visibleCommandInput");
        const view = input?.dialogForgeConsoleInputView;

        if (!view) {
            throw new Error("DialogForge console input is not ready.");
        }

        view.setText(commandText);
        view.focus();
        await view.submit();
    }, command);
};


const waitForWorkspaceObject = async function(page, objectName) {
    if (!objectName) {
        return;
    }

    const deadline = Date.now() + 30000;

    while (Date.now() < deadline) {
        const workspace = await page.evaluate(() => {
            return window.dialogForge.refreshWorkspace();
        });
        const found = workspace.objects.some((object) => {
            return object.name === objectName;
        });

        if (found) {
            return;
        }

        await page.waitForTimeout(200);
    }

    throw new Error(
        `Timed out waiting for workspace object ${JSON.stringify(objectName)}.`
    );
};


const openDialog = async function(app, mainPage, targetDialogId = dialogId) {
    const windowPromise = app.waitForEvent("window", {
        timeout: 10000
    });
    const result = await mainPage.evaluate(async (targetDialogId) => {
        return window.dialogForge.openProductDialog(targetDialogId);
    }, targetDialogId);

    assert.equal(result.status, "opened");

    return windowPromise;
};


const waitForDependencyCommands = async function(mainPage) {
    if (requiredAttachedPackages.length === 0) {
        return;
    }

    await mainPage.waitForFunction((packages) => {
        const transcript = String(
            document.getElementById("consoleTerminal")?.innerText || ""
        );

        return packages.every((packageName) => {
            return transcript.includes(`> library(${packageName})`);
        });
    }, requiredAttachedPackages, {
        timeout: 30000
    });

    const transcript = await transcriptText(mainPage);

    assert.ok(
        !transcript.includes("library(admisc; declared)"),
        "Dialog dependencies were combined into a nonexistent package name."
    );

    await mainPage.waitForFunction(async (packages) => {
        const history = await window.dialogForge.readConsoleHistory({});

        return packages.every((packageName) => {
            return history.includes(`library(${packageName})`);
        });
    }, requiredAttachedPackages, {
        timeout: 10000,
        polling: 100
    });
};


const verifyActiveDataset = async function(mainPage, dialogPage) {
    if (!expectedActiveDataset) {
        return;
    }

    await dialogPage.waitForFunction((datasetName) => {
        const row = document.querySelector(
            `.container-item[data-value=${JSON.stringify(datasetName)}]`
        );

        return row?.classList.contains("active") === true;
    }, expectedActiveDataset, {
        timeout: 30000
    });

    const active = await mainPage.evaluate(() => {
        return window.dialogForge.getActiveDataset();
    });

    assert.equal(
        active.objectName,
        expectedActiveDataset,
        "Opening a product dialog changed the active workspace dataset."
    );
};


const verifyDependenciesStayLoaded = async function(app, mainPage) {
    if (!secondDialogId || requiredAttachedPackages.length === 0) {
        return;
    }

    const before = await transcriptText(mainPage);
    const countsBefore = requiredAttachedPackages.map((packageName) => {
        return (before.match(new RegExp(
            `> library\\(${packageName}\\)`,
            "g"
        )) || []).length;
    });
    const secondDialogPage = await openDialog(
        app,
        mainPage,
        secondDialogId
    );

    await secondDialogPage.waitForLoadState("domcontentloaded");
    await secondDialogPage.waitForSelector(".dm-el", {
        timeout: 30000
    });
    await mainPage.waitForTimeout(500);

    const after = await transcriptText(mainPage);

    requiredAttachedPackages.forEach((packageName, index) => {
        const countAfter = (after.match(new RegExp(
            `> library\\(${packageName}\\)`,
            "g"
        )) || []).length;

        assert.equal(
            countAfter,
            countsBefore[index],
            `${packageName} was reloaded when a second dialog opened.`
        );
    });
};


const verifyDialogReopen = async function(app, mainPage, dialogPage) {
    if (!maximumReopenLatencyMs) {
        return;
    }

    await dialogPage.close();
    const startedAt = Date.now();
    const reopenedPage = await openDialog(app, mainPage);

    await verifyDialog(reopenedPage);
    const latencyMs = Date.now() - startedAt;

    if (latencyMs > maximumReopenLatencyMs) {
        throw new Error(
            `Dialog repopulated after ${latencyMs}ms; expected at most ${maximumReopenLatencyMs}ms.`
        );
    }

    console.log(`Product dialog ${dialogId} repopulated in ${latencyMs}ms.`);
};


const verifyDialog = async function(dialogPage) {
    await dialogPage.waitForLoadState("domcontentloaded");
    try {
        await dialogPage.waitForFunction(({ count, text, workspaceObject }) => {
            const paper = document.getElementById("paper");
            const bodyText = String(paper?.innerText || "");

            return Boolean(
                paper
                && paper.querySelectorAll(".dm-el").length >= count
                && (!text || bodyText.includes(text))
                && (!workspaceObject || bodyText.includes(workspaceObject))
            );
        }, {
            count: minimumControls,
            text: expectedText,
            workspaceObject: expectedWorkspaceObject
        }, {
            timeout: 30000
        });
    }
    catch (error) {
        const state = await dialogPage.evaluate(() => {
            const paper = document.getElementById("paper");

            return {
                controls: paper?.querySelectorAll(".dm-el").length || 0,
                text: String(paper?.innerText || ""),
                containers: Array.from(
                    document.querySelectorAll(".container-item")
                ).map((item) => {
                    return {
                        value: item.getAttribute("data-value"),
                        text: String(item.textContent || "").trim()
                    };
                })
            };
        });

        throw new Error(
            "Timed out waiting for product dialog content. "
            + `State: ${JSON.stringify(state)}. `
            + `Cause: ${String(error && error.message || error)}`
        );
    }

    const state = await dialogPage.evaluate(() => {
        const paper = document.getElementById("paper");

        return {
            controls: paper?.querySelectorAll(".dm-el").length || 0,
            text: String(paper?.innerText || "")
        };
    });

    assert.ok(
        state.controls >= minimumControls,
        `Expected at least ${minimumControls} dialog controls.`
    );
    assert.ok(state.text.trim(), "Product dialog rendered no visible content.");
};


const clickContainerItem = async function(dialogPage, value) {
    if (!value) {
        return;
    }

    const selector = `.container-item[data-value=${JSON.stringify(value)}]`;

    await dialogPage.waitForSelector(selector, {
        timeout: 30000
    });
    await dialogPage.click(selector);
};


const waitForAttachedPackages = async function(mainPage) {
    if (requiredAttachedPackages.length === 0) {
        return;
    }

    await mainPage.waitForFunction(async (packages) => {
        const quoted = packages.map((name) => JSON.stringify(`package:${name}`));
        const result = await window.dialogForge.executeInvisibleQuery({
            query: `all(c(${quoted.join(", ")}) %in% search())`,
            source: "electron.product-dialog.attached-packages"
        });

        return result.status === "ready" && result.value === true;
    }, requiredAttachedPackages, {
        timeout: 30000,
        polling: 200
    });
};


const transcriptText = function(mainPage) {
    return mainPage.evaluate(() => {
        return String(document.getElementById("consoleTerminal")?.innerText || "");
    });
};


const verifyRunCommand = async function(mainPage, dialogPage) {
    if (!runDialogCommand) {
        return;
    }

    await waitForAttachedPackages(mainPage);
    const before = await transcriptText(mainPage);
    const libraryCountBefore = (before.match(/> library\(/g) || []).length;
    const startedAt = Date.now();

    await dialogPage.locator(".dm-button .smart-button").filter({
        hasText: /^Run$/
    }).click();
    await mainPage.waitForFunction((historyText) => {
        return String(document.getElementById("consoleTerminal")?.innerText || "")
            .includes(historyText);
    }, expectedHistoryText, {
        timeout: 30000
    });

    const latencyMs = Date.now() - startedAt;

    if (maximumRunLatencyMs && latencyMs > maximumRunLatencyMs) {
        throw new Error(
            `Dialog command appeared after ${latencyMs}ms; expected at most ${maximumRunLatencyMs}ms.`
        );
    }

    const after = await transcriptText(mainPage);
    const libraryCountAfter = (after.match(/> library\(/g) || []).length;

    assert.equal(
        libraryCountAfter,
        libraryCountBefore,
        "Run reloaded dialog dependencies instead of using the packages attached at dialog creation. "
        + `Before: ${JSON.stringify(before)}. After: ${JSON.stringify(after)}.`
    );
    await mainPage.waitForFunction(() => {
        const rows = Array.from(document.querySelectorAll(
            "[data-console-transcript-row] div"
        ));

        return rows.some((row) => /^\s+fre\s+rel\s+per\s+cpd/.test(
            String(row.textContent || "")
        ));
    }, undefined, {
        timeout: 30000
    });

    const historyValue = await mainPage.evaluate(() => {
        const input = document.getElementById("visibleCommandInput");
        const view = input?.dialogForgeConsoleInputView;

        view.setText("");
        view.focus();
        view.historyPrevious();
        return view.getText();
    });

    assert.ok(
        historyValue.includes(expectedHistoryText),
        `Dialog command was not added to console history: ${JSON.stringify(historyValue)}.`
    );
};


const verifyDialogInteraction = async function(dialogPage) {
    await clickContainerItem(dialogPage, selectedDataset);
    await clickContainerItem(dialogPage, selectedVariable);

    if (!expectedPlotPoints) {
        return;
    }

    await dialogPage.waitForFunction((minimumPoints) => {
        const points = document.querySelectorAll(
            ".dm-plot .dm-plot-surface svg circle"
        );

        return points.length >= minimumPoints;
    }, expectedPlotPoints, {
        timeout: 30000
    });
};


const closeElectronApp = async function(
    app,
    appPid,
    launchedProcessIds
) {
    let closed = false;

    await Promise.race([
        app.close().then(() => {
            closed = true;
        }),
        new Promise((resolve) => {
            setTimeout(resolve, 5000);
        })
    ]);

    if (!closed && app.process().exitCode === null) {
        if (process.platform === "win32") {
            spawnSync(
                "taskkill",
                ["/pid", String(appPid), "/t", "/f"],
                {
                    stdio: "ignore"
                }
            );
        }
        else {
            stopProcess(appPid);
        }
    }

    launchedProcessIds.reverse().forEach(stopProcess);
};


const run = async function() {
    assertConfiguration();
    stageProduct();

    const testUserDataPath = path.join(
        os.tmpdir(),
        `dialogforge-product-dialog-${process.pid}`
    );
    const rendererErrors = [];
    const electronExecutable = require("electron");
    const app = await _electron.launch({
        executablePath: electronExecutable,
        args: productLaunchArgs(mainEntry),
        cwd: projectRoot,
        env: {
            ...process.env,
            DIALOGFORGE_TEST_USER_DATA_PATH: testUserDataPath
        }
    });
    const appPid = app.process().pid;

    assert.ok(appPid, "Playwright did not expose the Electron process id.");

    app.on("window", (page) => {
        page.on("pageerror", (error) => {
            rendererErrors.push(String(error.stack || error));
        });
        page.on("console", (message) => {
            if (message.type() === "error") {
                rendererErrors.push(message.text());
            }
        });
    });

    try {
        const mainPage = await waitForMainWindow(app);

        await waitForRequiredPackage(mainPage);

        if (setupCommand) {
            await submitConsoleCommand(mainPage, setupCommand);
        }

        await waitForWorkspaceObject(
            mainPage,
            expectedWorkspaceObject
        );

        if (expectedActiveDataset) {
            await mainPage.evaluate(async (datasetName) => {
                await window.dialogForge.setActiveDataset(datasetName);
            }, expectedActiveDataset);
        }

        const populateStartedAt = Date.now();
        const dialogPage = await openDialog(app, mainPage);

        await verifyDialog(dialogPage);
        const populateLatencyMs = Date.now() - populateStartedAt;

        if (
            maximumPopulateLatencyMs
            && populateLatencyMs > maximumPopulateLatencyMs
        ) {
            throw new Error(
                `Dialog populated after ${populateLatencyMs}ms; expected at most ${maximumPopulateLatencyMs}ms.`
            );
        }
        await waitForDependencyCommands(mainPage);
        await verifyActiveDataset(mainPage, dialogPage);
        await verifyDialogInteraction(dialogPage);
        await verifyRunCommand(mainPage, dialogPage);
        await verifyDialogReopen(app, mainPage, dialogPage);
        await verifyDependenciesStayLoaded(app, mainPage);
        assert.deepEqual(
            rendererErrors,
            [],
            "Product dialog emitted renderer errors."
        );

        console.log(
            `Product dialog ${dialogId} populated in ${populateLatencyMs}ms and completed successfully in Playwright.`
        );
    }
    finally {
        const launchedProcessIds = descendantProcessIds(appPid);

        await closeElectronApp(app, appPid, launchedProcessIds);
        fs.rmSync(testUserDataPath, {
            recursive: true,
            force: true
        });
    }
};


void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
