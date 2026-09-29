"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { _electron, chromium } = require("playwright");


// An explicit local measurement run in an isolated profile. No workspace saves
// or verifier suite. Results include only fixture provenance,
// timings, diagnostic records, workspace labels, and synthetic marker output.
const main = async function() {
    const [target, fixture, destination, scenarioSet] = process.argv.slice(2);

    if (!target || !fixture || !destination) {
        throw new Error("Usage: node scripts/measure-runtime-communication.js <product-path|http-url> <fixture.rds> <result.json>");
    }

    const browserTarget = /^https?:/.test(target);
    const started = performance.now();
    const app = browserTarget
        ? await chromium.launch({ headless: false })
        : await _electron.launch({
            executablePath: require("electron"),
            args: [path.resolve("dist/scripts/electron-main.js"), "--product-path", target],
            cwd: process.cwd(),
            env: {
                ...process.env,
                DIALOGFORGE_TEST_USER_DATA_PATH: fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-runtime-baseline-")),
                DIALOGFORGE_RUNTIME_DIAGNOSTICS: "1"
            }
        });
    const report = {
        target,
        fixture: {
            name: path.basename(fixture),
            bytes: fs.statSync(fixture).size,
            sha256: crypto.createHash("sha256").update(fs.readFileSync(fixture)).digest("hex")
        },
        runs: []
    };
    report.interactionVersion = 2;
    report.consoleSubmission = "Monaco keyboard input and Enter";
    let page;
    let memoryTimer;
    let memoryPending = false;
    const memory = { intervalMs: 250, samples: 0, peakTreeRssBytes: 0, peakByPid: {}, errors: 0 };

    try {
        const rootPid = browserTarget
            ? Number((await (await app.newBrowserCDPSession()).send("SystemInfo.getProcessInfo"))
                .processInfo.find((entry) => entry.type === "browser")?.id)
            : app.process().pid;
        const sampleMemory = async function() {
            if (memoryPending || !rootPid) {
                return;
            }
            memoryPending = true;
            try {
                const { stdout } = await promisify(execFile)("ps", ["-axo", "pid=,ppid=,rss="]);
                const rows = stdout.trim().split("\n").map((line) => line.trim().split(/\s+/).map(Number));
                const descendants = new Set([rootPid]);
                for (let pass = 0; pass < rows.length; pass += 1) {
                    const before = descendants.size;
                    rows.forEach(([pid, parent]) => {
                        if (descendants.has(parent)) {
                            descendants.add(pid);
                        }
                    });
                    if (before === descendants.size) {
                        break;
                    }
                }
                let bytes = 0;
                rows.forEach(([pid, , rss]) => {
                    if (descendants.has(pid)) {
                        bytes += rss * 1024;
                        memory.peakByPid[pid] = Math.max(memory.peakByPid[pid] || 0, rss * 1024);
                    }
                });
                memory.peakTreeRssBytes = Math.max(memory.peakTreeRssBytes, bytes);
                memory.samples += 1;
            }
            catch {
                memory.errors += 1;
            }
            finally {
                memoryPending = false;
            }
        };
        await sampleMemory();
        memoryTimer = setInterval(() => { void sampleMemory(); }, memory.intervalMs);
        if (browserTarget) {
            page = await app.newPage();
            await page.addInitScript(() => {
                globalThis.dialogForgeRuntimeDiagnostics = {
                    enabled: true,
                    dropped: 0,
                    entries: [],
                    clear() { this.entries.length = 0; this.dropped = 0; }
                };
            });
            await page.goto(target);
        }
        else {
            page = app.windows().find((candidate) => candidate.url().endsWith("/main.html"))
                || await app.firstWindow();
        }

        console.log("Waiting for console readiness", page.url());

        await page.waitForFunction(() => {
            return document.body.dataset.dialogForgeReady === "1"
                || Boolean(window.dialogForgeWebConsole);
        }, undefined, { timeout: 60000 });
        console.log("Console mounted");
        await page.waitForFunction(() => {
            return Boolean(document.querySelector('#consoleTerminal [data-session-phase="ready"]'))
                && !document.body.classList.contains("console-cover-visible");
        }, undefined, { timeout: 90000 });
        report.startupReadyMs = performance.now() - started;

        const readDiagnostics = async function(clear = false) {
            const read = function({ clear }) {
                const journal = globalThis.dialogForgeRuntimeDiagnostics;
                if (!journal) {
                    throw new Error("Runtime diagnostic journal is unavailable");
                }
                journal.enabled = true;
                const value = { entries: journal.entries.slice(), dropped: journal.dropped };
                if (clear) {
                    journal.clear();
                }
                return value;
            };

            return browserTarget
                ? page.evaluate(read, { clear })
                : app.evaluate((_, input) => {
                    const journal = globalThis.dialogForgeRuntimeDiagnostics;
                    if (!journal) {
                        throw new Error("Runtime diagnostic journal is unavailable");
                    }
                    const value = { entries: journal.entries.slice(), dropped: journal.dropped };
                    if (input.clear) {
                        journal.clear();
                    }
                    return value;
                }, { clear });
        };

        report.startupDiagnostics = await readDiagnostics(true);
        const query = async function(code) {
            return page.evaluate(async ({ query, browserTarget }) => {
                if (browserTarget) {
                    const result = await window.dialogForge.executeInvisibleMutation({ text: query });
                    return { status: result.ok ? "ready" : "failed" };
                }
                return window.dialogForge.executeInvisibleQuery({ query, source: "runtime.baseline" });
            }, { query: code, browserTarget });
        };

        const measure = async function(label, code, marker, interruptAfterMs = 0, promptReply = "") {
            await page.waitForFunction(() => {
                return !window.runtimeConfirmation?.pending
                    && !document.body.classList.contains("console-cover-visible")
                    && Boolean(document.querySelector('#consoleTerminal [data-session-phase="ready"]'));
            });
            await page.locator("#consoleTerminal [data-session-phase] .view-lines").click();
            await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
            // A final newline leaves completion suggestions out of the Enter
            // path without changing the submitted R expression.
            await page.keyboard.insertText(`${code}\n`);
            await page.waitForFunction((expected) => {
                const actual = document.getElementById("visibleCommandInput")
                    .dialogForgeConsoleInputView.getText();
                // Monaco may indent pasted lines. These synthetic commands do
                // not contain multiline string literals; compare every line's
                // content while permitting only its surrounding whitespace.
                const lines = (text) => text.trimEnd().split("\n")
                    .map((line) => line.trim()).join("\n");
                return lines(actual) === lines(expected);
            }, code);
            await readDiagnostics(true);
            await page.evaluate(({ marker }) => {
                const started = performance.now();
                const sample = { started, domMs: null, frameMs: null, readyMs: null, busyObserved: false, activity: "" };
                window.runtimeBaselineSample = sample;
                const inspect = function() {
                    const root = document.querySelector('#consoleTerminal [data-session-phase]');
                    if (root?.dataset.runtimeBusy === "true" || root?.dataset.sessionPhase === "busy") {
                        sample.busyObserved = true;
                    }
                    if (sample.busyObserved && root?.dataset.sessionPhase === "ready"
                        && root?.dataset.runtimeBusy === "false" && sample.readyMs === null) {
                        sample.readyMs = performance.now() - started;
                    }
                    if (!marker) {
                        if (sample.readyMs !== null) {
                            observer.disconnect();
                        }
                        return;
                    }
                    const candidates = document.querySelectorAll("#consoleTerminal [data-execution-id]");
                    for (const activity of candidates) {
                        const output = Array.from(activity.children).filter((child) => {
                            return !child.querySelector("[data-console-input-line]")
                                && !child.matches("[data-console-input-line]");
                        });
                        if (sample.domMs === null && output.some((child) => child.textContent.includes(marker))) {
                            sample.domMs = performance.now() - started;
                            sample.activity = activity.dataset.executionId;
                            requestAnimationFrame(() => {
                                sample.frameMs = performance.now() - started;
                            });
                        }
                    }
                    if (sample.readyMs !== null && sample.domMs !== null) {
                        observer.disconnect();
                    }
                };
                const observer = new MutationObserver(inspect);
                observer.observe(document.getElementById("consoleTerminal"), {
                    subtree: true, childList: true, characterData: true, attributes: true
                });
            }, { marker });
            await page.keyboard.press("Enter");
            if (promptReply) {
                const input = page.locator('#consoleTerminal input[type="text"]:visible');
                await page.waitForFunction(() => {
                    return window.runtimeBaselineSample.readyMs !== null
                        || Array.from(document.querySelectorAll('#consoleTerminal input[type="text"]'))
                            .some((element) => element.getClientRects().length > 0);
                }, undefined, { timeout: 15000 });
                const replyAvailable = await input.count() > 0;
                await page.evaluate((sent) => {
                    window.runtimeBaselineSample.promptReplySent = sent;
                }, replyAvailable);
                if (replyAvailable) {
                    await input.fill(promptReply);
                    await input.press("Enter");
                }
            }
            if (interruptAfterMs > 0) {
                await page.waitForTimeout(interruptAfterMs);
                const enabled = await page.locator("#consoleToolbarStop").isEnabled();
                await page.evaluate((enabled) => {
                    window.runtimeBaselineSample.interruptControl = enabled
                        ? "toolbar" : "runtime-bridge (toolbar disabled)";
                }, enabled);
                if (enabled) {
                    await page.locator("#consoleToolbarStop").click();
                }
                else {
                    await page.evaluate(async () => {
                        const result = await window.dialogForge.executeRuntimeMethod({
                            method: "runtime.interrupt",
                            params: {},
                            source: "runtime.baseline"
                        });
                        window.runtimeBaselineSample.interruptResult = {
                            status: result.status,
                            value: result.value
                        };
                    });
                }
            }
            await page.waitForFunction(() => window.runtimeBaselineSample.readyMs !== null,
                undefined, { timeout: 180000 });
            if (marker) {
                await page.waitForFunction(() => window.runtimeBaselineSample.frameMs !== null,
                    undefined, { timeout: 10000 });
            }
            await page.waitForTimeout(100);
            const renderer = await page.evaluate(() => window.runtimeBaselineSample);
            const workspace = await page.locator("[data-workspace-variable-row]").allTextContents();
            const workspaceVisible = await page.locator('[data-workspace-variable="probe"]').isVisible();
            const diagnostics = await readDiagnostics();
            const activeDataset = await page.locator("#consoleActiveDatasetName").textContent();
            const output = await page.locator("#consoleTerminal").innerText();
            report.runs.push({ label, interaction: "console-keyboard", renderer, workspace, workspaceVisible, activeDataset, output, diagnostics });
            console.log(JSON.stringify({ label, renderer, entries: diagnostics.entries.length }));
        };

        await measure("small-cold", 'cat("DFBASE_SMALL_0\\n")', "DFBASE_SMALL_0");
        await measure("buffered-output", 'cat("DFBASE_START\\n"); Sys.sleep(5); cat("DFBASE_FINISH\\n")', "DFBASE_START");

        if (browserTarget) {
            const chooser = page.waitForEvent("filechooser");
            await page.evaluate(() => {
                window.runtimeBaselineFile = window.dialogForge.selectImportFile();
            });
            await (await chooser).setFiles(fixture);
            report.fixtureLoad = await page.evaluate(async () => {
                const file = await window.runtimeBaselineFile;
                const result = await window.dialogForge.importData({
                    source: file.filePath, targetName: "ess9en", format: "rds"
                });
                return { status: result.status, message: result.message };
            });
        }
        else {
            const result = await query(`ess9en <- readRDS(${JSON.stringify(path.resolve(fixture))})`);
            report.fixtureLoad = { status: result.status };
        }
        if (browserTarget) {
            await page.evaluate(() => window.dialogForgeWebConsole.executeVisibleCommand(
                'cat(paste("DFBASE_RUNTIME", R.version.string, paste(dim(ess9en), collapse="x"), as.character(object.size(ess9en)), sep=" | "))'
            ));
            await page.waitForFunction(() => document.getElementById("consoleTerminal").innerText
                .split("\n").some((line) => line.startsWith("DFBASE_RUNTIME |")));
            report.runtime = await page.evaluate(() => document.getElementById("consoleTerminal").innerText
                .split("\n").find((line) => line.startsWith("DFBASE_RUNTIME |")));
        }
        else {
            report.runtime = (await query('paste(R.version.string, paste(dim(ess9en), collapse="x"), as.character(object.size(ess9en)), sep=" | ")')).value;
        }
        await measure("establish-baseline", 'probe <- 1; cat("DFBASE_SETUP\\n")', "DFBASE_SETUP");

        await measure("post-import-warmup", 'cat("DFBASE_WARMUP\\n")', "DFBASE_WARMUP");
        for (let index = 0; index < 5; index += 1) {
            await measure(`small-warm-${index}`, `cat("DFBASE_SMALL_${index + 1}\\n")`, `DFBASE_SMALL_${index + 1}`);
            await measure(`unchanged-assignment-${index}`, `probe <- 1; cat("DFBASE_NOOP_${index}\\n")`, `DFBASE_NOOP_${index}`);
        }

        if (!await page.locator('[data-workspace-variable="probe"]').isVisible()) {
            await page.locator("#workspacePaneToggle").click();
        }
        await page.locator('[data-workspace-variable="probe"]').waitFor({ state: "visible" });
        await measure("changed-assignment", 'probe <- 2; cat("DFBASE_CHANGED\\n")', "DFBASE_CHANGED");
        await measure("simple-copy", "probe_copy <- probe", null);
        await measure("unchanged-copy", "probe_copy <- probe", null);
        await measure("removal", 'rm(probe_copy); cat("DFBASE_REMOVED\\n")', "DFBASE_REMOVED");
        await measure("partial-error", 'probe <- 3; stop("DFBASE_EXPECTED_ERROR")', "DFBASE_EXPECTED_ERROR");
        await measure("unchanged-after-error", 'probe <- 3; cat("DFBASE_AFTER_ERROR\\n")', "DFBASE_AFTER_ERROR");

        if (scenarioSet === "--mutation-cases" || scenarioSet === "--finalize-cases") {
            await measure("assignment-equals", 'probe = 4; cat("DFMUT_EQUALS\\n")', "DFMUT_EQUALS");
            await measure("compact-left", 'probe<-5; cat("DFMUT_COMPACT\\n")', "DFMUT_COMPACT");
            await measure("right-arrow", '6 -> probe; cat("DFMUT_RIGHT\\n")', "DFMUT_RIGHT");
            await measure("right-superassignment", '7 ->> probe; cat("DFMUT_SUPER\\n")', "DFMUT_SUPER");
            await measure("hidden-setup", 'bump <- function() { probe <<- probe + 1 }; cat("DFMUT_SETUP\\n")', "DFMUT_SETUP");
            await measure("hidden-call", 'bump(); cat("DFMUT_HIDDEN\\n")', "DFMUT_HIDDEN");
            await measure("indirect-call", 'do.call("bump", list()); cat("DFMUT_INDIRECT\\n")', "DFMUT_INDIRECT");
            await measure("hidden-error-setup", 'bump_fail <- function() { probe <<- probe + 1; stop("DFMUT_HIDDEN_ERROR") }; cat("DFMUT_FAIL_SETUP\\n")', "DFMUT_FAIL_SETUP");
            await measure("hidden-error", "bump_fail()", "DFMUT_HIDDEN_ERROR");
            await measure("equals-error", 'probe = 11; stop("DFMUT_EQUALS_ERROR")', "DFMUT_EQUALS_ERROR");
            await measure("signalled-interrupt", 'probe = 12; stop(structure(list(message = "cancelled", call = NULL), class = c("interrupt", "condition")))', null);
            if (!browserTarget) {
                await measure("native-interrupt", "probe = 13; Sys.sleep(30); probe = 999", null, 1000);
            }
            else {
                report.toolbarInterrupt = "Not exercised: the current WebR adapter reports this control as unsupported.";
            }
            await measure("after-interrupt", 'cat(paste0("DFMUT_ACTUAL=", probe, "\\n"))', "DFMUT_ACTUAL=");
            await measure("dataset-copy", "ess_copy <- ess9en", null);
            await measure("dataset-remove", 'rm(ess_copy); cat("DFMUT_DATASET_REMOVED\\n")', "DFMUT_DATASET_REMOVED");
        }

        if (scenarioSet === "--finalize-cases") {
            await measure("reset-probe", 'probe <- 3; cat("DFFINAL_RESET\\n")', "DFFINAL_RESET");
        }

        if (scenarioSet === "--revision-cases" || scenarioSet === "--finalize-cases") {
            await measure("transient-check-failure", `probe <- probe + 1
local({
    rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code)
    original <- rt$collect_workspace_update
    rt$collect_workspace_update <- function(previous_state = NULL) {
        rt$collect_workspace_update <- original
        stop("synthetic one-time workspace failure")
    }
})
cat("DFREV_TRANSIENT\\n")`, "DFREV_TRANSIENT");
            await measure("persistent-check-failure", `probe <- probe + 1
local({
    rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code)
    original <- rt$collect_workspace_update
    attempts <- 0L
    rt$collect_workspace_update <- function(previous_state = NULL) {
        attempts <<- attempts + 1L
        if (attempts <= 2L) {
            stop("synthetic repeated workspace failure")
        }
        rt$collect_workspace_update <- original
        original(previous_state)
    }
})
cat("DFREV_PERSISTENT\\n")`, "DFREV_PERSISTENT");
            report.workspaceWarning = await page.locator("#consoleTerminal").innerText();
            await page.screenshot({ path: destination.replace(/\.json$/, "-failure.png") });
            await measure("recovery-copy", "probe_recovery <- probe", null);
            await measure("recovery-read", 'cat(paste0("DFREV_VALUE=", probe, "\\n"))', "DFREV_VALUE=");

            await measure("failure-before-delete", `probe <- probe + 1
local({
    rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code)
    original <- rt$collect_workspace_update
    attempts <- 0L
    rt$collect_workspace_update <- function(previous_state = NULL) {
        attempts <<- attempts + 1L
        if (attempts <= 2L) {
            stop("synthetic repeated workspace failure before deletion")
        }
        rt$collect_workspace_update <- original
        original(previous_state)
    }
})
cat("DFREV_BEFORE_DELETE\\n")`, "DFREV_BEFORE_DELETE");
            await readDiagnostics(true);
            await page.locator('[data-workspace-variable-row="probe_recovery"]').hover();
            const expectedMessage = 'Remove workspace object "probe_recovery"?';
            if (browserTarget) {
                const cancellation = page.waitForEvent("dialog").then(async (dialog) => {
                    if (dialog.type() !== "confirm" || dialog.message() !== expectedMessage) {
                        await dialog.dismiss();
                        throw new Error(`Unexpected confirmation: ${dialog.message()}`);
                    }
                    await dialog.dismiss();
                });
                await page.locator('[data-workspace-delete="probe_recovery"]').click();
                await cancellation;
                await page.locator('[data-workspace-variable="probe_recovery"]').waitFor({ state: "visible" });
                report.runs.push({
                    label: "delete-cancelled",
                    interaction: "browser-confirmation",
                    message: expectedMessage,
                    objectRetained: true,
                    diagnostics: await readDiagnostics(true)
                });
            }
            await page.evaluate(() => {
                const original = window.confirm;
                window.runtimeConfirmation = { pending: false, message: null, accepted: null };
                window.confirm = function(message) {
                    const record = window.runtimeConfirmation;
                    record.message = message;
                    record.pending = true;
                    try {
                        record.accepted = original.call(window, message);
                        return record.accepted;
                    }
                    finally {
                        record.pending = false;
                        window.confirm = original;
                    }
                };
            });
            // Browser dialogs use Playwright's dialog API. Native Electron sheets
            // must be read and accepted through native UI automation while this
            // runner waits. Never accept a native sheet through a CDP event.
            let browserConfirmation;
            const observeNativeDialog = function(dialog) {
                if (dialog.type() !== "confirm" || dialog.message() !== expectedMessage) {
                    console.error("Unexpected native dialog:", dialog.message());
                }
                // Installing a listener prevents Playwright's automatic
                // dismissal. The native OK/Cancel button owns the response.
            };
            if (browserTarget) {
                browserConfirmation = page.waitForEvent("dialog").then(async (dialog) => {
                    if (dialog.type() !== "confirm" || dialog.message() !== expectedMessage) {
                        await dialog.dismiss();
                        throw new Error(`Unexpected confirmation: ${dialog.message()}`);
                    }
                    await dialog.accept();
                });
            }
            else {
                page.on("dialog", observeNativeDialog);
            }
            console.log("Waiting for confirmation:", expectedMessage);
            await page.locator('[data-workspace-delete="probe_recovery"]').click({ timeout: 120000 });
            if (browserConfirmation) {
                await browserConfirmation;
            }
            await page.waitForFunction(() => window.runtimeConfirmation?.accepted === true
                && window.runtimeConfirmation.pending === false, undefined, { timeout: 120000 });
            const confirmation = await page.evaluate(() => window.runtimeConfirmation);
            page.off("dialog", observeNativeDialog);
            if (confirmation.message !== expectedMessage) {
                throw new Error(`Unexpected native confirmation: ${confirmation.message}`);
            }
            await page.locator('[data-workspace-variable="probe_recovery"]').waitFor({ state: "detached" });
            await page.waitForTimeout(300);
            report.runs.push({
                label: "delete-after-failure",
                interaction: browserTarget ? "browser-confirmation" : "native-confirmation",
                confirmation,
                workspace: await page.locator("[data-workspace-variable]").allTextContents(),
                diagnostics: await readDiagnostics()
            });
            await measure("keyboard-after-confirmation", 'cat("DFREV_CONFIRMATION_DISMISSED\\n")', "DFREV_CONFIRMATION_DISMISSED");
            await page.screenshot({ path: destination.replace(/\.json$/, "-confirmation-dismissed.png") });

            await measure("editor-fixture", 'revision_data <- data.frame(value = c(1, 2)); cat("DFREV_EDITOR\\n")', "DFREV_EDITOR");
            await page.evaluate(async ({ browserTarget }) => {
                if (browserTarget) {
                    const settings = JSON.parse(localStorage.getItem("dialogforge.settings") || "{}");
                    settings.uiActionCommandVisibility = "visible";
                    localStorage.setItem("dialogforge.settings", JSON.stringify(settings));
                }
                else {
                    await window.dialogForge.writeSettings({ uiActionCommandVisibility: "visible" });
                }
            }, { browserTarget });
            await page.locator('[data-workspace-variable="revision_data"]').dblclick();
            let editor;
            if (browserTarget) {
                await page.locator('iframe[src*="datasetEditor.html"]').waitFor();
                editor = await page.locator('iframe[src*="datasetEditor.html"]').elementHandle()
                    .then((element) => element.contentFrame());
            }
            else {
                editor = app.windows().find((candidate) => candidate.url().includes("datasetEditor.html"))
                    || await app.waitForEvent("window");
                await editor.waitForLoadState("domcontentloaded");
            }
            const cellSelector = 'td[data-data-cell="true"][data-data-row="1"][data-data-column="value"]';
            await editor.locator(cellSelector).waitFor();
            for (const [label, value] of [["visible-cell-change", "10"], ["visible-cell-unchanged", "10"]]) {
                await readDiagnostics(true);
                await editor.locator(cellSelector).dblclick();
                const input = editor.locator('input[data-data-editor="true"]');
                // Let the owning editor finish its scheduled focus/caret setup.
                await editor.evaluate(() => new Promise((resolve) => {
                    requestAnimationFrame(() => requestAnimationFrame(resolve));
                }));
                await input.fill(value);
                await editor.waitForFunction((value) => {
                    return document.querySelector('input[data-data-editor="true"]')?.value === value;
                }, value);
                await input.press("Enter");
                await input.waitFor({ state: "detached" });
                await editor.waitForFunction(({ cellSelector, value }) => {
                    return document.querySelector(cellSelector)?.textContent.trim() === value;
                }, { cellSelector, value });
                await page.waitForTimeout(300);
                report.runs.push({ label, cellText: await editor.locator(cellSelector).innerText(), diagnostics: await readDiagnostics() });
            }
            if (!browserTarget) {
                await editor.screenshot({ path: destination.replace(/\.json$/, "-editor.png") });
            }
            await page.screenshot({ path: destination.replace(/\.json$/, "-editor-shell.png") });
            if (scenarioSet === "--finalize-cases") {
                await readDiagnostics(true);
                const results = await (browserTarget ? editor : page).evaluate(async ({ browserTarget }) => {
                    const requests = [
                        { objectName: "revision_data", rowIndex: browserTarget ? 1 : 0, columnName: "value", value: 11, uiCommandVisibility: "visible" },
                        { objectName: "revision_data", rowIndex: browserTarget ? 2 : 1, columnName: "value", value: 22, uiCommandVisibility: "hidden" },
                        { objectName: "missing_dataset", rowIndex: 1, columnName: "value", value: 33, uiCommandVisibility: "hidden" }
                    ];
                    const api = window.dialogForge;
                    return api.writeCells(requests);
                }, { browserTarget });
                report.runs.push({ label: "partial-batch", results, diagnostics: await readDiagnostics() });
                if (browserTarget) {
                    await page.locator('.dialogforge-web-data-editor-layer button[aria-label="Close"]').click();
                }
                if (!browserTarget) {
                    await editor.close();
                    await readDiagnostics(true);
                    const refreshes = await page.evaluate(() => Promise.all([
                        window.dialogForge.refreshWorkspace(),
                        window.dialogForge.refreshWorkspace(),
                        window.dialogForge.refreshWorkspace()
                    ]));
                    report.runs.push({
                        label: "coalesced-refreshes",
                        receipts: refreshes.map((entry) => entry.workspaceRevision),
                        diagnostics: await readDiagnostics()
                    });
                    await readDiagnostics(true);
                    const ordered = await page.evaluate(async () => {
                        const first = window.dialogForge.refreshWorkspace();
                        const command = window.dialogForge.executeVisibleCommand({
                            text: "probe <- probe + 1", source: "runtime.measurement"
                        });
                        const last = window.dialogForge.refreshWorkspace();
                        return Promise.all([first, command, last]);
                    });
                    report.runs.push({ label: "refresh-across-command", results: ordered, diagnostics: await readDiagnostics() });
                    await readDiagnostics(true);
                    const failedCell = await page.evaluate(() => window.dialogForge.writeCell({
                        objectName: "revision_data", rowIndex: 0, columnName: "value", value: 13,
                        uiCommandVisibility: "visible",
                        visibleCommandText: `revision_data$value[1] <- 13
local({
    rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code)
    original <- rt$collect_workspace_update
    attempts <- 0L
    rt$collect_workspace_update <- function(previous_state = NULL) {
        attempts <<- attempts + 1L
        if (attempts <= 2L) stop("synthetic mutation refresh failure")
        rt$collect_workspace_update <- original
        original(previous_state)
    }
})`
                    }));
                    report.runs.push({ label: "visible-cell-failed-check", result: failedCell, diagnostics: await readDiagnostics() });
                    await measure("cell-failure-recovery", 'cat(paste0("DFFINAL_CELL_RECOVERED=", revision_data$value[1], "\\n"))', "DFFINAL_CELL_RECOVERED=");
                }
            }
        }

        if (scenarioSet === "--finalize-cases") {
            await measure("active-binding", 'binding_hits <- 0; makeActiveBinding("guarded", function(value) { binding_hits <<- binding_hits + 1; 99 }, .GlobalEnv); cat("DFFINAL_BINDING\\n")', "DFFINAL_BINDING");
            await measure("binding-read-count", 'cat(paste0("DFFINAL_BINDING_READS=", binding_hits, "\\n"))', "DFFINAL_BINDING_READS=");
            await measure("binding-copy", 'guarded_copy <- guarded; cat("DFFINAL_BINDING_COPY\\n")', "DFFINAL_BINDING_COPY");
            await measure("binding-copy-count", 'cat(paste0("DFFINAL_BINDING_COPY_READS=", binding_hits, "\\n"))', "DFFINAL_BINDING_COPY_READS=");
            await measure("null-value", 'null_probe <- NULL; cat("DFFINAL_NULL\\n")', "DFFINAL_NULL");
            await measure("retype-dataset", 'revision_data <- 7; cat("DFFINAL_RETYPE\\n")', "DFFINAL_RETYPE");
            await measure("reference-setup", 'reference_probe <- new.env(); reference_probe$value <- 1; cat("DFFINAL_REF_SETUP\\n")', "DFFINAL_REF_SETUP");
            await measure("reference-change", 'reference_probe$value <- 2; cat("DFFINAL_REF_CHANGE\\n")', "DFFINAL_REF_CHANGE");
            await measure("reference-copy", 'reference_copy <- reference_probe; cat("DFFINAL_REF_COPY\\n")', "DFFINAL_REF_COPY");
            await measure("altrep-setup", 'altrep_probe <- 1:100000; cat("DFFINAL_ALTREP_SETUP\\n")', "DFFINAL_ALTREP_SETUP");
            await measure("altrep-change", 'altrep_probe[100000] <- 0L; cat("DFFINAL_ALTREP_CHANGE\\n")', "DFFINAL_ALTREP_CHANGE");
            await measure("output-channels", 'local({ old <- options(warn=1); on.exit(options(old)); cat("DFFINAL_STDOUT\\n"); message("DFFINAL_MESSAGE"); warning("DFFINAL_WARNING"); cat("DFFINAL_STDERR\\n", file=stderr()); cat("DFFINAL_CHANNELS_END\\n") })', "DFFINAL_CHANNELS_END");
            await measure("output-whitespace", 'cat("DFFINAL_UNICODE café λ 漢字\\n\\nno newline"); cat("\\rprogress\\nDFFINAL_WHITESPACE_END\\n")', "DFFINAL_WHITESPACE_END");
            await measure("output-before-error", 'cat(paste(rep("DFFINAL_LARGE", 1000), collapse="\\n")); stop("DFFINAL_LARGE_ERROR")', "DFFINAL_LARGE_ERROR");
            await measure("prompt-reply", 'prompt_probe <- readline("DFFINAL_REPLY: "); cat(paste0("DFFINAL_REPLY=", prompt_probe, "\\n"))', "DFFINAL_REPLY=", 0, "synthetic answer");
            await measure("heap-high-water", 'local({ memory <- gc(); cat(paste0("DFFINAL_R_HEAP_MAX_MB=", paste(memory[, ncol(memory)], collapse=","), "\\n")) })', "DFFINAL_R_HEAP_MAX_MB=");
            if (browserTarget) {
                await measure("wasm-memory", 'cat(paste0("DFFINAL_WASM_BYTES=", tryCatch(webr::eval_js("Module.HEAPU8.buffer.byteLength"), error=function(e) paste("unavailable:", conditionMessage(e))), "\\n"))', "DFFINAL_WASM_BYTES=");
            }
            else {
                await page.screenshot({ path: destination.replace(/\.json$/, "-completed.png") });
                await readDiagnostics(true);
                await page.evaluate(() => {
                    window.runtimeOldRequest = window.dialogForge.executeVisibleCommand({
                        text: "old_session_probe <- 123; Sys.sleep(5)", source: "runtime.measurement"
                    });
                });
                await page.waitForTimeout(300);
                const restart = await page.evaluate(async () => {
                    const restarted = await window.dialogForge.restartRuntime("clean");
                    const oldResult = await window.runtimeOldRequest;
                    const workspace = await window.dialogForge.refreshWorkspace();
                    return { restarted, oldResult, workspace };
                });
                report.runs.push({ label: "restart-with-pending-command", ...restart, diagnostics: await readDiagnostics() });
                report.afterRestart = {
                    oldObjectPresent: await query('exists("old_session_probe", envir=.GlobalEnv, inherits=FALSE)'),
                    inputVisible: await page.locator("#visibleCommandInput").isVisible(),
                    note: "Provider recovery and console input availability are recorded separately."
                };
            }
        }

        if (scenarioSet === "--object-cases") {
            await measure("s3-object", 'custom_probe <- structure(list(value = 1), class = "DFProbe"); cat("DFOBJECT_S3\\n")', "DFOBJECT_S3");
            await measure("s3-change", 'custom_probe$value <- 2; cat("DFOBJECT_S3_CHANGED\\n")', "DFOBJECT_S3_CHANGED");
            await measure("s4-object", 'methods::setClass("DFSlotProbe", slots = c(value = "numeric")); slot_probe <- methods::new("DFSlotProbe", value = 1); cat("DFOBJECT_S4\\n")', "DFOBJECT_S4");
            await measure("s4-change", 'slot_probe@value <- 2; cat("DFOBJECT_S4_CHANGED\\n")', "DFOBJECT_S4_CHANGED");
            await measure("s4-copy", 'slot_copy <- slot_probe; cat("DFOBJECT_S4_COPY\\n")', "DFOBJECT_S4_COPY");
            await measure("opaque-pointer", 'pointer_probe <- methods::new("externalptr"); cat("DFOBJECT_POINTER\\n")', "DFOBJECT_POINTER");
            await measure("opaque-copy", 'pointer_copy <- pointer_probe; cat("DFOBJECT_POINTER_COPY\\n")', "DFOBJECT_POINTER_COPY");
            await measure("nested-reference", 'nested_env <- new.env(parent = emptyenv()); nested_env$value <- 1; nested_probe <- list(inner = nested_env); cat("DFOBJECT_NESTED\\n")', "DFOBJECT_NESTED");
            await measure("nested-change", 'nested_env$value <- 2; cat("DFOBJECT_NESTED_CHANGED\\n")', "DFOBJECT_NESTED_CHANGED");
            await measure("custom-method-setup", 'inspection_hits <- 0L; str.DFProbe <- function(object, ...) { inspection_hits <<- inspection_hits + 1L; invisible(NULL) }; cat("DFOBJECT_METHOD_SETUP\\n")', "DFOBJECT_METHOD_SETUP");
            await measure("custom-method-change", 'custom_probe$value <- 3; cat("DFOBJECT_METHOD_CHANGED\\n")', "DFOBJECT_METHOD_CHANGED");
            await measure("custom-method-count", 'cat(paste0("DFOBJECT_INSPECTION_HITS=", inspection_hits, "\\n"))', "DFOBJECT_INSPECTION_HITS=");
            await measure("object-values", 'cat(paste0("DFOBJECT_VALUES=", custom_probe$value, ",", slot_probe@value, ",", slot_copy@value, ",", nested_probe$inner$value, "\\n"))', "DFOBJECT_VALUES=");
        }

        await page.screenshot({ path: destination.replace(/\.json$/, ".png") });

        const disableDiagnostics = () => {
            globalThis.dialogForgeRuntimeDiagnostics.clear();
            globalThis.dialogForgeRuntimeDiagnostics.enabled = false;
        };
        if (browserTarget) {
            await page.evaluate(disableDiagnostics);
        }
        else {
            await app.evaluate(disableDiagnostics);
        }
        report.disabledQuery = await query("invisible(1 + 1)");
        report.disabledQuery = { status: report.disabledQuery.status };
        report.disabledTraceEntries = (await readDiagnostics()).entries.length;
    }
    catch (error) {
        report.error = String(error.stack || error);
        if (page) {
            report.renderedFailure = await page.locator("body").innerText().catch(() => "");
        }
        throw error;
    }
    finally {
        clearInterval(memoryTimer);
        report.memory = memory;
        for (const run of report.runs) {
            if (!run.interaction) {
                run.interaction = run.label.startsWith("visible-cell-")
                    && run.label !== "visible-cell-failed-check"
                    ? "data-editor-ui"
                    : "runtime-bridge-diagnostic";
            }
            if (run.label.startsWith("visible-cell-")) {
                run.mutationRoute = browserTarget ? "hidden-mutation" : "visible-command";
            }
        }
        fs.writeFileSync(destination, JSON.stringify(report, null, 4));
        await app.close();
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
