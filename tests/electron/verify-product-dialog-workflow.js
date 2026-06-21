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
    "dist/build/scripts/electron-main.js"
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
const minimumControls = Math.max(
    1,
    Number(process.env.DIALOGFORGE_ELECTRON_DIALOG_MIN_CONTROLS) || 1
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
                "dist/build/scripts/package-product.js"
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


const openDialog = async function(app, mainPage) {
    const windowPromise = app.waitForEvent("window", {
        timeout: 10000
    });
    const result = await mainPage.evaluate(async (targetDialogId) => {
        return window.dialogForge.openProductDialog(targetDialogId);
    }, dialogId);

    assert.equal(result.status, "opened");

    return windowPromise;
};


const verifyDialog = async function(dialogPage) {
    await dialogPage.waitForLoadState("domcontentloaded");
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

        const dialogPage = await openDialog(app, mainPage);

        await verifyDialog(dialogPage);
        assert.deepEqual(
            rendererErrors,
            [],
            "Product dialog emitted renderer errors."
        );

        console.log(
            `Product dialog ${dialogId} rendered successfully in Playwright.`
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
