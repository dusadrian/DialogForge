"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { typeConsoleCommand, runConsoleCommand } = require("../support/console-interactions");
const { openMenuItem } = require("../support/menu-interactions");
const { assertDialogTargetEnabled, assertDialogControlState } = require("../support/dialog-interactions");
const {
    assertDialogCommand,
    assertTranscriptContainsDialogCommand
} = require("../support/dialog-behavior-contract");
const {
    dialogRFrequencyBehavior
} = require("../fixtures/product-dialog-behavior");


const projectRoot = path.resolve(__dirname, "../..");
const dialogRRoot = path.resolve(projectRoot, "../DialogR");
const dialogQCARoot = path.resolve(projectRoot, "../DialogQCA");
const dialogRWebDist = path.join(dialogRRoot, "dist", "web");

process.env.DIALOGFORGE_DIST_DIR = dialogRWebDist;
process.env.DIALOGFORGE_SOURCE_ROOT = projectRoot;

require("../register-dist-require");

const serverModule = require(
    path.join(dialogRWebDist, "scripts", "web-product-dev-server.js")
);
const {
    composeApplication
} = require("../../src/base-app/bootstrap/composeApplication");
const {
    resolveProductLocation
} = require("../../src/base-app/bootstrap/productResolver");

const renderedDatasetName = "test";
const renderedDatasetFixtureRoute = "/tests/fixtures/datasets/test.rds";
const browserImportFixturePath = path.join(projectRoot, "tests/fixtures/import/browser-import.csv");
const renderedDatasetVariables = ["Area", "Gender", "Age", "Children", "Opinion", "fweight"];
const renderedCategoricalVariables = ["Area", "Gender", "Opinion"];
const renderedQuantitativeVariables = ["Age", "Children", "fweight"];
const renderedFrequencyDisabledVariables = renderedQuantitativeVariables;
const renderedCrosstableDisabledVariables = renderedQuantitativeVariables;
const renderedOneSampleDisabledVariables = renderedCategoricalVariables;

const readTypeScriptTree = function(directoryPath) {
    return fs.readdirSync(directoryPath, {
        withFileTypes: true
    }).map((entry) => {
        const entryPath = path.join(directoryPath, entry.name);

        if (entry.isDirectory()) {
            return readTypeScriptTree(entryPath);
        }

        return entry.isFile() && entry.name.endsWith(".ts")
            ? fs.readFileSync(entryPath, "utf8")
            : "";
    }).join("\n");
};


const readTextTree = function(directoryPath, predicate) {
    if (!fs.existsSync(directoryPath)) {
        return "";
    }

    return fs.readdirSync(directoryPath, {
        withFileTypes: true
    }).map((entry) => {
        const entryPath = path.join(directoryPath, entry.name);

        if (entry.isDirectory()) {
            return readTextTree(entryPath, predicate);
        }

        return entry.isFile() && predicate(entryPath)
            ? fs.readFileSync(entryPath, "utf8")
            : "";
    }).join("\n");
};


const assertRuntimePackageComposition = function() {
    const location = resolveProductLocation(
        projectRoot,
        "DialogR",
        dialogRRoot
    );
    const electronComposition = composeApplication({
        rootDir: projectRoot,
        location,
        runtime: "r",
        hostKind: "electron"
    });
    const startupTask = electronComposition.startupTasks.find((task) => {
        return task.id === "DialogR-packages";
    });

    assert.ok(startupTask);
    assert.ok(startupTask.rPackages.includes("httpgd"));
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
                    headers: response.headers,
                    body: Buffer.concat(chunks)
                });
            });
        });

        req.on("error", reject);
        req.end();
    });
};


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


const assertSourceContracts = function() {
    // Source ownership contracts are maintained beside their canonical owners.
    // This keeps the runnable acceptance suite from reasserting deleted host
    // implementations after native/WebR consolidation. Behavioral assertions
    // below still execute against the real browser and R runtime.
    const { execFileSync } = require("node:child_process");
    const contracts = [
        "verify-browser-completion-runtime", "verify-browser-dataset-channel-adapter",
        "verify-browser-dataset-mutation-commands", "verify-browser-dataset-snapshot-adapter",
        "verify-browser-dialog-content-adapter", "verify-browser-dialog-surface",
        "verify-browser-help-adapter", "verify-browser-help-viewer-surface",
        "verify-browser-menu-adapter", "verify-browser-plot-adapter",
        "verify-browser-r-command-capture", "verify-browser-runtime-package-adapter",
        "verify-browser-runtime-progress-adapter", "verify-browser-webr-output-adapter",
        "verify-webr-prompt-bridge", "verify-webr-runtime-busy-gate",
        "verify-webr-runtime-operation-queue", "verify-shared-dialog-sources"
    ];
    for (const contract of contracts) {
        execFileSync(process.execPath, [
            ...process.execArgv,
            "-r", path.join(projectRoot, "tests/register-dist-require.js"),
            path.join(projectRoot, "tests/contracts", contract + ".js")
        ], {
            cwd: projectRoot, stdio: "inherit"
        });
    }
    execFileSync(process.execPath, [path.join(projectRoot, "scripts/check-build-ownership.js")], {
        cwd: projectRoot, stdio: "inherit"
    });
};


const assertServerContracts = async function() {
    const previousLaunchDataRoot = process.env.DIALOGFORGE_LAUNCH_DATA_ROOT;
    const launchDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-launch-"));
    const launchToken = "EN-DS-26-0001";

    fs.writeFileSync(path.join(launchDataRoot, `${launchToken}.rds`), Buffer.from("rds"));
    fs.writeFileSync(path.join(launchDataRoot, `${launchToken}.json`), JSON.stringify({
        course: "contract-test",
        exercise: "launch-dataset"
    }));
    process.env.DIALOGFORGE_LAUNCH_DATA_ROOT = launchDataRoot;

    const server = serverModule.createWebProductDevServer({
        productPath: require("node:path").resolve(__dirname, "../../../DialogR")
    });
    const port = await listen(server);

    try {
        const page = await request(port, "/");

        assert.strictEqual(page.statusCode, 200);
        assert.match(String(page.headers["content-type"]), /text\/html/);
        assert.ok(page.headers["cross-origin-opener-policy"]);
        assert.ok(page.headers["cross-origin-embedder-policy"]);
        assert.ok(page.body.toString("utf8").includes("DialogForge Web"));

        const startPage = await request(port, "/start?k=EN-DS-26-0001");

        assert.strictEqual(startPage.statusCode, 200);
        assert.match(String(startPage.headers["content-type"]), /text\/html/);
        assert.ok(startPage.body.toString("utf8").includes("DialogForge Web"));

        const launchMetadata = await request(port, `/api/launch/${launchToken}/metadata`);
        const launchMetadataJson = JSON.parse(launchMetadata.body.toString("utf8"));

        assert.strictEqual(launchMetadata.statusCode, 200);
        assert.strictEqual(launchMetadataJson.ok, true);
        assert.strictEqual(launchMetadataJson.token, launchToken);
        assert.strictEqual(launchMetadataJson.datasetName, "dataset");
        assert.strictEqual(launchMetadataJson.datasetFile, `${launchToken}.rds`);
        assert.strictEqual(launchMetadataJson.hasDataset, true);
        assert.strictEqual(launchMetadataJson.datasetUrl, `/api/launch/${launchToken}/dataset.rds`);

        const launchDataset = await request(port, launchMetadataJson.datasetUrl);

        assert.strictEqual(launchDataset.statusCode, 200);
        assert.strictEqual(launchDataset.body.toString("utf8"), "rds");
        assert.match(String(launchDataset.headers["content-type"]), /application\/octet-stream/);
        assert.match(String(launchDataset.headers["cache-control"]), /no-store/);

        const invalidLaunch = await request(port, "/api/launch/%2e%2e/dataset.rds");

        assert.strictEqual(invalidLaunch.statusCode, 400);

        const script = await request(port, "/src/shell-web/pages/shell.js");

        assert.strictEqual(script.statusCode, 200);
        assert.match(String(script.headers["content-type"]), /javascript/);
        assert.ok(script.body.toString("utf8").includes("ensureRuntime"));
        assert.ok(script.body.toString("utf8").includes("loadBrowserComposition"));

        const composition = await request(port, "/api/composition");
        const compositionJson = JSON.parse(composition.body.toString("utf8"));

        assert.strictEqual(composition.statusCode, 200);
        assert.strictEqual(compositionJson.product.id, "DialogR");
        assert.strictEqual(compositionJson.locale, "en_US");
        assert.strictEqual(compositionJson.runtime.id, "webr");
        assert.ok(compositionJson.productAbout.body.some((text) => {
            return String(text).includes("statistical analysis");
        }));
        assert.ok(compositionJson.i18n["menu.root.language"]);
        assert.ok(compositionJson.availableLocales.some((locale) => {
            return locale.code === "ro_RO" && /Rom/i.test(locale.label);
        }));
        assert.ok(compositionJson.menu.some((item) => {
            return item.id === "Analyze" || item.label === "Analyze";
        }));
        assert.ok(compositionJson.productDialogs.some((dialog) => {
            return dialog.id === "frequencies";
        }));
        const startupTask = compositionJson.startupTasks.find((task) => {
            return task.id === "DialogR-packages";
        });
        const packageCapability = compositionJson.productCapabilities.find((capability) => {
            return capability.capability === "DialogR.packages.required";
        });

        assert.ok(startupTask);
        assert.ok(startupTask.rPackages.includes("DDIwR"));
        assert.ok(!startupTask.rPackages.includes("httpgd"));
        assert.ok(packageCapability);
        assert.ok(packageCapability.rPackages.includes("DDIwR"));
        assert.ok(!packageCapability.rPackages.includes("httpgd"));

        const greekComposition = await request(port, "/api/composition?locale=el_GR");
        const greekCompositionJson = JSON.parse(greekComposition.body.toString("utf8"));

        assert.strictEqual(greekComposition.statusCode, 200);
        assert.strictEqual(greekCompositionJson.locale, "el_GR");
        assert.strictEqual(greekCompositionJson.i18n["menu.root.language"], "Γλώσσα");

        const productCss = await request(port, "/api/product.css");

        assert.strictEqual(productCss.statusCode, 200);
        assert.match(String(productCss.headers["content-type"]), /text\/css/);

        const library = await request(port, "/api/webr-package-library");
        const libraryJson = JSON.parse(library.body.toString("utf8"));

        assert.strictEqual(library.statusCode, 200);
        assert.strictEqual(libraryJson.available, true);
        assert.strictEqual(libraryJson.mountpoint, "/.dialogforge-dialogforge-startup");
        assert.strictEqual(libraryJson.deferred.mountpoint, "/.dialogforge-dialogforge-deferred");
        assert.deepStrictEqual(libraryJson.requiredForNativeHelpExamples, [
            "knitr",
            "evaluate",
            "highr",
            "xfun",
            "yaml"
        ]);
        assert.ok(libraryJson.recommendedPackages.includes("knitr"));
        assert.ok(!libraryJson.recommendedPackages.includes("webrmoodle"));

        const libraryData = await request(port, libraryJson.dataUrl);

        assert.strictEqual(libraryData.statusCode, 200);
        assert.ok(libraryData.body.length > 1000);

        const dialog = await request(port, "/api/dialog/frequencies");
        const dialogJson = JSON.parse(dialog.body.toString("utf8"));

        assert.strictEqual(dialog.statusCode, 200);
        assert.strictEqual(dialogJson.definition.id, "frequencies");
        assert.ok(dialogJson.source);
        assert.deepStrictEqual(
            dialogJson.runtimeRequirements.rPackages,
            [
                { name: "admisc", minimumVersion: "0.41" },
                { name: "declared", minimumVersion: "0.27" }
            ]
        );

        const webr = await request(port, "/webr/webr.js");

        assert.strictEqual(webr.statusCode, 200);
        assert.match(String(webr.headers["content-type"]), /javascript/);
        assert.ok(webr.body.length > 1000);

        const webrLoaderAlias = await request(port, "/webr/loader.js");

        assert.strictEqual(webrLoaderAlias.statusCode, 200);
        assert.match(String(webrLoaderAlias.headers["content-type"]), /javascript/);
        assert.ok(webrLoaderAlias.body.includes("WebR"));

        const monaco = await request(port, "/monaco/vs/loader.js");

        assert.strictEqual(monaco.statusCode, 200);
        assert.match(String(monaco.headers["content-type"]), /javascript/);
        assert.ok(monaco.body.length > 1000);
    }
    finally {
        await close(server);
        fs.rmSync(launchDataRoot, {
            force: true,
            recursive: true
        });

        if (typeof previousLaunchDataRoot === "string") {
            process.env.DIALOGFORGE_LAUNCH_DATA_ROOT = previousLaunchDataRoot;
        }
        else {
            delete process.env.DIALOGFORGE_LAUNCH_DATA_ROOT;
        }
    }
};


