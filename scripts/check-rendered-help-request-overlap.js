"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium, _electron } = require("playwright");
const { findMainWindowPage } = require("../tests/electron/product-launch");
const { createHelpAcceptanceGate } = require("./help-request-acceptance-gate");
const { createHelpCommandUrl } = require("../dist/src/runtime/help/helpCommandUrl");

const [target, destination] = process.argv.slice(2);
if (!target || !destination) {
    throw Error("Usage: node scripts/check-rendered-help-request-overlap.js <native|http-url> <private-result.json>");
}
const web = /^https?:/.test(target);
const root = path.resolve(__dirname, "..");

const main = async function() {
    const report = { host: web ? "webr" : "native", cases: [], target };
    const app = web ? await chromium.launch({ headless: false }) : await _electron.launch({
        executablePath: require("electron"),
        args: [path.join(root, "scripts/native-help-overlap-entry.js"), "--product", "base"],
        env: {
            ...process.env,
            DIALOGFORGE_TEST_USER_DATA_PATH: fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-help-overlap-"))
        }
    });
    report.nativeCloseMechanism = web ? undefined : "actual-task-owned-Electron-page-close-not-macOS-shortcut";
    let page;
    let debuggerSession;
    let help;
    const assertLive = function() {
        if (!web) {
            assert.equal(app.process().exitCode, null, "The task-owned Electron process must still be live.");
        }
    };
    try {
        assertLive();
        page = web ? await app.newPage({ viewport: { width: 1600, height: 1100 } })
            : await findMainWindowPage(app);
        if (web) {
            await page.goto(target);
        }
        await page.locator('#consoleTerminal [data-session-phase="ready"][data-runtime-busy="false"]')
            .waitFor({ timeout: 120000 });
        console.log(report.host + ": actual runtime ready");
        if (web) {
            await page.evaluate(source => {
                window.helpAcceptanceGate = (0, eval)("(" + source + ")")();
            }, createHelpAcceptanceGate.toString());
            debuggerSession = await page.context().newCDPSession(page);
            const scripts = [];
            debuggerSession.on("Debugger.scriptParsed", event => { scripts.push(event); });
            await debuggerSession.send("Debugger.enable");
            const bundle = scripts.find(script => /\/browser-esm\/shell-[^/]+\.js$/.test(script.url));
            assert.ok(bundle, "The actual browser shell bundle must be identified.");
            report.shellBundle = bundle.url;
            const { scriptSource } = await debuggerSession.send("Debugger.getScriptSource", { scriptId: bundle.scriptId });
            const lines = scriptSource.split("\n");
            const start = lines.findIndex(line => line.includes("var fetchBrowserRHelpPage ="));
            const offset = lines.slice(start).findIndex(line => line.includes("const result = await context.reader.fetchPage(value)"));
            assert.ok(start >= 0 && offset >= 0, "The actual callback reader boundary must be found.");
            debuggerSession.on("Debugger.paused", async event => {
                try {
                    const result = await debuggerSession.send("Debugger.evaluateOnCallFrame", {
                        callFrameId: event.callFrames[0].callFrameId,
                        expression: `(() => {
                            const gate = window.helpAcceptanceGate;
                            const reader = context.reader;
                            const read = reader.fetchPage;
                            gate.armed = false;
                            reader.fetchPage = async function(value) {
                                reader.fetchPage = read;
                                const result = await read.call(reader, value);
                                return gate.hold(result, { actualRHelpBytes: result.text?.length, path: value, ok: result.ok });
                            };
                        })()`
                    });
                    if (result.exceptionDetails) {
                        report.injectionError = result.exceptionDetails;
                    }
                } catch (error) {
                    report.injectionError = String(error);
                } finally {
                    await debuggerSession.send("Debugger.resume");
                }
            });
            await debuggerSession.send("Debugger.setBreakpointByUrl", {
                url: bundle.url, lineNumber: start + offset,
                condition: "window.helpAcceptanceGate?.armed === true"
            });
        }
        const gateRead = async function() {
            assertLive();
            return web
                ? page.evaluate(() => ({ held: window.helpAcceptanceGate.held, finished: window.helpAcceptanceGate.finished,
                    evidence: window.helpAcceptanceGate.evidence }))
                : app.evaluate(() => ({ held: globalThis.helpAcceptanceGate.held, finished: globalThis.helpAcceptanceGate.finished,
                    evidence: globalThis.helpAcceptanceGate.evidence }));
        };
        const waitForGate = async function(property) {
            const deadline = Date.now() + 15000;
            while (Date.now() < deadline) {
                const state = await gateRead();
                if (state[property]) {
                    return state;
                }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            throw Error("Actual help read did not reach gate: " + property);
        };
        const release = async function() {
            assertLive();
            if (web) {
                await page.evaluate(() => window.helpAcceptanceGate.release());
            } else {
                await app.evaluate(() => globalThis.helpAcceptanceGate.release());
            }
            await waitForGate("finished");
            await page.waitForTimeout(600);
        };
        const draft = async function(text) {
            assertLive();
            await page.locator('#consoleTerminal [data-session-phase="ready"][data-runtime-busy="false"] .view-lines')
                .click({ position: { x: 10, y: 10 } });
            await page.keyboard.press("ControlOrMeta+A");
            await page.keyboard.insertText(text);
        };
        const holdCallback = async function() {
            if (web) {
                await page.evaluate(() => window.helpAcceptanceGate.arm());
            } else {
                await app.evaluate(() => globalThis.helpAcceptanceGate.arm());
            }
            await draft('local({help("median", package="stats", help_type="html")})');
            await page.keyboard.press("Enter");
            const state = await waitForGate("held");
            console.log(report.host + ": actual callback held " + JSON.stringify(state.evidence));
            assert.ok(web ? state.evidence.ok && state.evidence.actualRHelpBytes > 0
                : state.evidence.actualHelpServerPort > 0);
            assert.equal(report.injectionError, undefined);
            await page.locator('#consoleTerminal [data-session-phase="ready"][data-runtime-busy="false"]')
                .waitFor({ timeout: 30000 });
            return state.evidence;
        };
        const holdViewerCallback = async function(document) {
            if (web) {
                await page.evaluate(() => window.helpAcceptanceGate.arm());
            } else {
                await app.evaluate(() => globalThis.helpAcceptanceGate.arm());
            }
            const href = createHelpCommandUrl("run",
                'local({help("median", package="stats", help_type="html")})');
            // Controlled producer only: a link using the canonical command URL
            // and real viewer click handler. Never send input behind a modal.
            await document.locator("body").evaluate((body, href) => {
                const link = body.ownerDocument.createElement("a");
                link.id = "helpAcceptanceCallback";
                link.href = href;
                link.textContent = "Acceptance callback";
                body.appendChild(link);
            }, href);
            await document.locator("#helpAcceptanceCallback").click();
            const state = await waitForGate("held");
            assert.ok(web ? state.evidence.ok && state.evidence.actualRHelpBytes > 0
                : state.evidence.actualHelpServerPort > 0);
            assert.equal(report.injectionError, undefined);
            return { ...state.evidence, producer: "controlled-canonical-command-link" };
        };
        const findHelp = async function() {
            assertLive();
            if (web) {
                await page.locator(".dialogforge-web-help-frame").waitFor();
                help = page.frameLocator(".dialogforge-web-help-frame");
            } else {
                help = app.windows().find(window => window.url().includes("/help.html"))
                    || await app.waitForEvent("window");
            }
            return help.frameLocator("#helpFrame");
        };
        const openF1 = async function() {
            await draft("base::mean");
            await page.keyboard.press("F1");
            const document = await findHelp();
            await document.locator("body", { hasText: "Search results for mean" }).waitFor();
            return document;
        };
        const openMean = async function() {
            // Trailing whitespace is a normal editor action that ends the
            // identifier completion context without changing the help query.
            await draft("?base::mean ");
            await page.keyboard.press("Enter");
            const document = await findHelp();
            await document.locator("body", { hasText: "Arithmetic Mean" }).waitFor();
            return document;
        };
        const closeHelp = async function() {
            assertLive();
            if (web) {
                await page.locator(".dialogforge-web-help-layer .dialogforge-web-dialog__close").click();
            } else {
                // Close the actual task-owned Electron window. This exercises
                // its retirement callback, not a macOS shortcut acceptance.
                await help.close();
            }
            // Never inspect the closed Help handle.
            help = null;
        };

        let evidence = await holdCallback();
        let document = await openF1();
        await release();
        assert.match(await document.locator("body").innerText(), /Search results for mean/);
        assert.doesNotMatch(await document.locator("body").innerText(), /Median Value/);
        report.cases.push({ name: "delayed-R-callback-after-newer-F1", passed: true, evidence });
        console.log(report.host + ": newer F1 retained");
        await closeHelp();
        document = null;

        // With Help already open, its actual command-link action begins the
        // callback. Only Back/Close then retire it; no newer manual opening
        // can accidentally satisfy these assertions.
        document = await openMean();
        await document.getByRole("link", { name: "weighted.mean", exact: true }).first().click();
        await document.locator("body", { hasText: "Weighted Arithmetic Mean" }).waitFor();
        evidence = await holdViewerCallback(document);
        await help.locator("#helpBack").click();
        await document.locator("body", { hasText: "Arithmetic Mean" }).waitFor();
        await release();
        assert.match(await document.locator("body").innerText(), /Arithmetic Mean/);
        assert.doesNotMatch(await document.locator("body").innerText(), /Median Value|Weighted Arithmetic Mean/);
        report.cases.push({ name: "delayed-R-callback-after-Back", passed: true, evidence });
        console.log(report.host + ": Back retained");

        evidence = await holdViewerCallback(document);
        await closeHelp();
        // The Help handle is retired immediately; no method is called on it after Close.
        document = null;
        await release();
        assertLive();
        if (web) {
            assert.equal(await page.locator(".dialogforge-web-help-frame").count(), 0);
        } else {
            assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
                .filter(window => window.webContents.getURL().includes("/help.html")).length), 0);
        }
        report.cases.push({ name: "delayed-R-callback-after-Close", passed: true, evidence });
        document = await openF1();
        assert.match(await document.locator("body").innerText(), /Search results for mean/);
        report.cases.push({ name: "fresh-F1-recovery-after-retirement", passed: true });
        await closeHelp();
        document = null;
        report.passed = true;
    } catch (error) {
        report.error = String(error.stack || error);
        if (help) {
            report.helpText = await help.frameLocator("#helpFrame").locator("body").innerText({ timeout: 1000 })
                .catch(error => String(error));
        }
        if (page) {
            report.consoleText = await page.locator("#consoleTerminal").innerText({ timeout: 1000 })
                .catch(error => String(error));
        }
        process.exitCode = 1;
    } finally {
        if (debuggerSession) {
            await debuggerSession.send("Debugger.disable").catch(() => {});
            await debuggerSession.detach().catch(() => {});
        }
        fs.writeFileSync(destination, JSON.stringify(report, null, 2));
        page = null;
        help = null;
        await app.close();
        console.log(JSON.stringify(report));
    }
};

main().catch(error => { console.error(error); process.exitCode = 1; });
