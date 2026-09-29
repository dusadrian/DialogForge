"use strict";

// Real WebR in Chromium, using the production browser session and R transport.
// This exercises the session-manager API; it does not claim rendered UI coverage.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const webRDir = path.join(rootDir, "node_modules/webr/dist");
const sourceDir = path.join(rootDir, "src/runtime/providers/r/r-sources");

const main = async function() {
    const bundle = await build({
        stdin: {
            resolveDir: rootDir,
            contents: `
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
                        runRuntimeOperation,
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
        // Match build-shell-web-modules.js: these Node-only dialog/import
        // fallbacks throw if reached. No runtime provider is replaced.
        plugins: [{
            name: "unavailable-node-fallbacks",
            setup(builder) {
                builder.onResolve({ filter: /^(fs|path)$/ }, (args) => ({
                    path: args.path,
                    namespace: "node-fallback"
                }));
                builder.onLoad({ filter: /.*/, namespace: "node-fallback" }, (args) => {
                    const members = args.path === "fs"
                        ? ["existsSync", "readFileSync"]
                        : ["dirname", "isAbsolute", "join", "relative", "resolve"];
                    return {
                        contents: [
                            'const unavailable = () => { throw new Error("Node fallback reached in WebR acceptance"); };',
                            ...members.map((name) => `export const ${name} = unavailable;`),
                            'export const sep = "/";'
                        ].join("\n")
                    };
                });
            }
        }],
        write: false
    });
    const server = http.createServer(async function(request, response) {
        response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        try {
            const pathname = new URL(request.url, "http://localhost").pathname;
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
    try {
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
        browser = await chromium.launch({ headless: true });
        deadline = setTimeout(() => {
            console.error("WebR Rename acceptance exceeded its two-minute limit.");
            void browser.close();
        }, 120000);
        const page = await browser.newPage();
        page.on("pageerror", (error) => console.error(error));
        page.on("console", (message) => {
            if (message.type() === "error") {
                console.error(message.text());
            }
        });
        page.setDefaultTimeout(120000);
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => typeof window.startRenameAcceptance === "function");
        const started = await page.evaluate(() => window.startRenameAcceptance());
        assert.equal(started.status, "ready", started.message);

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
        await page.evaluate(async () => {
            await window.renameSession.runtimeSessionManager.stop();
            await window.renameRuntime.close();
        });
        console.log("Real browser WebR Rename: shared snapshots, active dataset, receipts, rejection cases, uncertain outcome and single-attempt recovery passed.");
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