const assertRenderedContracts = async function() {
    const server = serverModule.createWebProductDevServer({
        productPath: require("node:path").resolve(__dirname, "../../../DialogR")
    });
    const port = await listen(server);
    const browser = await chromium.launch();

    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
        await page.goto(`http://127.0.0.1:${port}/`, {
            waitUntil: "domcontentloaded"
        });
        await page.locator("#webMenuBar").waitFor({ state: "visible" });
        assert.strictEqual(await page.locator(".web-toolbar").count(), 0);
        assert.strictEqual(await page.locator("#startRuntime").count(), 0);
        assert.strictEqual(await page.locator("#runtimeStatus").count(), 0);
        await page.locator("#webDesktop").waitFor({ state: "visible" });
        await page.locator("#webWorkbenchWindow").waitFor({ state: "visible" });
        await page.waitForFunction(() => {
            return typeof window.dialogForge?.fetchHelpPage === "function";
        }, { timeout: 20000 });
        await page.waitForFunction(() => {
            return window.dialogForgeWebConsole?.session?.getSessionPhase?.() === "ready"
                && !document.body.classList.contains("console-cover-visible");
        }, { timeout: 90000 });
        if (await page.evaluate(() => document.body.classList.contains("workspace-pane-hidden"))) {
            await page.locator("#workspacePaneToggle").click();
        }
        const workbenchBox = await page.locator("#webWorkbenchWindow").boundingBox();

        assert.ok(workbenchBox && workbenchBox.width > 700 && workbenchBox.height > 400);
        assert.strictEqual(
            await page.locator('#webWorkbenchWindow .web-workbench-resize-handle[data-resize-direction="corner"]').isVisible(),
            true
        );
        assert.strictEqual(await page.locator("#commandPane").isVisible(), false);
        assert.strictEqual(await page.locator("#mainSplitter").isVisible(), false);
        assert.strictEqual(await page.locator("#consoleArea").isVisible(), true);
        assert.ok(await page.evaluate(() => {
            const windowEl = document.getElementById("webWorkbenchWindow");
            const consoleEl = document.getElementById("consoleTerminal");
            const workspaceEl = document.getElementById("workspaceSummary");
            const commandEl = document.getElementById("command");
            const commandPane = document.getElementById("commandPane");

            return Boolean(
                windowEl
                && commandEl
                && commandPane
                && consoleEl
                && workspaceEl
                && document.body.classList.contains("command-pane-hidden")
                && getComputedStyle(commandPane).display === "none"
                && windowEl.contains(commandEl)
                && windowEl.contains(consoleEl)
                && windowEl.contains(workspaceEl)
                && getComputedStyle(windowEl).resize === "both"
            );
        }));
        assert.strictEqual(
            await page.locator("#consoleToolbarStart").isVisible(),
            false
        );
        assert.strictEqual(
            await page.locator("#consoleToolbarStop").isVisible(),
            false
        );
        assert.ok(await page.locator("#consoleToolbarRestartWorkspace .dm-toolbar-svg-icon-restartworkspace").count() === 1);
        {
            const beforeDrag = await page.locator("#webWorkbenchWindow").boundingBox();
            const viewport = page.viewportSize() || { width: 1440, height: 900 };
            const canDragRight = beforeDrag.x + beforeDrag.width + 90 < viewport.width;
            const canDragLeft = beforeDrag.x > 60;
            const dragX = canDragRight ? 50 : (canDragLeft ? -50 : 0);

            const handle = await page.locator("#webWorkbenchWindow .web-workbench-window__titlebar").boundingBox();
            assert.ok(handle);
            await page.mouse.move(handle.x + 120, handle.y + 14);
            await page.mouse.down();
            await page.mouse.move(handle.x + 120 + dragX, handle.y + 44, { steps: 5 });
            await page.mouse.up();

            const afterDrag = await page.locator("#webWorkbenchWindow").boundingBox();

            if (canDragRight) {
                assert.ok(afterDrag.x > beforeDrag.x + 20);
            }
            else if (canDragLeft) {
                assert.ok(afterDrag.x < beforeDrag.x - 20);
            }
            assert.ok(afterDrag.y > beforeDrag.y + 10);
        }
        {
            const beforeResize = await page.locator("#webWorkbenchWindow").boundingBox();
            const handle = await page.locator('#webWorkbenchWindow .web-workbench-resize-handle[data-resize-direction="corner"]').boundingBox();

            await page.mouse.move(handle.x + handle.width - 3, handle.y + handle.height - 3);
            await page.mouse.down();
            await page.mouse.move(handle.x + handle.width - 83, handle.y + handle.height - 63);
            await page.mouse.up();

            const afterResize = await page.locator("#webWorkbenchWindow").boundingBox();

            assert.ok(afterResize.width < beforeResize.width - 40);
            assert.ok(afterResize.height < beforeResize.height - 30);
        }
        await page.locator('[data-console-transcript-island="preact"]').waitFor({
            state: "attached",
            timeout: 10000
        });

        await page.locator("#consoleTerminal .monaco-editor").waitFor({
            state: "visible",
            timeout: 20000
        });
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await typeConsoleCommand(page, "");
        await page.evaluate(() => navigator.clipboard.writeText("paste_probe <- 42"));
        await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
        await page.waitForFunction(() => {
            return window.dialogForgeWebConsole.coordinator.getText() === "paste_probe <- 42";
        });
        await typeConsoleCommand(page, "");
        await page.locator("#consoleCwdText", {
            hasText: "~"
        }).waitFor({ timeout: 10000 });
        {
            const fileChooserPromise = page.waitForEvent("filechooser");
            const selectedPromise = page.evaluate(() => {
                return window.dialogForge.selectImportFile();
            });
            const fileChooser = await fileChooserPromise;

            await fileChooser.setFiles(browserImportFixturePath);
            const selected = await selectedPromise;

            assert.strictEqual(selected.status, "selected");
            assert.strictEqual(selected.canceled, false);
            assert.ok(selected.filePath.endsWith("/browser-import.csv"));

            const preview = await page.evaluate((filePath) => {
                return window.dialogForge.previewImportFile({
                    file: filePath,
                    format: "csv",
                    nrows: 8
                });
            }, selected.filePath);

            assert.strictEqual(preview.status, "ready");
            assert.deepStrictEqual(preview.colnames, ["group", "score", "label"]);
            assert.deepStrictEqual(preview.vdata[0], ["A", "B", "A"]);
            assert.deepStrictEqual(preview.vdata[1], ["12", "19", "24"]);

            const imported = await page.evaluate((filePath) => {
                return window.dialogForge.importData({
                    source: filePath,
                    format: "csv",
                    targetName: "browser_import",
                    overwrite: true,
                    uiCommandVisibility: "hidden"
                });
            }, selected.filePath);

            assert.strictEqual(imported.status, "imported");
            assert.strictEqual(imported.targetName, "browser_import");
            await page.locator("#workspaceSummary [data-workspace-variable=\"browser_import\"]").waitFor({
                timeout: 30000
            });
        }
        await runConsoleCommand(page, `test <- readRDS(url("http://127.0.0.1:${port}${renderedDatasetFixtureRoute}", "rb"))`);
        await page.locator(`#workspaceSummary [data-workspace-variable="${renderedDatasetName}"]`).waitFor({
            timeout: 30000
        }).catch(async (error) => {
            console.error(await page.locator("#consoleTerminal").innerText());
            throw error;
        });
        await page.locator(`#workspaceSummary [data-workspace-variable="${renderedDatasetName}"]`).click();
        await page.locator("#consoleActiveDataset", {
            hasText: renderedDatasetName
        }).waitFor({ timeout: 10000 });
        await runConsoleCommand(page, 'cat(paste("scroll probe line", 1:140), sep = "\\n")');
        await page.locator("#consoleTerminal", {
            hasText: "scroll probe line 140"
        }).waitFor({ timeout: 10000 });
        {
            const scrollGeometry = await page.evaluate(async () => {
                const island = document.querySelector('[data-console-transcript-island="preact"]');
                const viewport = island?.parentElement?.parentElement?.parentElement;

                if (!(viewport instanceof HTMLElement)) {
                    return null;
                }

                viewport.scrollTop = Math.floor(viewport.scrollHeight * 0.45);
                await new Promise((resolve) => {
                    requestAnimationFrame(() => requestAnimationFrame(resolve));
                });

                const viewportRect = viewport.getBoundingClientRect();
                const rows = Array.from(document.querySelectorAll("[data-console-transcript-row]"))
                    .filter((row) => {
                        const rect = row.getBoundingClientRect();

                        return rect.bottom > viewportRect.top
                            && rect.top < viewportRect.bottom;
                    });
                const firstRect = rows[0]?.getBoundingClientRect();

                return {
                    visibleRows: rows.length,
                    firstVisibleGap: firstRect ? firstRect.top - viewportRect.top : null,
                    viewportHeight: viewportRect.height,
                    scrollTop: viewport.scrollTop
                };
            });

            assert.ok(scrollGeometry, "console transcript viewport must be discoverable");
            assert.ok(scrollGeometry.visibleRows > 0, "scrolled console viewport must contain transcript rows");
            assert.ok(
                scrollGeometry.firstVisibleGap !== null
                    && scrollGeometry.firstVisibleGap < Math.max(80, scrollGeometry.viewportHeight * 0.2),
                `scrolled console text must not be cut away from the top of the viewport: ${JSON.stringify(scrollGeometry)}`
            );
            await typeConsoleCommand(page, "");
            const pastedCode = [
                "DF <- data.frame(",
                "    Area = sample(1:2, 215, replace = TRUE),",
                "    Gender = sample(1:2, 215, replace = TRUE),",
                "    Age = sample(18:90, 215, replace = TRUE),",
                "    Children = sample(0:5, 215, replace = TRUE)",
                ")"
            ].join("\n");
            await page.evaluate((text) => navigator.clipboard.writeText(text), pastedCode);
            await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
            await page.waitForFunction(() => {
                return window.dialogForgeWebConsole.coordinator.getText().includes("Children = sample(0:5");
            });
            await page.waitForFunction(() => {
                const viewport = document.querySelector("#consoleTerminal")?.firstElementChild;
                const editor = document.querySelector("#consoleTerminal .monaco-editor");

                if (!(viewport instanceof HTMLElement) || !(editor instanceof HTMLElement)) {
                    return false;
                }

                const viewportRect = viewport.getBoundingClientRect();
                const editorRect = editor.getBoundingClientRect();

                return editorRect.bottom <= viewportRect.bottom + 2;
            });
            {
                const multilineCommand = [
                    "history_probe <- function() {",
                    "    42",
                    "}"
                ].join("\n");

                await typeConsoleCommand(page, multilineCommand);
                await page.keyboard.press("ArrowUp");
                await page.keyboard.press("End");
                await page.keyboard.press("ArrowUp");

                const cursorAfterArrowUp = await page.evaluate(() => {
                    const editors = window.monaco?.editor?.getEditors?.() || [];
                    const editor = editors.find((candidate) => {
                        return candidate.getDomNode?.()?.closest?.("#consoleTerminal");
                    });
                    const position = editor?.getPosition?.();

                    return {
                        text: window.dialogForgeWebConsole.coordinator.getText(),
                        lineNumber: position?.lineNumber || null
                    };
                });

                assert.deepStrictEqual(cursorAfterArrowUp, {
                    text: multilineCommand,
                    lineNumber: 1
                }, "plain Up inside a multiline console prompt must move the caret instead of swallowing Monaco navigation");
            }
            await typeConsoleCommand(page, "");
            await page.locator("#consoleToolbarClear").click();
        }
        await page.locator("#workspaceSummary .workspace-variable-row.active-dataset", {
            hasText: renderedDatasetName
        }).waitFor({ timeout: 10000 });
        await page.locator("#workspaceSummary .workspace-group-header", {
            hasText: "Datasets"
        }).waitFor({ timeout: 10000 });
        await page.locator("#workspaceSummary .workspace-variable-summary", {
            hasText: "[215 rows x 6 columns]"
        }).waitFor({ timeout: 10000 });
        assert.deepStrictEqual(
            await page.evaluate(() => {
                return Array.from(document.querySelectorAll("[data-console-input-line]")).map((line) => {
                    return String(line.dataset.consoleInputCode || "");
                });
            }),
            []
        );
        assert.strictEqual(await page.locator("#workspaceSummary .workspace-broom-icon").count(), 1);
        assert.strictEqual(await page.locator("#workspaceSummary .workspace-variable-delete .codicon-trash").count(), 2);
        assert.strictEqual(await page.locator("#workspaceSummary [data-workspace-clear]").isDisabled(), false);
        await page.locator("#workspaceSummary .workspace-variable-row", {
            hasText: renderedDatasetName
        }).hover();
        assert.strictEqual(
            await page.locator(`#workspaceSummary [data-workspace-delete="${renderedDatasetName}"]`).isVisible(),
            true
        );
        assert.strictEqual(
            await page.locator("#workspaceSummary", {
                hasText: "WebR session"
            }).count(),
            0
        );
        await runConsoleCommand(page, "data(mtcars)");
        await page.locator("#workspaceSummary [data-workspace-variable=\"mtcars\"]").waitFor({ timeout: 30000 });
        await page.locator("#workspaceSummary [data-workspace-variable=\"mtcars\"]").click();
        await page.locator("#workspaceSummary .workspace-variable-row.active-dataset", {
            hasText: "mtcars"
        }).waitFor({ timeout: 10000 });
        await page.locator("#consoleToolbar", {
            hasText: "Active: mtcars"
        }).waitFor({ timeout: 10000 });
        await page.locator(`#workspaceSummary [data-workspace-variable="${renderedDatasetName}"]`).click();
        await page.locator("#workspaceSummary .workspace-variable-row.active-dataset", {
            hasText: renderedDatasetName
        }).waitFor({ timeout: 10000 });
        await runConsoleCommand(page, [
                "test$Age <- declared::declared(",
                "    test$Age,",
                "    na_range = c(40, 50),",
                "    measurement = \"quantitative, ratio\"",
                ")"
            ].join("\n"));
        await page.locator(`#workspaceSummary [data-workspace-variable="${renderedDatasetName}"]`).dblclick();
        await page.locator(".dialogforge-web-data-editor-window", {
            hasText: "Data editor: test"
        }).waitFor({ state: "visible", timeout: 30000 });
        const dataEditorFrame = page.frameLocator(".dialogforge-web-data-editor-frame");
        const readDataEditorFrame = function() {
            const frame = page.frames().find((candidate) => {
                return candidate.url().includes("/src/base-app/pages/datasetEditor.html");
            });

            assert.ok(frame, "shared Data Editor iframe must be attached");

            return frame;
        };

        await dataEditorFrame.locator("#datasetEditorPanelData.is-active #datasetEditorDataScroll", {
            hasText: "fweight"
        }).waitFor({ timeout: 30000 });
        await dataEditorFrame.locator("#datasetEditorDataScroll", {
            hasText: "Opinion"
        }).waitFor({ timeout: 30000 });
        await dataEditorFrame.locator('#datasetEditorDataScroll td[data-data-row="1"][data-data-column="Age"].is-declared-missing').waitFor({
            timeout: 30000
        });
        await dataEditorFrame.locator('#datasetEditorDataScroll td[data-data-row="1"][data-data-column="fweight"]').dblclick();
        const fweightEditor = dataEditorFrame.locator('#datasetEditorDataScroll td[data-data-row="1"][data-data-column="fweight"] input');
        await fweightEditor.fill("42.5");
        await fweightEditor.press("Enter");
        await dataEditorFrame.locator('#datasetEditorDataScroll td[data-data-row="1"][data-data-column="fweight"][title="42.5"]').waitFor({
            timeout: 30000
        });
        await readDataEditorFrame().evaluate(() => {
            window.parent.__dialogForgeClipboardText = "";
            Object.defineProperty(navigator, "clipboard", {
                configurable: true,
                value: {
                    writeText: async (text) => {
                        window.parent.__dialogForgeClipboardText = String(text || "");
                    },
                    readText: async () => {
                        return String(window.parent.__dialogForgeClipboardText || "");
                    }
                }
            });
        });
        await dataEditorFrame.locator('#datasetEditorDataScroll td[data-data-row="1"][data-data-column="fweight"]').click();
        await page.keyboard.press(process.platform === "darwin" ? "Meta+C" : "Control+C");
        assert.strictEqual(
            await page.evaluate(() => window.__dialogForgeClipboardText),
            "42.5"
        );
        await dataEditorFrame.locator('#datasetEditorDataScroll td[data-data-row="1"][data-data-column="Children"]').click();
        await readDataEditorFrame().evaluate(() => {
            window.parent.__dialogForgeClipboardText = "7";
        });
        await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
        await dataEditorFrame.locator('#datasetEditorDataScroll td[data-data-row="1"][data-data-column="Children"][title="7"]').waitFor({
            timeout: 30000
        });
        await dataEditorFrame.locator("#datasetEditorTabVariables").click();
        await dataEditorFrame.locator("#datasetEditorPanelVariables.is-active #datasetEditorVariablesScroll").waitFor({ timeout: 30000 });
        {
            const nameHeader = dataEditorFrame.locator('#datasetEditorVariablesScroll th[data-variable-header="name"]');
            const resizeHandle = dataEditorFrame.locator('#datasetEditorVariablesScroll [data-variable-resizer="name"]');
            const before = await nameHeader.boundingBox();

            assert.ok(before && before.width > 0);
            await resizeHandle.hover();
            await page.mouse.down();
            await page.mouse.move(before.x + before.width + 48, before.y + before.height / 2);
            await page.mouse.up();

            const after = await nameHeader.boundingBox();

            assert.ok(after && after.width > before.width + 30);
        }
        assert.strictEqual(
            await dataEditorFrame.locator('#datasetEditorVariablesScroll input[data-variable-field="name"][data-variable-row="4"]').inputValue(),
            "Opinion"
        );
        assert.strictEqual(
            await readDataEditorFrame().evaluate(async () => {
                const variables = await window.dialogForge.datasetViewer
                    .getVariables("test");
                const age = Array.isArray(variables)
                    ? variables.find((variable) => variable?.name === "Age")
                    : null;

                return age?.declared === true;
            }),
            true
        );
        await dataEditorFrame.locator(
            '#datasetEditorVariablesScroll tr[data-variable-row="2"] td[data-column="values"]'
        ).waitFor({ state: "visible", timeout: 30000 });
        await dataEditorFrame.locator('#datasetEditorVariablesScroll tr[data-variable-row="2"] td[data-column="values"]').hover();
        await dataEditorFrame.locator('#datasetEditorVariablesScroll [data-variable-values-editor="2"]').click();
        await dataEditorFrame.locator("#datasetValueLabelsModal", {
            hasText: "Age"
        }).waitFor({ state: "visible", timeout: 30000 });
        assert.strictEqual(
            await dataEditorFrame.locator(
                "#datasetValueLabelsRangeEnabled"
            ).evaluate((checkbox) => {
                return String(checkbox.checked) === "true";
            }),
            true
        );
        assert.strictEqual(
            await dataEditorFrame.locator("#datasetValueLabelsRangeMin").inputValue(),
            "40"
        );
        assert.strictEqual(
            await dataEditorFrame.locator("#datasetValueLabelsRangeMax").inputValue(),
            "50"
        );
        await dataEditorFrame.locator("#datasetValueLabelsCancel").click();
        await dataEditorFrame.locator("#datasetValueLabelsModal").waitFor({ state: "hidden", timeout: 30000 });
        const speciesLabelEditor = dataEditorFrame.locator('#datasetEditorVariablesScroll input[data-variable-field="label"][data-variable-row="4"]');
        await speciesLabelEditor.fill("Survey opinion");
        await speciesLabelEditor.press("Enter");
        await dataEditorFrame.locator('#datasetEditorVariablesScroll input[data-variable-field="label"][data-variable-row="4"]').waitFor({ state: "attached", timeout: 30000 });
        assert.strictEqual(
            await dataEditorFrame.locator('#datasetEditorVariablesScroll input[data-variable-field="label"][data-variable-row="4"]').inputValue(),
            "Survey opinion"
        );
        await dataEditorFrame.locator('#datasetEditorVariablesScroll select[data-variable-field="measure"][data-variable-row="4"]').selectOption("ordinal");
        assert.strictEqual(
            await dataEditorFrame.locator('#datasetEditorVariablesScroll select[data-variable-field="measure"][data-variable-row="4"]').inputValue(),
            "ordinal"
        );
        await dataEditorFrame.locator('#datasetEditorVariablesScroll tr[data-variable-row="1"] td[data-column="values"]').hover();
        await dataEditorFrame.locator('#datasetEditorVariablesScroll [data-variable-values-editor="1"]').click();
        await dataEditorFrame.locator("#datasetValueLabelsModal", {
            hasText: "Gender"
        }).waitFor({ state: "visible", timeout: 30000 });
        await dataEditorFrame.locator('#datasetValueLabelsModal input[data-value-label-label="0"]').fill("Men");
        await dataEditorFrame.locator('#datasetValueLabelsModal [data-value-label-missing="0"]').click();
        await dataEditorFrame.locator("#datasetValueLabelsSave").click();
        await dataEditorFrame.locator("#datasetValueLabelsModal").waitFor({ state: "hidden", timeout: 90000 });
        await dataEditorFrame.locator('#datasetEditorVariablesScroll td[data-column="values"]', {
            hasText: "Men"
        }).waitFor({ timeout: 30000 });
        await dataEditorFrame.locator('#datasetEditorVariablesScroll tr[data-variable-row="1"] td[data-column="values"]').hover();
        await dataEditorFrame.locator('#datasetEditorVariablesScroll [data-variable-values-editor="1"]').click();
        await dataEditorFrame.locator('#datasetValueLabelsModal [data-value-label-missing="0"]').waitFor({ timeout: 30000 });
        assert.strictEqual(
            await dataEditorFrame.locator(
                '#datasetValueLabelsModal [data-value-label-missing="0"]'
            ).evaluate((checkbox) => {
                return String(checkbox.checked) === "true";
            }),
            true
        );
        await dataEditorFrame.locator('#datasetValueLabelsModal [data-value-label-missing="0"]').click();
        await dataEditorFrame.locator('#datasetValueLabelsModal input[data-value-label-label="0"]').fill("Males");
        await dataEditorFrame.locator("#datasetValueLabelsSave").click();
        await dataEditorFrame.locator("#datasetValueLabelsModal").waitFor({ state: "hidden", timeout: 90000 });
        await dataEditorFrame.locator('#datasetEditorVariablesScroll td[data-column="values"]', {
            hasText: "Males"
        }).waitFor({ timeout: 30000 });
        const sharedMetadataRoutes = await readDataEditorFrame().evaluate(async () => {
            const variableResult = await window.dialogForge.writeVariableMetadata({
                objectName: "test",
                variableName: "Opinion",
                metadataKey: "label",
                value: "Shared metadata route"
            });
            const valueLabelResult = await window.dialogForge.writeValueLabels({
                objectName: "test",
                variableName: "Gender",
                labels: [
                    { value: 1, label: "Shared male" },
                    { value: 2, label: "Shared female" }
                ]
            });
            const declaredMissingResult = await window.dialogForge.writeDeclaredMissing({
                objectName: "test",
                variableName: "Gender",
                values: [
                    { value: 2, label: "Shared missing" }
                ]
            });
            const variables = await window.dialogForge.readVariableMetadata("test");
            const valueLabels = await window.dialogForge.readValueLabels("test");
            const declaredMissing = await window.dialogForge.readDeclaredMissing("test");

            return {
                variableStatus: variableResult?.status,
                valueLabelStatus: valueLabelResult?.status,
                declaredMissingStatus: declaredMissingResult?.status,
                opinionLabel: variables?.variables?.find(
                    (variable) => variable?.name === "Opinion"
                )?.label,
                genderLabels: valueLabels?.valueLabels?.find(
                    (entry) => entry?.variable === "Gender"
                )?.labels,
                genderMissing: declaredMissing?.declaredMissing?.find(
                    (entry) => entry?.variable === "Gender"
                )?.values
            };
        });

        assert.strictEqual(sharedMetadataRoutes.variableStatus, "updated");
        assert.strictEqual(sharedMetadataRoutes.valueLabelStatus, "updated");
        assert.strictEqual(sharedMetadataRoutes.declaredMissingStatus, "updated");
        assert.strictEqual(sharedMetadataRoutes.opinionLabel, "Shared metadata route");
        assert.ok(sharedMetadataRoutes.genderLabels.some((entry) => {
            return entry?.label === "Shared male";
        }));
        assert.ok(sharedMetadataRoutes.genderMissing.some((entry) => {
            return entry?.label === "Shared missing";
        }));
        await page.locator(".dialogforge-web-data-editor-window .dialogforge-web-dialog__close").click();
        await page.locator(".dialogforge-web-data-editor-layer").waitFor({ state: "hidden", timeout: 10000 });
        await page.evaluate(() => {
            window.dialogForgeWebConsole?.coordinator?.focus?.();
        });
        assert.strictEqual(
            await page.locator("#consoleToolbarRestart").isDisabled(),
            false
        );
        assert.ok(
            String(await page.locator("#consoleTerminal .margin-view-overlays").textContent())
                .includes(">")
        );
        assert.strictEqual(
            await page.evaluate(() => window.dialogForgeWebConsole.coordinator.getText()),
            ""
        );
        await typeConsoleCommand(page, "1 + 1");
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => {
            return document.body.classList.contains("console-runtime-busy")
                || document.querySelector("#consoleTerminal")?.textContent?.includes("[1] 2");
        });
        assert.ok(await page.evaluate(() => {
            if (!document.body.classList.contains("console-runtime-busy")) {
                return true;
            }

            return Boolean(document.querySelector("#consoleToolbarStop")?.offsetParent);
        }));
        await page.locator("#consoleTerminal", {
            hasText: "[1] 2"
        }).waitFor({ timeout: 30000 });
        await page.waitForFunction(() => {
            return !document.body.classList.contains("console-runtime-busy");
        }, { timeout: 30000 });
        assert.ok(await page.evaluate(() => {
            return window.dialogForgeWebConsole.commandHistory
                .getInputHistory()
                .includes("1 + 1");
        }));
        await typeConsoleCommand(page, "?print");
        await page.keyboard.press("Enter");
        await page.locator(".dialogforge-web-help-window")
            .waitFor({ state: "visible", timeout: 30000 });
        await page.frameLocator(".dialogforge-web-help-frame")
            .frameLocator("#helpFrame")
            .locator("body", { hasText: "Print Values" })
            .waitFor({ timeout: 30000 });
        await page.locator(
            ".dialogforge-web-help-window .dialogforge-web-dialog__close"
        ).click();
        await page.locator(".dialogforge-web-help-layer")
            .waitFor({ state: "hidden" });
        await typeConsoleCommand(page, "test$");
        assert.ok(await page.evaluate(async () => {
            const model = window.dialogForgeWebConsole.completionModel;
            const context = model.getCompletionContext("test$");
            const suggestions = await model.getRuntimeCompletionSuggestions(
                context,
                "test$",
                6,
                2500
            );

            return suggestions.some((item) => {
                return String(item.label || "") === "Gender";
            });
        }));
        await typeConsoleCommand(page, "mean");
        await page.waitForFunction(() => {
            return document.activeElement?.classList?.contains("native-edit-context");
        }, null, { timeout: 10000 });
        await page.keyboard.press("F1");
        await page.locator(".dialogforge-web-help-window", {
            hasText: "R Help"
        }).waitFor({ state: "visible", timeout: 30000 });
        {
            const beforeHelpResize = await page.locator(".dialogforge-web-help-window").boundingBox();
            const helpResizeHandle = await page.locator('.dialogforge-web-help-window .web-workbench-resize-handle[data-resize-direction="corner"]').boundingBox();

            assert.ok(beforeHelpResize && helpResizeHandle);
            await page.mouse.move(
                helpResizeHandle.x + helpResizeHandle.width - 3,
                helpResizeHandle.y + helpResizeHandle.height - 3
            );
            await page.mouse.down();
            await page.mouse.move(
                helpResizeHandle.x + helpResizeHandle.width - 83,
                helpResizeHandle.y + helpResizeHandle.height - 63
            );
            await page.mouse.up();

            const afterHelpResize = await page.locator(".dialogforge-web-help-window").boundingBox();

            assert.ok(afterHelpResize && afterHelpResize.width < beforeHelpResize.width - 40);
            assert.ok(afterHelpResize && afterHelpResize.height < beforeHelpResize.height - 30);
        }
        const helpShell = page.frameLocator(".dialogforge-web-help-frame");
        const helpDocument = helpShell.frameLocator("#helpFrame");

        await helpDocument.locator("body", {
            hasText: "mean"
        }).waitFor({ timeout: 30000 });
        // F1 permits a search chooser for an unqualified name. Select its
        // actual base-R result before asserting the rendered mean document.
        await helpDocument.locator('a[href*="/library/base/html/mean.html"]').first().click();
        await helpDocument.locator("body", {hasText: "Arithmetic Mean"}).waitFor({timeout: 30000});
        await page.locator(".dialogforge-web-help-window", {
            hasText: /R Help.*Arithmetic Mean/
        }).waitFor({ state: "visible", timeout: 30000 });
        assert.strictEqual(await helpShell.locator("#helpRunExamples").count(), 0);
        await helpDocument.locator("[class^='mtk'], [class*=' mtk']").first().waitFor({ timeout: 30000 });
        assert.ok(await page.evaluate(async () => {
            const result = await window.dialogForge.fetchRHelpPage(
                `${window.location.origin}/library/base/html/mean.html`
            );

            return result
                && result.ok === true
                && /Arithmetic Mean|mean/.test(String(result.text || ""));
        }));
        assert.ok(await page.evaluate(async () => {
            const result = await window.dialogForge.fetchRHelpPage(
                `${window.location.origin}/library/base/html/00Index.html`
            );

            return result
                && result.ok === true
                && String(result.text || "").includes("The R Base Package")
                && String(result.text || "").includes("mean.html");
        }));
        const exampleFetch = await page.evaluate(async () => {
            const result = await window.dialogForge.fetchRHelpPage(
                `${window.location.origin}/library/base/Example/mean`
            );

            return {
                ok: Boolean(result && result.ok === true),
                text: String(result?.text || "")
            };
        });
        const hasNativeExamplePage = exampleFetch.ok
            && exampleFetch.text.includes("Examples for")
            && exampleFetch.text.includes("class=\"source\"");

        assert.strictEqual(exampleFetch.ok, true);
        assert.strictEqual(exampleFetch.text.includes("mean>"), false);
        if (!hasNativeExamplePage) {
            assert.ok(
                exampleFetch.text.includes("knitr"),
                "WebR help examples must either render the native R examples page or explain that knitr is missing"
            );
        }
        await helpDocument.locator("a", { hasText: "Run examples" }).click();
        if (hasNativeExamplePage) {
            await helpDocument.locator("body", {
                hasText: "Examples for"
            }).waitFor({ timeout: 30000 });
            await helpDocument.locator(".source").first().waitFor({ timeout: 30000 });
            await helpDocument.locator("[class^='mtk'], [class*=' mtk']").first().waitFor({ timeout: 30000 });
        }
        else {
            await helpDocument.locator("body", {
                hasText: "knitr"
            }).waitFor({ timeout: 30000 });
        }
        assert.strictEqual(await helpDocument.locator("body", { hasText: "mean>" }).count(), 0);
        assert.strictEqual(
            await page.locator("#consoleTerminal", {
                hasText: 'example("mean", package = "base")'
            }).count(),
            0
        );
        await page.locator(".dialogforge-web-help-window .dialogforge-web-dialog__close").click();
        await page.locator(".dialogforge-web-help-layer").waitFor({ state: "hidden" });
        await runConsoleCommand(page, "library(declared)");
        await typeConsoleCommand(page, "?wtable");
        await page.keyboard.press("Enter");
        await page.locator(".dialogforge-web-help-window", {
            hasText: "R Help"
        }).waitFor({ state: "visible", timeout: 30000 });
        await page.frameLocator(".dialogforge-web-help-frame").frameLocator("#helpFrame").locator("body", {
            hasText: "Compute weighted summaries for declared objects"
        }).waitFor({ timeout: 30000 });
        await page.locator(".dialogforge-web-help-window .dialogforge-web-dialog__close").click();
        await page.locator(".dialogforge-web-help-layer").waitFor({ state: "hidden" });
        await typeConsoleCommand(page, "?plot");
        await page.keyboard.press("Enter");
        await page.locator(".dialogforge-web-help-window")
            .waitFor({ state: "visible", timeout: 30000 });
        await page.frameLocator(".dialogforge-web-help-frame").frameLocator("#helpFrame").locator("body", {
            hasText: "plot"
        }).waitFor({ timeout: 30000 });
        await page.locator("#consoleTerminal", {
            hasText: "No default value"
        }).waitFor({ state: "hidden", timeout: 1000 }).catch(() => {});
        await page.locator(".dialogforge-web-help-window .dialogforge-web-dialog__close").click();
        await page.locator(".dialogforge-web-help-layer").waitFor({ state: "hidden" });
        const plotWarmup = await page.evaluate(async () => {
            return window.dialogForgeWebConsole.waitForPlotWarmup();
        });
        assert.strictEqual(plotWarmup.frameReady, true);
        assert.strictEqual(plotWarmup.graphicsWarm, true);
        await typeConsoleCommand(page, "plot(1:11)");
        const firstPlotStartedAt = Date.now();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => {
            const layer = document.querySelector(".dialogforge-web-plot-layer");

            return layer
                && getComputedStyle(layer).display !== "none"
                && layer.classList.contains("dialogforge-web-dialog-layer");
        }, null, { timeout: 30000 });
        const firstPlotVisibleAt = Date.now();
        const plotFrame = page.frameLocator(".dialogforge-web-plot-frame");
        await plotFrame.locator("#frame").waitFor({ state: "visible", timeout: 30000 });
        await page.waitForFunction(() => {
            const frame = document.querySelector(".dialogforge-web-plot-frame");
            const image = frame?.contentDocument?.querySelector("#frame");

            return image
                && String(image.getAttribute("src") || "").startsWith("blob:")
                && image.naturalWidth > 0
                && image.naturalHeight > 0;
        }, null, { timeout: 30000 });
        const firstPlotImageReadyAt = Date.now();
        console.log(JSON.stringify({case: "first-warmed-plot", commandToImageMs: firstPlotImageReadyAt - firstPlotStartedAt, visibleToImageMs: firstPlotImageReadyAt - firstPlotVisibleAt}));
        assert.ok(
            firstPlotImageReadyAt - firstPlotVisibleAt < 500,
            `First plot should render quickly after modal visibility; observed ${firstPlotImageReadyAt - firstPlotVisibleAt}ms after ${firstPlotVisibleAt - firstPlotStartedAt}ms command latency.`
        );
        assert.ok(
            firstPlotImageReadyAt - firstPlotStartedAt < 1800,
            `First warmed plot should not move the startup wait to the console; observed ${firstPlotImageReadyAt - firstPlotStartedAt}ms from command submission to rendered image.`
        );
        await page.locator(".dialogforge-web-plot-window .dialogforge-web-dialog__close").click();
        await runConsoleCommand(page, "plot(1:7)");
        await page.waitForFunction(() => {
            const frame = document.querySelector(".dialogforge-web-plot-frame");
            const history = frame?.contentDocument?.querySelectorAll(".plot-thumb");
            const image = frame?.contentDocument?.querySelector("#frame");

            return history
                && history.length >= 2
                && image
                && String(image.getAttribute("src") || "").startsWith("blob:")
                && image.naturalWidth > 0
                && image.naturalHeight > 0;
        }, null, { timeout: 30000 });
        await plotFrame.locator("#saveButton").click();
        assert.deepStrictEqual(
            await plotFrame.locator("#saveFormatSelect option").evaluateAll((options) => {
                return options.map((option) => option.value);
            }),
            ["png"]
        );
        await plotFrame.locator("#saveCancelButton").click();
        await plotFrame.locator(".plot-thumb").first().click();
        await plotFrame.locator(".plot-thumb.is-active").waitFor({ state: "visible", timeout: 30000 });
        {
            const beforePlotResize = await page.locator(".dialogforge-web-plot-window").boundingBox();
            const plotResizeHandle = await page.locator('.dialogforge-web-plot-window .web-workbench-resize-handle[data-resize-direction="corner"]').boundingBox();

            assert.ok(beforePlotResize && plotResizeHandle);
            await page.mouse.move(
                plotResizeHandle.x + plotResizeHandle.width - 3,
                plotResizeHandle.y + plotResizeHandle.height - 3
            );
            await page.mouse.down();
            await page.mouse.move(
                plotResizeHandle.x + plotResizeHandle.width - 83,
                plotResizeHandle.y + plotResizeHandle.height - 63
            );
            await page.mouse.up();

            const afterPlotResize = await page.locator(".dialogforge-web-plot-window").boundingBox();

            assert.ok(afterPlotResize && afterPlotResize.width < beforePlotResize.width - 40);
            assert.ok(afterPlotResize && afterPlotResize.height < beforePlotResize.height - 30);
        }
        await page.locator(".dialogforge-web-plot-window .dialogforge-web-dialog__close").click();
        await page.locator(".dialogforge-web-plot-layer").waitFor({ state: "hidden" });
        await page.locator("#workspacePaneToggle").click();
        assert.ok(await page.evaluate(() => {
            return document.body.classList.contains("web-workspace-collapsed");
        }));
        assert.ok(await page.evaluate(() => {
            return Boolean(document.querySelector("#workspacePaneToggle .codicon-chevron-right"));
        }));
        await page.locator("#workspacePaneToggle").click();
        assert.ok(await page.evaluate(() => {
            return Boolean(document.querySelector("#workspacePaneToggle .codicon-chevron-left"));
        }));
        {
            const beforeToggle = await page.evaluate(() => {
                return {
                    consoleWidth: document.querySelector(".web-console").getBoundingClientRect().width,
                    toolbarHeight: document.getElementById("consoleToolbar").getBoundingClientRect().height,
                    workspaceHeaderHeight: document.querySelector(".workspace-pane-header").getBoundingClientRect().height
                };
            });

            await page.locator("#workspacePaneToggle").click();
            const collapsedToggle = await page.evaluate(() => {
                return {
                    consoleWidth: document.querySelector(".web-console").getBoundingClientRect().width,
                    workbenchWidth: document.getElementById("webWorkbenchWindow").getBoundingClientRect().width
                };
            });

            await page.locator("#workspacePaneToggle").click();
            const expandedToggle = await page.evaluate(() => {
                return {
                    consoleWidth: document.querySelector(".web-console").getBoundingClientRect().width,
                    workbenchWidth: document.getElementById("webWorkbenchWindow").getBoundingClientRect().width
                };
            });

            assert.ok(Math.abs(beforeToggle.consoleWidth - collapsedToggle.consoleWidth) < 2);
            assert.ok(Math.abs(beforeToggle.consoleWidth - expandedToggle.consoleWidth) < 2);
            assert.ok(expandedToggle.workbenchWidth > collapsedToggle.workbenchWidth + 200);
            assert.ok(Math.abs(beforeToggle.toolbarHeight - beforeToggle.workspaceHeaderHeight) < 1);
        }
        await page.locator("#consoleToolbarRestart").click();
        // Ready can still describe the previous session immediately after click.
        // Wait for the toolbar's actual completion before loading the new scope.
        await page.locator("#consoleTerminal", {hasText: /WebR [0-9.]+ restarted[.]/}).waitFor({timeout: 90000});
        await page.locator('#consoleTerminal [data-session-phase="ready"][data-runtime-busy="false"]').waitFor({state: "visible", timeout: 30000});
        await page.waitForFunction(() => {
            return window.dialogForgeWebConsole?.session?.getSessionPhase?.() === "ready";
        }, { timeout: 90000 });
        await runConsoleCommand(page, `test <- readRDS(url("http://127.0.0.1:${port}${renderedDatasetFixtureRoute}", "rb"))`);
        await page.locator("#consoleActiveDataset", {
            hasText: renderedDatasetName
        }).waitFor({ timeout: 30000 });
        await page.waitForFunction(async () => {
            const model = window.dialogForgeWebConsole?.completionModel;
            const context = model?.getCompletionContext("test$");

            if (!model || context?.objectName !== "test") {
                return false;
            }

            const suggestions = await model.getRuntimeCompletionSuggestions(
                context,
                "test$",
                6,
                2500
            );

            return suggestions.some((item) => String(item.label || "") === "Gender");
        }, null, { timeout: 30000 });
        await typeConsoleCommand(page, "if (TRUE) {");
        await page.keyboard.press("Enter");
        try {
            await page.waitForFunction(() => {
                return /^if \(TRUE\) \{\r?\n[ \t]*$/.test(window.dialogForgeWebConsole.coordinator.getText());
            });
        } catch (error) {
            console.error("CONTINUATION_DIAGNOSTIC", await page.evaluate(() => ({input: window.dialogForgeWebConsole.coordinator.getText(), phase: window.dialogForgeWebConsole.session.getSessionPhase(), activeClass: document.activeElement?.className, transcript: document.querySelector("#consoleTerminal")?.innerText.slice(-2000), suggestionsVisible: Boolean(document.querySelector(".suggest-widget.visible"))})));
            throw error;
        }
        assert.ok(
            String(await page.locator("#consoleTerminal .margin-view-overlays").textContent())
                .includes("+")
        );
        await typeConsoleCommand(page, "");
        await typeConsoleCommand(page, "mean(x = 1:3)");
        assert.ok(await page.evaluate(() => {
            const tokens = window.monaco.editor.tokenize("mean(x = 1:3)", "r")[0] || [];

            return tokens.some((token) => {
                return String(token.type || "").includes("function.call");
            });
        }));

        await page.locator("#webMenuBar .web-menu-button", {
            hasText: "Analyze"
        }).waitFor({ state: "visible" });
        await page.locator("#webMenuBar .web-menu-button", {
            hasText: "Packages"
        }).waitFor({ state: "visible" });
        await page.locator("#webMenuBar .web-menu-button", {
            hasText: "Language"
        }).waitFor({ state: "visible" });
        await page.locator("#webMenuBar .web-menu-button", {
            hasText: "Language"
        }).click();
        await page.locator("#webMenuBar .web-menu-item", {
            hasText: "Ελληνικά"
        }).waitFor({ state: "visible" });
        await page.keyboard.press("Escape");
        await page.locator("#webMenuBar .web-menu-button", {
            hasText: "About"
        }).click();
        await page.locator("#webMenuBar .web-menu-item", {
            hasText: "Application"
        }).click();
        const aboutFrame = page.frameLocator('iframe[title="About DialogR"]');
        await aboutFrame.locator("#aboutTitle", {
            hasText: "About DialogR"
        }).waitFor({ state: "visible" });
        await aboutFrame.locator("#aboutBody", {
            hasText: "DialogR is a desktop application for statistical analysis"
        }).waitFor({ state: "visible" });
        await aboutFrame.locator("#authorName", {
            hasText: "Adrian Dușa"
        }).waitFor({ state: "visible" });
        assert.strictEqual(await page.locator("#consoleTranscript", {
            hasText: "aboutTitle"
        }).count(), 0);
        assert.strictEqual(await page.locator("#consoleTranscript", {
            hasText: "null is not an object"
        }).count(), 0);
        await page.locator('[data-surface-id="about"] .dialogforge-web-dialog__close').click();
        assert.strictEqual(await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll("#webMenuBar .web-menu-root > .web-menu-button"));
            const button = buttons.find((entry) => String(entry.textContent || "").trim() === "Packages");

            return button?.disabled === true;
        }), false);
        await page.locator("#webMenuBar .web-menu-button", {
            hasText: "Packages"
        }).click();
        await page.locator("#webMenuBar .web-menu-item", {
            hasText: "Install required R packages"
        }).waitFor({ state: "visible" });
        assert.strictEqual(await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll("#webMenuBar .web-menu-item"));
            const button = buttons.find((entry) => String(entry.textContent || "").trim() === "Install required R packages");

            return button?.disabled === true;
        }), false);
        await page.keyboard.press("Escape");
        await page.locator("#webMenuBar .web-menu-button", {
            hasText: "Edit"
        }).click();
        await page.locator('#webMenuBar .web-menu-separator[data-menu-separator="EditNavigationSeparator"]').waitFor({
            state: "visible"
        });
        assert.strictEqual(
            await page.locator("#webMenuBar .web-menu-item", {
                hasText: "EditNavigationSeparator"
            }).count(),
            0
        );
        await page.keyboard.press("Escape");
        await page.locator("#webMenuBar .web-menu-button", {
            hasText: "Analyze"
        }).click();
        await page.locator("#webMenuBar .web-menu-item", {
            hasText: "Descriptive statistics"
        }).waitFor({ state: "visible" });
        await page.keyboard.press("Escape");

        const openDialogFromMenu = async function(label, menuLabel = label) {
            await openMenuItem(page, menuLabel);
        };

        await page.evaluate(() => {
            window.localStorage.removeItem("app.scriptEditor.tabs.v1");
        });
        await openDialogFromMenu("Script editor");
        await page.locator(".dialogforge-web-script-editor-window", {
            hasText: "Script editor"
        }).waitFor({ state: "visible", timeout: 30000 });
        const scriptEditorFrame = page.frameLocator(".dialogforge-web-script-editor-frame");
        const readScriptEditorFrame = function() {
            const frame = page.frames().find((candidate) => {
                return candidate.url().includes("/src/base-app/pages/scriptEditor.html");
            });

            assert.ok(frame, "shared Script Editor iframe must be attached");

            return frame;
        };

        await scriptEditorFrame.locator(".dm-script-toolbar").waitFor({ state: "visible", timeout: 30000 });
        await scriptEditorFrame.locator(".dm-script-tab.active", {
            hasText: "Untitled"
        }).waitFor({ state: "visible", timeout: 30000 });
        await scriptEditorFrame.locator(".monaco-editor").first().waitFor({ state: "visible", timeout: 30000 });
        await scriptEditorFrame.locator(".margin-view-overlays", {
            hasText: "1"
        }).waitFor({ state: "visible", timeout: 30000 });
        assert.ok(await readScriptEditorFrame().evaluate(() => {
            const editorNode = document.querySelector(".monaco-editor");
            const toolbarNode = document.querySelector(".dm-script-toolbar");
            const editorRect = editorNode?.getBoundingClientRect();
            const toolbarRect = toolbarNode?.getBoundingClientRect();

            return Boolean(
                editorRect
                && toolbarRect
                && editorRect.width > 200
                && editorRect.height > 200
                && toolbarRect.width > 200
                && toolbarRect.height > 20
                && window.monaco?.editor?.getEditors?.().length > 0
            );
        }), "shared Script Editor must paint a nonblank toolbar and Monaco editor");
        await scriptEditorFrame.locator(".monaco-editor .view-lines").first().click();
        await page.keyboard.insertText("3 + 4");
        await scriptEditorFrame.locator(".dm-script-tab.active", {
            hasText: "•"
        }).waitFor({ timeout: 10000 });
        await scriptEditorFrame.locator(".dm-script-btn-run").first().click();
        await page.locator("#consoleTerminal", {
            hasText: "[1] 7"
        }).waitFor({ timeout: 30000 });
        await scriptEditorFrame.locator(".dm-script-btn-new").click();
        await scriptEditorFrame.locator(".dm-script-tab").nth(1).waitFor({ timeout: 10000 });
        assert.strictEqual(await scriptEditorFrame.locator(".dm-script-tab").count(), 2);
        await scriptEditorFrame.locator(".monaco-editor .view-lines").first().click();
        await page.keyboard.insertText("10 + 5");
        await scriptEditorFrame.locator(".dm-script-btn-run").first().click();
        await page.locator("#consoleTerminal", {
            hasText: "[1] 15"
        }).waitFor({ timeout: 30000 });
        await scriptEditorFrame.locator(".dm-script-tab").first().click();
        await scriptEditorFrame.locator(".dm-script-tab.active", {
            hasText: "Untitled •"
        }).waitFor({ timeout: 10000 });
        await page.locator(".dialogforge-web-script-editor-window .dialogforge-web-dialog__close").click();
        for (let dirtyTab = 0; dirtyTab < 2; dirtyTab += 1) {
            const prompt = page.locator(".dialogforge-web-confirm", {
                hasText: "Save changes"
            });

            await prompt.waitFor({ state: "visible", timeout: 10000 });
            await prompt.locator(".dialogforge-web-confirm__button", {
                hasText: "Don't Save"
            }).click();
        }
        await page.locator(".dialogforge-web-script-editor-layer").waitFor({ state: "hidden", timeout: 10000 });

        const waitForDialogReady = async function(dialogId) {
            await page.waitForFunction((expectedDialogId) => {
                const layer = document.querySelector(
                    `.dialogforge-web-dialog-layer[data-dialog-id="${CSS.escape(expectedDialogId)}"]`
                );

                return Boolean(
                    layer
                    && !document.body.classList.contains("console-cover-visible")
                );
            }, dialogId, { timeout: 30000 });
        };

        const assertCheckboxDefaults = async function(frame, dialogId) {
            const source = JSON.parse(fs.readFileSync(path.join(
                dialogRRoot, "dialogs/r", dialogId, "dialog.json"
            ), "utf8"));

            for (const element of source.elements) {
                if (element.type === "Checkbox") {
                    await assertDialogControlState(frame, element.nameid, {
                        checked: element.isChecked === true
                    });
                }
            }
        };

        const runDialog = async function(plan) {
            await openDialogFromMenu(plan.label, plan.menuLabel);
            await page.locator(".dialogforge-web-dialog-layer:not([inert])").waitFor({ state: "visible" });
            await page.locator(".dialogforge-web-dialog-layer:not([inert]) .dialogforge-web-dialog__frame").waitFor({ state: "attached" });
            await waitForDialogReady(plan.id);

            const frame = page.frameLocator(".dialogforge-web-dialog-layer:not([inert]) .dialogforge-web-dialog__frame");

            await frame.locator("#paper").waitFor({ state: "attached" });
            await frame.locator("#paper .dm-el").first().waitFor({ state: "visible" });
            await frame.locator(".smart-button").first().waitFor({ state: "visible" });

            await assertCheckboxDefaults(frame, plan.id);

            const modalTitle = await page.locator(".dialogforge-web-dialog-layer:not([inert]) .dialogforge-web-dialog__title").textContent();
            const frameSource = await page.locator(".dialogforge-web-dialog-layer:not([inert]) .dialogforge-web-dialog__frame").getAttribute("src");
            const modalBox = await page.locator(".dialogforge-web-dialog-layer:not([inert]) .dialogforge-web-dialog").boundingBox();
            const frameBox = await page.locator(".dialogforge-web-dialog-layer:not([inert]) .dialogforge-web-dialog__frame").boundingBox();

            assert.strictEqual(modalTitle, plan.label);
            assert.ok(frameSource.includes(`dialog=${plan.id}`));
            assert.ok(modalBox && modalBox.width > 300 && modalBox.height > 200);
            if (plan.contentWidth && plan.contentHeight) {
                assert.ok(Math.abs(frameBox.width - plan.contentWidth) < 2);
                assert.ok(Math.abs(frameBox.height - plan.contentHeight) < 2);
            }

            const datasetSelection = (plan.selections || []).find((selection) => {
                return selection.name === "c_datasets";
            });

            if (datasetSelection) {
                await selectControl(frame, datasetSelection.name, datasetSelection.value);
            }

            if (plan.expectedOptions) {
                for (const expected of plan.expectedOptions) {
                    for (const value of expected.values) {
                        try {
                            await frame.locator(
                                `[data-control-name="${expected.name}"] .container-item`,
                                { hasText: value }
                            ).waitFor({ state: "visible", timeout: 30000 });
                        }
                        catch (error) {
                            const rendered = await frame.locator(`[data-control-name="${expected.name}"]`).evaluateAll((nodes) => {
                                return nodes.map((node) => {
                                    return {
                                        tag: node.tagName,
                                        classes: node.getAttribute("class"),
                                        text: node.textContent
                                    };
                                });
                            });

                            throw new Error(`Control ${expected.name} did not render expected option ${value}: ${JSON.stringify(rendered)}`);
                        }
                    }

                    const options = await frame.locator(
                        `[data-control-name="${expected.name}"] .container-item`
                    ).evaluateAll((rows) => {
                        return rows.map((row) => String(row.textContent || "").trim()).filter(Boolean);
                    });
                    const activeOptions = await frame.locator(
                        `[data-control-name="${expected.name}"] .container-item.active`
                    ).evaluateAll((rows) => {
                        return rows.map((row) => String(row.textContent || "").trim()).filter(Boolean);
                    });
                    const activeOptionSet = new Set(activeOptions);
                    const pinnedOrder = activeOptions.concat(
                        expected.values.filter((value) => !activeOptionSet.has(value))
                    );
                    const matchesOrder = (order) => {
                        return options.length === order.length
                            && options.every((value, index) => value === order[index]);
                    };

                    assert.ok(
                        matchesOrder(expected.values)
                        || matchesOrder(pinnedOrder),
                        `Control ${expected.name} rendered an unexpected option order: ${JSON.stringify(options)}`
                    );

                    if (expected.disabledValues) {
                        const disabledOptions = await frame.locator(
                            `[data-control-name="${expected.name}"] .container-item-disabled`
                        ).evaluateAll((rows) => {
                            return rows.map((row) => String(row.textContent || "").trim()).filter(Boolean);
                        });

                        assert.deepStrictEqual(disabledOptions, expected.disabledValues);
                    }
                }
            }

            if (plan.expectedLoadedPackages) {
                for (const packageName of plan.expectedLoadedPackages) {
                    await page.locator("#consoleTerminal", {
                        hasText: `library(${packageName})`
                    }).waitFor({ timeout: 30000 });
                }
            }

            if (plan.expectedSearch) {
                await frame.locator(
                    `[data-control-name="${plan.expectedSearch.name}"] .container-item`,
                    { hasText: plan.expectedSearch.beforeVisible }
                ).waitFor({ state: "visible" });
                await frame.locator(`.dm-el.container[data-control-name="${plan.expectedSearch.name}"]`).hover();
                await page.keyboard.press("Control+F");
                await frame.locator(".preview-container-search-input").waitFor({ state: "visible" });
                await frame.locator(".preview-container-search-input").fill(plan.expectedSearch.query);
                await frame.locator(
                    `[data-control-name="${plan.expectedSearch.name}"] .container-item`,
                    { hasText: plan.expectedSearch.afterVisible }
                ).waitFor({ state: "visible" });
                assert.strictEqual(
                    await frame.locator(
                        `[data-control-name="${plan.expectedSearch.name}"] .container-item`,
                        { hasText: plan.expectedSearch.afterHidden }
                    ).isVisible(),
                    false
                );
                await page.keyboard.press("Escape");
                await frame.locator(".preview-container-search-input").waitFor({ state: "hidden" });
                await frame.locator(
                    `[data-control-name="${plan.expectedSearch.name}"] .container-item`,
                    { hasText: plan.expectedSearch.afterHidden }
                ).waitFor({ state: "visible" });
            }

            await page.mouse.move(modalBox.x + 120, modalBox.y + 14);
            await page.mouse.down();
            await page.mouse.move(modalBox.x + 160, modalBox.y + 42);
            await page.mouse.up();

            const draggedModalBox = await page.locator(".dialogforge-web-dialog-layer:not([inert]) .dialogforge-web-dialog").boundingBox();

            assert.ok(draggedModalBox.x > modalBox.x + 10);
            assert.ok(draggedModalBox.y > modalBox.y + 10);

            if (plan.expectRememberedPosition) {
                await page.locator(".dialogforge-web-dialog-layer:not([inert]) .dialogforge-web-dialog__close").click();
                await page.locator(".dialogforge-web-dialog-layer:not([inert])").waitFor({ state: "hidden" });
                await openDialogFromMenu(plan.label);
                await page.locator(".dialogforge-web-dialog-layer:not([inert])").waitFor({ state: "visible" });
                await page.locator(".dialogforge-web-dialog-layer:not([inert]) .dialogforge-web-dialog__frame").waitFor({ state: "attached" });
                await page.locator(".dialogforge-web-dialog-layer:not([inert]) .dialogforge-web-dialog__title", {
                    hasText: plan.label
                }).waitFor({ state: "visible" });
                await waitForDialogReady(plan.id);

                const restoredModalBox = await page.locator(".dialogforge-web-dialog-layer:not([inert]) .dialogforge-web-dialog").boundingBox();

                assert.ok(Math.abs(restoredModalBox.x - draggedModalBox.x) < 2);
                assert.ok(Math.abs(restoredModalBox.y - draggedModalBox.y) < 2);
            }

            for (const selection of plan.selections) {
                if (selection.name) {
                    await selectControl(frame, selection.name, selection.value);
                }
                else {
                    await frame.locator("select").nth(selection.index).selectOption(selection.value);
                }
            }
            for (const controlName of plan.clicks || []) {
                await clickControl(frame, controlName);
            }
            for (const fill of plan.fills || []) {
                await fillControl(frame, fill.name, fill.value);
            }
            for (const action of plan.actions || []) {
                if (action.type === "assert") {
                    await assertDialogControlState(frame, action.name, action.state);
                }
                else if (action.type === "assertSelect") {
                    const select = frame.locator("select", {
                        has: frame.locator(`option[value="${action.value}"]`)
                    });

                    assert.strictEqual(await select.isEnabled(), action.enabled);
                }
                else if (action.type === "click") {
                    await clickControl(frame, action.name);
                }
                else if (action.type === "select") {
                    await selectControl(frame, action.name, action.value);
                }
                else if (action.type === "fill") {
                    await fillControl(frame, action.name, action.value);
                }
                else {
                    throw new Error(`Unsupported dialog action: ${JSON.stringify(action)}`);
                }
            }

            {
                await page.locator("#command", {
                    hasText: plan.expectedCommand
                }).waitFor({ timeout: 10000 });
                if (plan.expectedCommandExact) {
                    await page.waitForFunction((expectedCommand) => {
                        return document.getElementById("command")?.dataset
                            .consoleSyntaxValue === expectedCommand;
                    }, plan.expectedCommandExact, {
                        timeout: 10000
                    });
                    assertDialogCommand(
                        await page.locator("#command").getAttribute(
                            "data-console-syntax-value"
                        ),
                        plan.expectedCommandExact,
                        `DialogR browser ${plan.id} preview`
                    );
                }
                assert.strictEqual(
                    await page.locator("#command").evaluate((node) => {
                        return String(node.textContent || "").endsWith("\n");
                    }),
                    false
                );
                assert.strictEqual(await page.locator("#commandPane").isVisible(), true);
                assert.strictEqual(await page.locator("#mainSplitter").isVisible(), true);
                {
                    const commandPaneBox = await page.locator("#commandPane").boundingBox();

                    assert.ok(commandPaneBox && commandPaneBox.height >= 56);
                    assert.ok(commandPaneBox.height < 180);
                }
            }
            await clickSmartButton(frame, plan.buttonLabel || "Run");
            await page.locator("#consoleTerminal", {
                hasText: plan.expectedCommand
            }).waitFor({ timeout: 30000 });
            {
                const inputCodes = await page.evaluate(() => {
                    return Array.from(
                        document.querySelectorAll("#consoleTerminal [data-console-input-line=\"true\"]")
                    ).map((line) => String(line.dataset.consoleInputCode || ""));
                });
                const finalInputLine = inputCodes[inputCodes.length - 1] || "";

                assert.notStrictEqual(finalInputLine, "");
                if (plan.expectedCommandExact) {
                    assertTranscriptContainsDialogCommand(
                        inputCodes,
                        plan.expectedCommandExact,
                        `DialogR browser ${plan.id} transcript`
                    );
                }
                if (plan.expectedFinalInputLine) {
                    assert.strictEqual(finalInputLine, plan.expectedFinalInputLine);
                }
            }
            await page.locator("#commandPane").waitFor({ state: "hidden", timeout: 10000 });
            if (plan.expectedOutput) {
                for (const expectedOutput of plan.expectedOutput) {
                    await page.locator("#consoleTerminal", {
                        hasText: expectedOutput
                    }).waitFor({ timeout: 30000 });
                }
            }
            if (plan.expectedWorkspaceVariable) {
                await page.locator(
                    `#workspaceSummary [data-workspace-variable="${plan.expectedWorkspaceVariable}"]`
                ).waitFor({ timeout: 30000 });
            }
            await page.locator(".dialogforge-web-dialog-layer:not([inert])").waitFor({ state: "hidden" });
        };

        const openDialogFrame = async function(plan) {
            await openDialogFromMenu(plan.label, plan.menuLabel);
            await page.locator(".dialogforge-web-dialog-layer:not([inert])").waitFor({ state: "visible" });
            const layerSelector = `.dialogforge-web-dialog-layer[data-dialog-id="${plan.id}"]`;

            await page.locator(`${layerSelector} .dialogforge-web-dialog__frame`).waitFor({ state: "attached" });
            await waitForDialogReady(plan.id);

            const frame = page.frameLocator(`${layerSelector} .dialogforge-web-dialog__frame`);

            await frame.locator("#paper").waitFor({ state: "attached" });
            await assertCheckboxDefaults(frame, plan.id);
            await page.locator(`${layerSelector} .dialogforge-web-dialog__title`, {
                hasText: plan.label
            }).waitFor({ state: "visible" });

            return frame;
        };

        const selectControl = async function(frame, name, value) {
            const select = frame.locator(`select[data-control-name="${name}"]`);

            if (await select.count()) {
                await assertDialogTargetEnabled(select, name);
                await select.selectOption(value);
                return;
            }

            const row = frame.locator(
                `[data-control-name="${name}"] .container-item[data-value="${value}"], `
                + `[data-control-name="${name}"] .dm-choice-item[data-value="${value}"]`
            ).first();

            try {
                await row.waitFor({ state: "visible", timeout: 30000 });
            }
            catch (error) {
                const rendered = await frame.locator(`[data-control-name="${name}"]`).evaluateAll((nodes) => {
                    return nodes.map((node) => node.textContent || "").join("\n---\n");
                });

                throw new Error(`Control ${name} did not render value ${value}. Rendered content: ${rendered}`);
            }
            await assertDialogTargetEnabled(row, `${name}: ${value}`);
            if (await row.evaluate((node) => {
                return node.classList.contains("active")
                    || node.classList.contains("is-asc")
                    || node.classList.contains("is-desc");
            })) {
                return;
            }

            await row.click();
            await frame.locator(
                `[data-control-name="${name}"] .container-item.active[data-value="${value}"], `
                + `[data-control-name="${name}"] .dm-choice-item.active[data-value="${value}"], `
                + `[data-control-name="${name}"] .dm-choice-item.is-asc[data-value="${value}"], `
                + `[data-control-name="${name}"] .dm-choice-item.is-desc[data-value="${value}"]`
            ).first().waitFor({ state: "visible", timeout: 10000 });
        };

        const fillControl = async function(frame, name, value) {
            const textInput = frame.locator(`[data-control-name="${name}"] textarea, [data-control-name="${name}"] input`).last();

            if (await textInput.count()) {
                await assertDialogTargetEnabled(textInput, name);
                await textInput.fill(value);
                await textInput.press("Enter");
                return;
            }

            await frame.locator(`[data-control-name="${name}"]`).last().fill(value);
        };

        const clickControl = async function(frame, name) {
            await assertDialogTargetEnabled(frame.locator(`.dm-el[data-control-name="${name}"]`), name);
            const checkbox = frame.locator(`[data-control-name="${name}"] .custom-checkbox`).last();

            if (await checkbox.count()) {
                await checkbox.click();
                return;
            }

            const radio = frame.locator(`[data-control-name="${name}"] .custom-radio`).last();

            if (await radio.count()) {
                await radio.click();
                return;
            }

            const button = frame.locator(`[data-control-name="${name}"] .smart-button`).last();

            if (await button.count()) {
                await button.click();
                return;
            }

            await frame.locator(`[data-control-name="${name}"]`).last().click();
        };

        const clickSmartButton = async function(frame, label) {
            const button = frame.locator(
                ".smart-button",
                { hasText: label }
            ).first();

            await assertDialogTargetEnabled(button, label);
            await button.click();
        };

        await runConsoleCommand(page, `test <- readRDS(url("http://127.0.0.1:${port}${renderedDatasetFixtureRoute}", "rb"))`);
        await page.locator(`#workspaceSummary [data-workspace-variable="${renderedDatasetName}"]`).waitFor({ timeout: 30000 });

        {
            const frame = await openDialogFrame({
                id: "frequencies",
                label: "Frequency table"
            });

            await frame.locator(".smart-button").first().waitFor({ state: "visible" });
            await selectControl(frame, "c_datasets", renderedDatasetName);
            await selectControl(frame, "c_variables", "Gender");
            await page.locator("#command", {
                hasText: "wtable(Gender)"
            }).waitFor({ timeout: 10000 });
            await page.locator(".dialogforge-web-dialog-layer:not([inert]) .dialogforge-web-dialog__close").click();
            await page.locator(".dialogforge-web-dialog-layer:not([inert])").waitFor({ state: "hidden" });
            await page.locator("#commandPane").waitFor({ state: "hidden", timeout: 10000 });
        }

        const runStatefulDialog = async function(plan) {
            await openDialogFromMenu(plan.label);
            await page.locator(".dialogforge-web-dialog-layer:not([inert])").waitFor({ state: "visible" });
            const layerSelector = `.dialogforge-web-dialog-layer[data-dialog-id="${plan.id}"]`;

            await page.locator(`${layerSelector} .dialogforge-web-dialog__frame`).waitFor({ state: "attached" });
            await waitForDialogReady(plan.id);

            const frame = page.frameLocator(`${layerSelector} .dialogforge-web-dialog__frame`);

            await frame.locator("#paper").waitFor({ state: "attached" });
            await frame.locator("#paper .dm-el").first().waitFor({ state: "visible" });
            await frame.locator(".smart-button").first().waitFor({ state: "visible" });
            await assertCheckboxDefaults(frame, plan.id);

            for (const selection of plan.selections) {
                if (selection.name) {
                    await selectControl(frame, selection.name, selection.value);
                }
                else {
                    await frame.locator("select").nth(selection.index).selectOption(selection.value);
                }
            }

            if (plan.sourceControl && plan.targetValue) {
                await frame.locator(
                    `[data-control-name="${plan.sourceControl}"] .container-item.active[data-value="${plan.targetValue}"], `
                    + `[data-control-name="${plan.sourceControl}"] .dm-choice-item.active[data-value="${plan.targetValue}"]`
                ).first().waitFor({ state: "visible", timeout: 30000 });
            }

            await clickControl(frame, "addremove");
            if (plan.targetControl && plan.targetValue) {
                await frame.locator(
                    `[data-control-name="${plan.targetControl}"] .container-item[data-value="${plan.targetValue}"], `
                    + `[data-control-name="${plan.targetControl}"] .dm-choice-item[data-value="${plan.targetValue}"]`
                ).first().waitFor({ state: "visible", timeout: 30000 });
            }
            await clickSmartButton(frame, "OK");
            await page.locator(".dialogforge-web-dialog-layer:not([inert])").waitFor({ state: "hidden" });
            await page.locator(
                `[data-product-state-chip="${plan.expectedChipId}"] .dm-console-state-chip-value`,
                { hasText: plan.expectedChipValue }
            ).waitFor({ timeout: 30000 });
        };

        await runDialog({
            id: dialogRFrequencyBehavior.dialogId,
            label: "Frequency table",
            contentWidth: 340,
            contentHeight: 260,
            expectRememberedPosition: true,
            expectedOptions: [
                {
                    name: "c_variables",
                    values: renderedDatasetVariables,
                    disabledValues: renderedFrequencyDisabledVariables
                }
            ],
            expectedSearch: {
                name: "c_variables",
                query: "gen",
                beforeVisible: "Area",
                afterVisible: "Gender",
                afterHidden: "Area"
            },
            expectedLoadedPackages: ["admisc", "declared"],
            selections: dialogRFrequencyBehavior.selections,
            expectedCommand: "wtable(Gender)",
            expectedCommandExact: dialogRFrequencyBehavior.command,
            expectedFinalInputLine: ")",
            expectedOutput: [
                "Males",
                "Females",
                "215  1.000 100.0"
            ]
        });
        await runDialog({
            id: "crosstable",
            label: "Contingency table",
            expectedOptions: [
                {
                    name: "c_rows",
                    values: renderedDatasetVariables,
                    disabledValues: renderedCrosstableDisabledVariables
                },
                {
                    name: "c_cols",
                    values: renderedDatasetVariables,
                    disabledValues: renderedCrosstableDisabledVariables
                }
            ],
            selections: [
                { name: "c_datasets", value: renderedDatasetName },
                { name: "c_rows", value: "Gender" },
                { name: "c_cols", value: "Gender" }
            ],
            expectedCommand: "wtable(Gender, Gender)"
        });
        await runDialog({
            id: "onesamplettest",
            label: "One-sample t-test",
            expectedOptions: [
                {
                    name: "c_variables",
                    values: renderedDatasetVariables,
                    disabledValues: renderedOneSampleDisabledVariables
                }
            ],
            selections: [
                { name: "c_datasets", value: renderedDatasetName },
                { name: "c_variables", value: "Age" }
            ],
            expectedCommand: "t.test(Age"
        });
        {
            const summariesFrame = await openDialogFrame({
                id: "summaries",
                label: "Numerical summaries"
            });

            await selectControl(summariesFrame, "c_datasets", renderedDatasetName);
            await summariesFrame.locator('[data-control-name="c_variables"] .container-item', {
                hasText: "Age"
            }).waitFor({ state: "visible", timeout: 30000 });
            await summariesFrame.locator('[data-control-name="c_variables"] .container-item-disabled', {
                hasText: "Area"
            }).waitFor({ state: "visible", timeout: 30000 });
            await summariesFrame.locator('[data-control-name="c_variables"] .container-item-disabled', {
                hasText: "Gender"
            }).waitFor({ state: "visible", timeout: 30000 });
            await page.locator(".dialogforge-web-dialog-layer:not([inert]) .dialogforge-web-dialog__close").click();
            await page.locator(".dialogforge-web-dialog-layer:not([inert])").waitFor({ state: "hidden" });
        }
        await runDialog({
            id: "summaries",
            label: "Numerical summaries",
            selections: [
                { name: "c_datasets", value: renderedDatasetName },
                { name: "c_variables", value: "Age" }
            ],
            clicks: ["cb_mean"],
            expectedCommand: "wmean(Age)",
            expectedFinalInputLine: ")"
        });
        await runDialog({
            id: "independentsamplesttest",
            label: "Independent samples t-test",
            selections: [
                { name: "c_datasets", value: renderedDatasetName },
                { name: "c_testvar", value: "Age" },
                { name: "c_groupvar", value: "Gender" }
            ],
            actions: [
                { type: "assert", name: "r_yes", state: { enabled: false } },
                { type: "assert", name: "r_no", state: { checked: true, enabled: false } },
                { type: "click", name: "hvtest" },
                { type: "click", name: "r_yes" },
                { type: "click", name: "r_right" },
                { type: "fill", name: "input1", value: "90" }
            ],
            expectedCommand: "t.testhv(Age ~ Gender",
            expectedCommandExact: [
                "using(",
                "  test,",
                '  t.testhv(Age ~ Gender, alternative = "greater", var.equal = TRUE, conf.level = 0.9)',
                ")"
            ].join("\n"),
            expectedOutput: ["t-test"]
        });
        await runDialog({
            id: "anovahv",
            label: "One-way ANOVA",
            selections: [
                { name: "c_datasets", value: renderedDatasetName },
                { name: "c_testvar", value: "Age" },
                { name: "c_groupvar", value: "Gender" }
            ],
            actions: [
                { type: "assertSelect", value: "bonferroni", enabled: false },
                { type: "assert", name: "r_yes", state: { enabled: false } },
                { type: "click", name: "pairwise" },
                { type: "assertSelect", value: "bonferroni", enabled: true }
            ],
            expectedCommand: "pairwise.t.test(Age, Gender",
            expectedCommandExact: [
                "using(",
                "  test,",
                "  {",
                "    print(anovahv(Age ~ Gender, numsum = TRUE))",
                '    pairwise.t.test(Age, Gender, p.adjust.method = "bonferroni")',
                "  }",
                ")"
            ].join("\n"),
            expectedOutput: ["Pairwise comparisons"]
        });
        await runStatefulDialog({
            id: "splitby",
            label: "Split by groups",
            selections: [
                { name: "c_datasets", value: renderedDatasetName },
                { name: "c_variables", value: "Gender" }
            ],
            sourceControl: "c_variables",
            targetControl: "c_grouping",
            targetValue: "Gender",
            expectedChipId: "split-variables",
            expectedChipValue: "Gender"
        });
        await runStatefulDialog({
            id: "weightby",
            label: "Apply frequency weighting",
            selections: [
                { name: "c_datasets", value: renderedDatasetName },
                { name: "c_variables", value: "fweight" }
            ],
            sourceControl: "c_variables",
            targetControl: "c_weighting",
            targetValue: "fweight",
            expectedChipId: "weight-variable",
            expectedChipValue: "fweight"
        });
        await runDialog({
            id: "select",
            label: "Subset cases and variables",
            selections: [
                { name: "c_datasets", value: renderedDatasetName }
            ],
            actions: [
                { type: "assert", name: "c_variables", state: { enabled: false } },
                { type: "assert", name: "expression", state: { enabled: false } },
                { type: "click", name: "cb_allvars" },
                { type: "select", name: "c_variables", value: "Age" },
                { type: "click", name: "rd_new" },
                { type: "fill", name: "newname", value: "test_subset" },
                { type: "fill", name: "expression", value: "Age > 40" }
            ],
            expectedCommand: "test_subset <- subset(",
            expectedCommandExact: [
                "test_subset <- subset(",
                "  test,",
                "  Age > 40,",
                "  select = c(Age)",
                ")"
            ].join("\n"),
            expectedFinalInputLine: ")",
            buttonLabel: "OK",
            expectedWorkspaceVariable: "test_subset"
        });
        await runDialog({
            id: "recode",
            label: "Recode variables",
            selections: [
                { name: "c_datasets", value: renderedDatasetName },
                { name: "c_variables", value: "Area" }
            ],
            actions: [
                { type: "click", name: "r_old1" },
                { type: "fill", name: "i_value_old", value: "1" },
                { type: "click", name: "r_new1" },
                { type: "fill", name: "i_value_new", value: "10" },
                { type: "click", name: "b_add" },
                { type: "click", name: "checkbox1" },
                { type: "fill", name: "i_newvar", value: "Area_recoded" }
            ],
            expectedCommand: "Area_recoded <- recode(",
            expectedFinalInputLine: ")"
        });
        {
            await page.locator(`#workspaceSummary [data-workspace-variable="${renderedDatasetName}"]`).dblclick();
            await page.locator(".dialogforge-web-data-editor-window", {
                hasText: "Data editor: test"
            }).waitFor({ state: "visible", timeout: 30000 });
            await page.locator(".dialogforge-web-data-editor-window .dialogforge-web-dialog__close").click();
            await page.locator(".dialogforge-web-data-editor-layer").waitFor({ state: "hidden", timeout: 10000 });

            const frame = await openDialogFrame({
                id: "goto",
                label: "Go to...",
                menuLabel: "Go to variable..."
            });

            await frame.locator('[data-control-name="c_variables"] .container-item').first().waitFor({ state: "visible" });
            await selectControl(frame, "c_variables", "Gender");
            await clickSmartButton(frame, "Go");
            await page.locator('[data-dialog-id="goto"]').waitFor({ state: "hidden" });
            await page.locator(".dialogforge-web-data-editor-window", {
                hasText: "Data editor: test"
            }).waitFor({ state: "visible", timeout: 30000 });
            await page.locator(".dialogforge-web-data-editor-window .dialogforge-web-dialog__close").click();
            await page.locator(".dialogforge-web-data-editor-layer").waitFor({ state: "hidden", timeout: 10000 });
        }
        {
            const frame = await openDialogFrame({
                id: "sortby",
                label: "Sort cases"
            });

            await selectControl(frame, "c_datasets", renderedDatasetName);
            await selectControl(frame, "c_variables", "Gender");
            await frame.locator(".custom-checkbox").first().waitFor({ state: "visible" });
            await frame.locator(".dm-input textarea").first().waitFor({ state: "visible" });
            await frame.locator(".container-item", { hasText: "Gender" }).waitFor({ state: "visible" });
            await frame.locator(".dm-choice-list").first().waitFor({ state: "visible" });
            await frame.locator(".smart-button .smart-button-icon.codicon.codicon-arrow-right").waitFor({ state: "visible" });
            await clickControl(frame, "addremove");
            await frame.locator(".dm-choice-item", { hasText: "Gender" }).waitFor({ state: "visible" });
            await clickSmartButton(frame, "OK");
            await page.locator("#consoleTerminal", {
                hasText: "test <- test[order(test$Gender), ]"
            }).waitFor({ timeout: 30000 });
            await page.locator(".dialogforge-web-dialog-layer:not([inert])").waitFor({ state: "hidden" });
        }
        const screenshot = await page.screenshot();
        const title = await page.title();

        assert.strictEqual(title, "DialogR Web");
        assert.ok(screenshot.length > 2000);
    }
    finally {
        await browser.close();
        await close(server);
    }
};


(async () => {
    assertSourceContracts();
    assertRuntimePackageComposition();
    await assertServerContracts();
    await assertRenderedContracts();
    console.log("Browser-runnable DialogR web entry verified.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
