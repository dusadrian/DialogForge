"use strict";

const { assertDialogTargetEnabled } = require("../support/dialog-interactions");

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
const {
    assertDialogCommand,
    assertTranscriptContainsDialogCommand
} = require("../support/dialog-behavior-contract");
const { runConsoleCommand } = require("../support/console-interactions");


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
const expectedWorkspaceDataset = JSON.parse(
    process.env.DIALOGFORGE_ELECTRON_WORKSPACE_DATASET || "null"
);
const selectedDataset = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_SELECT_DATASET || ""
).trim();
const selectedVariable = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_SELECT_VARIABLE || ""
).trim();
const selectedX = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_SELECT_X || ""
).trim();
const selectedY = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_SELECT_Y || ""
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
const expectedCommand = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_EXPECTED_COMMAND || ""
).trim();
const expectedRunOutputText = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_EXPECTED_OUTPUT || ""
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
const dialogInputValues = (() => {
    const raw = String(
        process.env.DIALOGFORGE_ELECTRON_DIALOG_INPUT_VALUES || ""
    ).trim();

    if (!raw) {
        return {};
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(
            "DIALOGFORGE_ELECTRON_DIALOG_INPUT_VALUES must be a JSON object."
        );
    }

    return Object.fromEntries(Object.entries(parsed).map(([name, value]) => {
        return [String(name), String(value ?? "")];
    }));
})();
const dialogSelections = (() => {
    const raw = String(
        process.env.DIALOGFORGE_ELECTRON_DIALOG_SELECTIONS || ""
    ).trim();

    if (!raw) {
        return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
        throw new Error(
            "DIALOGFORGE_ELECTRON_DIALOG_SELECTIONS must be a JSON array."
        );
    }

    return parsed.map((selection) => {
        if (!selection || typeof selection !== "object") {
            throw new Error(
                "Each dialog selection must contain a control name and value."
            );
        }

        return {
            name: String(selection.name || "").trim(),
            value: String(selection.value || "").trim()
        };
    });
})();
const minimumDistinctPlotY = Math.max(
    0,
    Number(process.env.DIALOGFORGE_ELECTRON_DIALOG_MIN_DISTINCT_PLOT_Y) || 0
);
const resizeWidth = Math.max(
    0,
    Number(process.env.DIALOGFORGE_ELECTRON_DIALOG_RESIZE_WIDTH) || 0
);
const resizeHeight = Math.max(
    0,
    Number(process.env.DIALOGFORGE_ELECTRON_DIALOG_RESIZE_HEIGHT) || 0
);
const growingControl = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_GROWING_CONTROL || ""
).trim();
const movingControls = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_MOVING_CONTROLS || ""
).split(",").map((name) => name.trim()).filter(Boolean);
const staticControls = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_STATIC_CONTROLS || ""
).split(",").map((name) => name.trim()).filter(Boolean);
const squarePlotControl = String(
    process.env.DIALOGFORGE_ELECTRON_DIALOG_SQUARE_PLOT || ""
).trim();


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

    await page.locator('#consoleTerminal [data-console-input-line="true"]').filter({
        hasText: `library(${requiredPackage})`
    }).waitFor({ state: "visible", timeout: 30000 });
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


