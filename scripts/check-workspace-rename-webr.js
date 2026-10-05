"use strict";

// Real WebR in Chromium, using the production browser session and R transport.
// This exercises the session-manager API; it does not claim rendered UI coverage.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("playwright");
const { createBrowserNodeFallbackPlugin } = require("./browser-node-fallbacks");
const {
    readRegressionPackageLibrary,
    regressionPackageLibrarySource,
    serveRegressionPackageLibrary
} = require("./webr-regression-package-library");

const rootDir = path.resolve(__dirname, "..");
const webRDir = path.join(rootDir, "node_modules/webr/dist");
const sourceDir = path.join(rootDir, "src/runtime/providers/r/r-sources");

const main = async function() {
    const packageLibrary = readRegressionPackageLibrary(rootDir, true);
    const bundle = await build({
        stdin: {
            resolveDir: rootDir,
            contents: `
                ${regressionPackageLibrarySource(packageLibrary)}
                import { installWebRSharedRuntimeControl } from
                    "./src/runtime/providers/webr/webRSharedRuntimeControl";
                import { createBrowserWebRSession } from
                    "./src/runtime/providers/webr/webRBrowserSession";
                import { createBrowserWebRRuntime } from
                    "./src/runtime/providers/webr/webRBrowserRuntime";

                window.startRenameAcceptance = async function() {
                    const runtime = await createBrowserWebRRuntime({
                        baseUrl: new URL("/webr/", location.href).href,
                        importWebRModule: () => import("/webr/webr.js")
                    });
                    window.renameRuntime = runtime;
                    await runtime.init();
                    window.renamePackageLibraryTimings = await window.mountRegressionPackageLibrary(runtime);
                    let pending = Promise.resolve();
                    const runRuntimeOperation = function(action) {
                        const next = pending.then(action);
                        pending = next.catch(() => {});
                        return next;
                    };
                    const runtimeControlClient = await installWebRSharedRuntimeControl({
                        runtime,
                        runRuntimeOperation,
                        fetchSource: async function(name) {
                            const response = await fetch("/r/" + name);
                            if (!response.ok) {
                                throw new Error("Missing R source: " + name);
                            }
                            return response.text();
                        }
                    });
                    window.renameTranscript = [];
                    window.renameWorkspaceChanges = [];
                    window.renameSession = createBrowserWebRSession({
                        runtimeControlClient,
                        visibleCommands: {
                            readConsoleOutputWidth: () => 80,
                            recordTranscriptEvents: (events) => {
                                window.renameTranscript.push(...events);
                            }
                        },
                        workspaceChanged: async function(update, snapshot) {
                            window.renameWorkspaceChanges.push({ update, snapshot });
                        },
                        runtimeMethods: {
                            checkCodeFragmentComplete: async () => "complete",
                            setRuntimeStatus() {},
                            setRuntimeBusy() {},
                            renderToolbar() {},
                            getRuntime: () => runtime
                        }
                    });
                    return window.renameSession.runtimeSessionManager.start();
                };
            `
        },
        bundle: true,
        platform: "browser",
        format: "esm",
        external: ["/webr/webr.js"],
        plugins: [createBrowserNodeFallbackPlugin()],
        write: false
    });
    const server = http.createServer(async function(request, response) {
        response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        try {
            const pathname = new URL(request.url, "http://localhost").pathname;
            if (serveRegressionPackageLibrary(pathname, response, packageLibrary)) {
                return;
            }
            if (pathname === "/") {
                response.setHeader("Content-Type", "text/html");
                response.end('<!doctype html><script type="module" src="/acceptance.js"></script>');
                return;
            }
            if (pathname === "/acceptance.js") {
                response.setHeader("Content-Type", "text/javascript");
                response.end(bundle.outputFiles[0].contents);
                return;
            }
            if (
                /^\/r-runtime\/webr\/\d+\.\d+\.\d+\/dialogforgeruntime_0\.1\.0\.tgz$/.test(pathname)
            ) {
                response.setHeader("Content-Type", "application/octet-stream");
                response.end(await fs.readFile(path.join(rootDir, "dist", pathname.slice(1))));
                return;
            }
            const directory = pathname.startsWith("/webr/") ? webRDir
                : pathname.startsWith("/r/") ? sourceDir : null;
            const relative = decodeURIComponent(pathname.replace(/^\/(webr|r)\//, ""));
            const filename = directory && path.resolve(directory, relative);
            if (!filename || !filename.startsWith(directory + path.sep)) {
                response.writeHead(404).end();
                return;
            }
            response.setHeader("Content-Type", filename.endsWith(".wasm")
                ? "application/wasm" : /\.(mjs|js)$/.test(filename)
                    ? "text/javascript" : "application/octet-stream");
            response.end(await fs.readFile(filename));
        }
        catch {
            response.writeHead(404).end();
        }
    });
    let browser;
    let deadline;
    const deadlineMs = Number(process.env.DIALOGFORGE_TEST_RENAME_DEADLINE_MS || 120000);
    assert.ok(Number.isFinite(deadlineMs) && deadlineMs > 0 && deadlineMs <= 600000);
    try {
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
        browser = await chromium.launch({ headless: true });
        deadline = setTimeout(() => {
            console.error("WebR Rename acceptance exceeded its " + deadlineMs + "ms limit.");
            void browser.close();
        }, deadlineMs);
        const page = await browser.newPage();
        page.on("pageerror", (error) => console.error(error));
        page.on("console", (message) => {
            if (message.type() === "error") {
                console.error(message.text());
            }
            else if (message.text().startsWith("WebR SAME-source case ")) {
                console.log(message.text());
            }
        });
        page.setDefaultTimeout(120000);
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => typeof window.startRenameAcceptance === "function");
        const started = await page.evaluate(() => window.startRenameAcceptance());
        assert.equal(started.status, "ready", started.message);
        console.log("Canonical WebR package-library mount timings:",
            JSON.stringify(await page.evaluate(() => window.renamePackageLibraryTimings)));

        const execute = async function(text) {
            const result = await page.evaluate((command) => {
                return window.renameSession.executeVisibleCommand(command);
            }, text);
            assert.equal(result.ok, true, `WebR command failed: ${text}`);
        };
        const rename = (oldName, newName) => page.evaluate((request) => {
            return window.renameSession.runtimeSessionManager.renameWorkspaceObject(request);
        }, { oldName, newName, source: "rename-webr-acceptance" });
        const snapshot = () => page.evaluate(() => {
            return window.renameSession.runtimeSessionManager.getWorkspaceSnapshot();
        });
        const names = (workspace) => workspace.objects.map((object) => object.name).sort();

        await execute("rename_source <- data.frame(value = c(11, 22)); occupied <- 99");
        const before = await snapshot();
        await page.evaluate(() => {
            return window.renameSession.runtimeSessionManager.setActiveDataset("rename_source");
        });
        const renamed = await rename("rename_source", "rename_target");
        assert.equal(renamed.status, "ready");
        assert.deepEqual(names(renamed), ["occupied", "rename_target"]);
        assert.deepEqual(names(await snapshot()), names(renamed));
        assert.equal(renamed.workspaceRevision.session, before.workspaceRevision.session);
        assert.ok(renamed.workspaceRevision.sequence > before.workspaceRevision.sequence);
        const active = await page.evaluate(() => {
            return window.renameSession.runtimeSessionManager.getActiveDataset();
        });
        assert.equal(active.objectName, "rename_target");
        await execute("stopifnot(!exists('rename_source'), identical(rename_target$value, c(11, 22)))");
        assert.deepEqual(names(await snapshot()), names(renamed));

        const conflict = await rename("rename_target", "occupied");
        assert.equal(conflict.status, "conflict");
        assert.deepEqual(names(conflict), names(renamed));
        await execute("stopifnot(identical(occupied, 99), identical(rename_target$value, c(11, 22)))");
        assert.equal((await rename("missing_source", "unused_target")).status, "not-found");
        const unchanged = await rename("rename_target", "rename_target");
        assert.equal(unchanged.status, "ready");
        assert.deepEqual(names(unchanged), names(renamed));

        await execute([
            "rename_attempts <- 0L",
            "local({",
            "rt <- environment(as.environment('DialogApp')$runtime_workspace_change_for_code)",
            "original <- rt$runtime_workspace_rename",
            "rt$runtime_workspace_rename <- function(params) {",
            "rt$runtime_workspace_rename <- original",
            "rename_attempts <<- rename_attempts + 1L",
            "original(params)",
            "stop('synthetic post-rename response failure')",
            "}",
            "})"
        ].join("\n"));
        const baseline = await snapshot();
        const uncertain = await rename("rename_target", "rename_recovered");
        assert.equal(uncertain.status, "uncertain");
        assert.deepEqual(names(uncertain), names(baseline));
        assert.deepEqual(names(await snapshot()), names(baseline));
        await execute([
            "stopifnot(rename_attempts == 1L,",
            "!exists('rename_target'),",
            "identical(rename_recovered$value, c(11, 22)))"
        ].join("\n"));
        const recovered = await snapshot();
        assert.equal(recovered.status, "ready");
        assert.deepEqual(names(recovered), ["occupied", "rename_attempts", "rename_recovered"]);
        assert.equal(recovered.workspaceRevision.session, baseline.workspaceRevision.session);
        assert.ok(recovered.workspaceRevision.sequence > baseline.workspaceRevision.sequence);
        const delivered = await page.evaluate(() => window.renameWorkspaceChanges.at(-1));
        assert.deepEqual(names(delivered.snapshot), names(recovered));
        const edits = await page.evaluate(() => {
            return window.renameSession.runtimeSessionManager.writeCells([
                { objectName: "rename_recovered", rowIndex: 0, columnName: "value", value: 33 },
                { objectName: "rename_recovered", rowIndex: 1, columnName: "value", value: 44 }
            ]);
        });
        assert.equal(edits.updated, 2);
        assert.equal(edits.failed, 0);
        assert.ok((await snapshot()).workspaceRevision.sequence > recovered.workspaceRevision.sequence);
        await execute("stopifnot(identical(rename_recovered$value, c(33, 44)))");
        console.log("Real WebR cell batch: both edits committed, R values verified and workspace revision advanced.");
        const inspectionSources = await Promise.all([
            "runtimePrelude.R", "runtimeBindingInspection.R", "runtimeWorkspaceCore.R",
            "runtimeDatasetCore.R", "runtimeDatasetStateCore.R", "runtimeOutputJournalPrototype.R"
        ].map(async (name) => ({ name, text: await fs.readFile(path.join(sourceDir, name), "utf8") })));
        const inspectionTests = await Promise.all([
            "scripts/check-r-runtime-helper.R",
            "src/runtime/providers/r/native/dialogforgeruntime/tests/binding-info.R",
            "src/runtime/providers/r/native/dialogforgeruntime/tests/stored-graph.R",
            "scripts/check-workspace-standard-method-safety.R",
            "scripts/check-workspace-inspection-safety.R",
            "scripts/check-workspace-copy-safety.R",
            "scripts/check-workspace-altrep-safety.R",
            "scripts/check-output-journal-prototype.R",
            "scripts/check-dataset-mixed-change.R"
        ].map(async (name) => ({ name, text: await fs.readFile(path.join(rootDir, name), "utf8") })));
        const probe = await fs.readFile(path.join(rootDir, "dist/r-runtime/probe/webr/altrepprobe.so"));
        const declaredInstalled = await page.evaluate(async ({ sources, tests, probe }) => {
            const runtime = window.renameRuntime;
            await runtime.FS.writeFile("/tmp/altrepprobe.so", new Uint8Array(probe));
            await runtime.evalRVoid('Sys.setenv(DIALOGFORGE_ALTREP_PROBE_DLL = "/tmp/altrepprobe.so")');
            await runtime.evalRVoid([
                'dir.create("src/runtime/providers/r/r-sources", recursive = TRUE)',
                '.libPaths(c(as.environment("DialogApp")$runtime_inspection_library, .libPaths()))',
                'Sys.setenv(DIALOGFORGE_TEST_INSPECTION_LIBRARY = as.environment("DialogApp")$runtime_inspection_library)',
                'Sys.setenv(DIALOGFORGE_TEST_SOURCE_ROOT = getwd())'
            ].join("\n"));
            const directory = await runtime.evalRString('normalizePath("src/runtime/providers/r/r-sources")');
            for (const source of sources) {
                await runtime.FS.writeFile(`${directory}/${source.name}`, new TextEncoder().encode(source.text));
            }
            window.renameInspectionTimings = [];
            for (const test of tests) {
                const started = performance.now();
                console.log("WebR SAME-source case started: " + test.name);
                await runtime.evalRVoid(test.text);
                console.log("WebR SAME-source case completed: " + test.name
                    + " in " + Math.round(performance.now() - started) + "ms");
                window.renameInspectionTimings.push({
                    name: test.name, milliseconds: performance.now() - started
                });
            }
            return runtime.evalRBoolean(
                'is.element("declared", rownames(installed.packages()))'
            );
        }, { sources: inspectionSources, tests: inspectionTests, probe: Array.from(probe) });
        console.log("WebR: the same " + inspectionTests.length
            + " native helper/inspection/journal/receipt regression sources passed, including real ALTREP callbacks.");
        console.log("WebR SAME-source regression timings:",
            JSON.stringify(await page.evaluate(() => window.renameInspectionTimings)));
        console.log(declaredInstalled
            ? "WebR declared package is installed; conditional inspection cases were available."
            : "WebR declared package is absent; conditional declared inspection cases were skipped, not accepted.");
        assert.equal(declaredInstalled, true, "Paired declared inspection must not silently skip package cases.");
        await page.evaluate(async () => {
            await window.renameSession.runtimeSessionManager.stop();
            await window.renameRuntime.close();
        });
        console.log("Real browser WebR Rename: shared snapshots, active dataset, receipts, rejection cases, uncertain outcome and single-attempt recovery passed.");
        await page.route("**/r-runtime/webr/**", (route) => route.fulfill({ status: 404, body: "missing helper" }));
        try {
            await assert.rejects(
                page.evaluate(() => window.startRenameAcceptance()),
                /Build and serve the WebR runtime helper package/
            );
        }
        finally {
            await page.evaluate(() => window.renameRuntime?.close());
        }
        console.log("WebR missing-helper startup failed explicitly, without an evaluating fallback.");
    }
    finally {
        clearTimeout(deadline);
        await browser?.close();
        await new Promise((resolve) => server.close(resolve));
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