const verifyWorkspaceDataset = async function(page) {
    if (!expectedWorkspaceDataset) {
        return;
    }

    const workspace = await page.evaluate(() => {
        return window.dialogForge.refreshWorkspace();
    });
    const dataset = workspace.objects.find((object) => {
        return object.name === expectedWorkspaceObject;
    });

    assert.ok(dataset, `${expectedWorkspaceObject} is missing from the workspace.`);
    assert.equal(
        dataset.kind,
        "table",
        `Package dataset was not recognized as a table: ${JSON.stringify(dataset)}`
    );
    assert.equal(dataset.rows, expectedWorkspaceDataset.rows);
    assert.deepEqual(dataset.columns, expectedWorkspaceDataset.columns);

    const row = page.locator(
        `[data-workspace-variable-row=${JSON.stringify(expectedWorkspaceObject)}]`
    );
    if (await page.evaluate(() => {
        return document.body.classList.contains("workspace-pane-hidden");
    })) {
        await page.locator("#workspacePaneToggle").click();
    }
    await row.waitFor({ state: "visible", timeout: 10000 });
    assert.ok(
        (await row.textContent()).includes(
            `${dataset.rows} rows x ${dataset.columns.length} columns`
        ),
        "The workspace pane did not show the package dataset dimensions."
    );

    const inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll(
            '#consoleTerminal [data-console-input-line="true"]'
        )).map((line) => String(line.dataset.consoleInputCode || ""));
    });
    assertTranscriptContainsDialogCommand(inputs, setupCommand, "Dataset loading");
    const history = await page.evaluate(() => {
        return window.dialogForge.readConsoleHistory({});
    });
    assert.ok(history.includes(setupCommand), "Dataset loading changed console history.");
};


const verifyDatasetColumns = async function(dialogPage) {
    if (!expectedWorkspaceDataset) {
        return;
    }

    await dialogPage.waitForFunction((columns) => {
        return columns.every((column) => {
            return Array.from(document.querySelectorAll(
                '[data-control-name="c_conditions"] .container-item'
            )).some((item) => item.getAttribute("data-value") === column);
        });
    }, expectedWorkspaceDataset.columns, { timeout: 10000 });
};


const openDialog = async function(app, mainPage, targetDialogId = dialogId) {
    const windowPromise = app.waitForEvent("window", {
        timeout: 10000
    });
    const findMenuItem = function(items) {
        for (const item of items) {
            if (item.dialog === targetDialogId) {
                return item;
            }
            const child = findMenuItem(item.items || []);
            if (child) {
                return child;
            }
        }
        return null;
    };
    const definition = findMenuItem(JSON.parse(fs.readFileSync(
        path.join(productPath, "menu/menu.json"), "utf8"
    )));
    assert.ok(definition, `No product menu opens ${targetDialogId}.`);
    await app.evaluate(({ Menu }, menuId) => {
        const item = Menu.getApplicationMenu()?.getMenuItemById(menuId);
        if (!item || !item.enabled || typeof item.click !== "function") {
            throw new Error(`Product menu item ${menuId} is unavailable.`);
        }
        item.click();
    }, definition.id);

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


const clickContainerItem = async function(dialogPage, value, controlName = "") {
    if (!value) {
        return;
    }

    const selector = controlName
        ? `.dm-el[data-control-name=${JSON.stringify(controlName)}] .container-item[data-value=${JSON.stringify(value)}]`
        : `.container-item[data-value=${JSON.stringify(value)}]`;

    const item = dialogPage.locator(selector).first();

    await item.waitFor({
        state: "visible",
        timeout: 30000
    });

    await assertDialogTargetEnabled(item, `${controlName}: ${value}`);
    if (!await item.evaluate((node) => node.classList.contains("active"))) {
        await item.click();
    }
    await dialogPage.locator(selector + ".active").first().waitFor({
        state: "visible",
        timeout: 10000
    });
};


const setDialogInputs = async function(dialogPage) {
    for (const [name, value] of Object.entries(dialogInputValues)) {
        const input = dialogPage.locator(
            `.dm-el[data-control-name=${JSON.stringify(name)}] textarea`
        );

        await assertDialogTargetEnabled(input, name);
        await input.fill(value);
        await input.press("Tab");
    }
};


const readDialogLayout = async function(dialogPage) {
    return await dialogPage.evaluate(({ grow, moving, stationary, square }) => {
        const rectFor = function(name) {
            const node = document.querySelector(
                `.dm-el[data-control-name=${JSON.stringify(name)}]`
            );
            const rect = node?.getBoundingClientRect();

            return rect ? {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            } : null;
        };
        const root = document.querySelector(".dialog-root")?.getBoundingClientRect();
        const squareHost = square
            ? document.querySelector(
                `.dm-el[data-control-name=${JSON.stringify(square)}]`
            )
            : null;
        const frame = squareHost
            ? Array.from(squareHost.querySelectorAll(
                'svg line[stroke="#000000"]'
            )).slice(0, 4).map((line) => {
                return {
                    x1: Number(line.getAttribute("x1")),
                    y1: Number(line.getAttribute("y1")),
                    x2: Number(line.getAttribute("x2")),
                    y2: Number(line.getAttribute("y2"))
                };
            })
            : [];
        const canvas = squareHost?.querySelector(
            "canvas[data-point-count]"
        );
        const canvasRect = canvas?.getBoundingClientRect();
        return {
            root: root ? {
                width: root.width,
                height: root.height
            } : null,
            growing: grow ? rectFor(grow) : null,
            moving: Object.fromEntries(moving.map((name) => [name, rectFor(name)])),
            stationary: Object.fromEntries(stationary.map((name) => [name, rectFor(name)])),
            frame,
            canvas: canvasRect ? {
                width: canvasRect.width,
                height: canvasRect.height,
                pointCount: Number(
                    canvas.getAttribute("data-point-count") || 0
                )
            } : null
        };
    }, {
        grow: growingControl,
        moving: movingControls,
        stationary: staticControls,
        square: squarePlotControl
    });
};


const verifyResizableLayout = async function(app, dialogPage) {
    if (!resizeWidth || !resizeHeight) {
        return;
    }

    const before = await readDialogLayout(dialogPage);
    const window = await app.browserWindow(dialogPage);

    await window.evaluate((nativeWindow, target) => {
        nativeWindow.setContentSize(target.width, target.height);
    }, {
        width: resizeWidth,
        height: resizeHeight
    });

    await dialogPage.waitForFunction(({ initial, grow }) => {
        const root = document.querySelector(".dialog-root")?.getBoundingClientRect();
        const plot = grow
            ? document.querySelector(
                `.dm-el[data-control-name=${JSON.stringify(grow)}]`
            )?.getBoundingClientRect()
            : null;

        return Boolean(
            root
            && root.width > initial.root.width
            && root.height > initial.root.height
            && (!grow || (plot
                && plot.width > initial.growing.width
                && plot.height > initial.growing.height))
        );
    }, {
        initial: before,
        grow: growingControl
    }, {
        timeout: 10000
    });

    const after = await readDialogLayout(dialogPage);
    const widthGrowth = after.root.width - before.root.width;
    const heightGrowth = after.root.height - before.root.height;

    if (growingControl) {
        assert.equal(
            Math.round(after.growing.width - before.growing.width),
            Math.round(widthGrowth),
            `${growingControl} did not absorb the dialog width growth.`
        );
        assert.equal(
            Math.round(after.growing.height - before.growing.height),
            Math.round(heightGrowth),
            `${growingControl} did not absorb the dialog height growth.`
        );
    }

    movingControls.forEach((name) => {
        assert.equal(
            Math.round(after.moving[name].left - before.moving[name].left),
            Math.round(widthGrowth),
            `${name} did not retain its distance from the right edge.`
        );
        assert.equal(
            Math.round(after.moving[name].top - before.moving[name].top),
            Math.round(heightGrowth),
            `${name} did not retain its distance from the bottom edge.`
        );
    });

    staticControls.forEach((name) => {
        assert.equal(after.stationary[name].left, before.stationary[name].left,
            `${name} moved horizontally while the dialog was resized.`);
        assert.equal(after.stationary[name].top, before.stationary[name].top,
            `${name} moved vertically while the dialog was resized.`);
    });

    if (squarePlotControl) {
        if (after.canvas) {
            assert.ok(
                after.canvas.pointCount >= expectedPlotPoints,
                `${squarePlotControl} canvas did not retain its plotted points.`
            );
            assert.ok(
                after.canvas.width > 0 && after.canvas.height > 0,
                `${squarePlotControl} canvas has no rendered area after resizing.`
            );
            return;
        }

        assert.equal(
            after.frame.length,
            4,
            `${squarePlotControl} did not render a complete plot frame.`
        );
        const frameWidth = Math.abs(
            after.frame[0].x2 - after.frame[0].x1
        );
        const frameHeight = Math.abs(
            after.frame[1].y2 - after.frame[1].y1
        );

        assert.equal(
            Math.round(frameWidth),
            Math.round(frameHeight),
            `${squarePlotControl} no longer has a square plot area after resizing.`
        );
    }
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
    if (expectedCommand) {
        await mainPage.waitForFunction((command) => {
            const inputCommands = Array.from(document.querySelectorAll(
                "#consoleTerminal [data-console-input-line=\"true\"]"
            )).map((line) => {
                return String(line.dataset.consoleInputCode || "")
                    .replace(/\r\n/g, "\n")
                    .replace(/\r/g, "\n")
                    .replace(/\n+$/g, "");
            });
            const expectedLines = command.split("\n");

            return inputCommands.some((_, index) => {
                return expectedLines.every((line, offset) => {
                    return inputCommands[index + offset] === line;
                });
            });
        }, expectedCommand, {
            timeout: 30000
        });
    }
    else {
        await mainPage.waitForFunction((historyText) => {
            return String(
                document.getElementById("consoleTerminal")?.innerText || ""
            ).includes(historyText);
        }, expectedHistoryText, {
            timeout: 30000
        });
    }

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
    if (expectedRunOutputText) {
        await mainPage.waitForFunction((expectedOutput) => {
            return String(
                document.getElementById("consoleTerminal")?.innerText || ""
            ).includes(expectedOutput);
        }, expectedRunOutputText, {
            timeout: 30000
        });
    }

    if (expectedCommand) {
        const inputCommands = await mainPage.evaluate(() => {
            return Array.from(document.querySelectorAll(
                "#consoleTerminal [data-console-input-line=\"true\"]"
            )).map((line) => {
                return String(line.dataset.consoleInputCode || "");
            });
        });

        assertTranscriptContainsDialogCommand(
            inputCommands,
            expectedCommand,
            `Electron ${dialogId} transcript`
        );
    }

    await mainPage.locator("#consoleTerminal .monaco-editor").click();
    await mainPage.keyboard.press("ArrowUp");
    const historyValue = await mainPage.evaluate(() => {
        return document.getElementById("visibleCommandInput")
            ?.dialogForgeConsoleInputView?.getText();
    });

    assert.ok(
        historyValue.includes(expectedHistoryText),
        `Dialog command was not added to console history: ${JSON.stringify(historyValue)}.`
    );
};


const verifyDialogInteraction = async function(
    mainPage,
    dialogPage,
    rendererErrors = [],
    rendererMessages = []
) {
    if (dialogSelections.length > 0) {
        for (const selection of dialogSelections) {
            await clickContainerItem(
                dialogPage,
                selection.value,
                selection.name
            );
            if (selection.name === "c_datasets") {
                await verifyDatasetColumns(dialogPage);
            }
        }
    }
    else {
        await clickContainerItem(dialogPage, selectedDataset);
        if (selectedX || selectedY) {
            await clickContainerItem(dialogPage, selectedX, "c_x");
            await clickContainerItem(dialogPage, selectedY, "c_y");
        }
        else {
            await clickContainerItem(dialogPage, selectedVariable);
        }
    }
    await setDialogInputs(dialogPage);

    if (expectedCommand) {
        await mainPage.waitForFunction((command) => {
            return document.getElementById("command")?.dataset
                .consoleSyntaxValue === command;
        }, expectedCommand, {
            timeout: 30000
        });
        assertDialogCommand(
            await mainPage.locator("#command").getAttribute(
                "data-console-syntax-value"
            ),
            expectedCommand,
            `Electron ${dialogId} preview`
        );
    }

    if (!expectedPlotPoints) {
        return;
    }

    try {
        await dialogPage.waitForFunction((minimumPoints) => {
            const points = document.querySelectorAll(
                ".dm-plot .dm-plot-surface svg circle"
            );
            const canvases = Array.from(document.querySelectorAll(
                ".dm-plot .dm-plot-surface canvas[data-point-count]"
            ));
            const canvasPointCount = canvases.reduce((maximum, canvas) => {
                return Math.max(
                    maximum,
                    Number(canvas.getAttribute("data-point-count") || 0)
                );
            }, 0);

            return points.length >= minimumPoints
                || canvasPointCount >= minimumPoints;
        }, expectedPlotPoints, {
            timeout: 30000
        });
    }
    catch (error) {
        const runtimeValues = await mainPage.evaluate(async ({
            dataset,
            variable
        }) => {
            return window.dialogForge.executeRuntimeMethod({
                method: "workspace.dataset_values",
                params: {
                    name: dataset,
                    variableName: variable
                },
                source: "electron.product-dialog.plot-diagnostic"
            });
        }, {
            dataset: selectedDataset,
            variable: selectedVariable
        });
        const diagnostic = await dialogPage.evaluate(async ({
            dataset,
            variable
        }) => {
            const selected = Array.from(document.querySelectorAll(
                ".container-item.active, .container-item.selected, .container-item[aria-selected=\"true\"]"
            )).map((item) => {
                return String(item.textContent || "").trim();
            });
            const plot = document.querySelector(".dm-plot");
            const dialogValues = await window.dialogForge.dialogRuntime.invoke(
                "dialog:getVariableValues",
                {
                    name: dataset,
                    variableName: variable
                }
            );

            return {
                selected,
                pointCount: plot?.querySelectorAll("svg circle").length || 0,
                plotText: String(plot?.textContent || "").trim(),
                plotHtml: String(plot?.innerHTML || "").slice(0, 4000),
                dialogValues,
                bodyText: String(document.body?.innerText || "")
                    .trim()
                    .slice(0, 2000)
            };
        }, {
            dataset: selectedDataset,
            variable: selectedVariable
        });

        throw new Error(
            `Dialog plot did not reach ${expectedPlotPoints} points: `
            + JSON.stringify({
                ...diagnostic,
                runtimeValues,
                rendererErrors,
                rendererMessages
            }),
            { cause: error }
        );
    }

    if (minimumDistinctPlotY) {
        await dialogPage.waitForFunction((minimumDistinctY) => {
            const yValues = Array.from(document.querySelectorAll(
                ".dm-plot .dm-plot-surface svg circle"
            )).map((point) => {
                return Math.round(Number(point.getAttribute("cy")) * 1000);
            }).filter(Number.isFinite);

            return new Set(yValues).size >= minimumDistinctY;
        }, minimumDistinctPlotY, {
            timeout: 30000
        });
    }
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
    const rendererMessages = [];
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
            rendererMessages.push(`${message.type()}: ${message.text()}`);

            if (message.type() === "error") {
                rendererErrors.push(message.text());
            }
        });
    });

    try {
        const mainPage = await waitForMainWindow(app);

        await waitForRequiredPackage(mainPage);

        if (setupCommand) {
            await runConsoleCommand(mainPage, setupCommand);
        }

        await waitForWorkspaceObject(
            mainPage,
            expectedWorkspaceObject
        );
        await verifyWorkspaceDataset(mainPage);

        if (expectedActiveDataset) {
            await mainPage.locator(
                `[data-workspace-variable=${JSON.stringify(expectedActiveDataset)}]`
            ).click({ button: "right" });
            await mainPage.locator('[data-workspace-context-action="make-active"]').click();
            await mainPage.locator(
                `[data-workspace-variable-row=${JSON.stringify(expectedActiveDataset)}].active-dataset`
            ).waitFor({ state: "visible" });
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
        await verifyDialogInteraction(
            mainPage,
            dialogPage,
            rendererErrors,
            rendererMessages
        );
        await verifyResizableLayout(app, dialogPage);
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
