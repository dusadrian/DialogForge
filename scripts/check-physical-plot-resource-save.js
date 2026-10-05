"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { build } = require("esbuild");
const { chromium } = require("playwright");
const { checkPhysicalPlotResourceSave } = require("./plot-resource-save-acceptance");
const { createNodeResourceClient } = require("../dist/src/core/host/nodeResourceClient");
const { createPlotDownloadController } = require("../dist/src/shell-electron/external/plotDownloadController");
const { createPlotExternalIpcController } = require("../dist/src/shell-electron/external/plotExternalIpcController");
const { plotExternalIpcChannels } = require("../dist/src/base-app/features/plot-viewer/plotExternalIpc");

const main = async function() {
    const root = path.resolve(__dirname, "..");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-plot-save-"));
    const sourceImage = path.join(directory, "source.png");
    execFileSync(process.env.DIALOGFORGE_BUILD_RSCRIPT || "Rscript", [
        "--vanilla", "-e", [
            'grDevices::png(commandArgs(TRUE)[[1L]],width=64,height=48)',
            'par(mar=c(0,0,0,0)); plot.new(); rect(0,0,1,1,col="red",border=NA)',
            'grDevices::dev.off()'
        ].join("; "), sourceImage
    ], { stdio: "pipe" });
    const expectedBytes = fs.readFileSync(sourceImage);
    assert.deepEqual([...expectedBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const bundle = await build({
        stdin: { resolveDir: root, contents: `
            import { saveBrowserPlot } from "./src/shell-web/browserPlotAdapter";
            import { checkPhysicalPlotResourceSave } from "./scripts/plot-resource-save-acceptance";
            window.checkPlotSave = async function(input) {
                const root = await navigator.storage.getDirectory();
                const directory = await root.getDirectoryHandle("dialogforge-private-plot-fixture", { create: true });
                let handle;
                let lock;
                const names = [];
                try {
                    return await checkPhysicalPlotResourceSave({
                        host: "browser", origin: location.origin, expectedBytes: input,
                        selectTarget: async scenario => {
                            const name = scenario + ".png";
                            names.push(name);
                            // Selection itself does not create a target. Failed
                            // HTTP reads must not produce an empty file either.
                            handle = { name, createWritable: async () => {
                                const target = await directory.getFileHandle(name, { create: true });
                                return target.createWritable();
                            } };
                        },
                        save: url => saveBrowserPlot({ url, format: "png" }, {
                            showSaveFilePicker: async () => handle
                        }, document),
                        blockWrite: async () => {
                            const target = await directory.getFileHandle(handle.name, { create: true });
                            const initial = await target.createWritable();
                            await initial.write(new Uint8Array(input));
                            await initial.close();
                            lock = await target.createWritable({ mode: "exclusive" });
                        },
                        releaseWrite: async () => {
                            await lock.abort();
                            lock = null;
                        },
                        readTarget: async () => {
                            try {
                                const target = await directory.getFileHandle(handle.name);
                                return Array.from(new Uint8Array(await (await target.getFile()).arrayBuffer()));
                            }
                            catch (error) {
                                if (error.name === "NotFoundError") return null;
                                throw error;
                            }
                        }
                    });
                }
                finally {
                    if (lock) await lock.abort();
                    for (const name of names) {
                        try { await directory.removeEntry(name); }
                        catch (error) { if (error.name !== "NotFoundError") throw error; }
                    }
                    await root.removeEntry("dialogforge-private-plot-fixture");
                }
            };
        ` }, bundle: true, write: false, platform: "browser", format: "iife", target: "es2022"
    });
    const requests = [];
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, "http://localhost").pathname;
        requests.push(pathname);
        if (pathname === "/") {
            response.writeHead(200, { "Content-Type": "text/html" }).end('<script src="/fixture.js"></script>');
        }
        else if (pathname === "/fixture.js") {
            response.writeHead(200, { "Content-Type": "application/javascript" }).end(bundle.outputFiles[0].text);
        }
        else if (pathname === "/image") {
            response.writeHead(200, { "Content-Type": "image/png" });
            response.write(expectedBytes.subarray(0, 20));
            response.end(expectedBytes.subarray(20));
        }
        else if (pathname === "/redirect") {
            response.writeHead(302, { "Location": "/image" }).end();
        }
        else if (pathname === "/truncated") {
            response.writeHead(200, { "Content-Type": "image/png", "Content-Length": expectedBytes.length,
                "Connection": "close" });
            response.end(expectedBytes.subarray(0, Math.floor(expectedBytes.length / 2)));
        }
        else {
            response.writeHead(404).end("Missing task-owned plot resource");
        }
    });
    let browser;
    let target;
    try {
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
        const origin = "http://127.0.0.1:" + server.address().port;
        const routes = new Map();
        createPlotExternalIpcController({
            ipcMain: { handle: (channel, handler) => routes.set(channel, handler) },
            shell: {}, clipboard: {}, downloadsPath: directory,
            dialog: { showSaveDialog: async () => ({ canceled: false, filePath: target }) },
            plotViewerController: { getWindow: () => null },
            plotDownloadController: createPlotDownloadController({ resourceClient: createNodeResourceClient() })
        });
        const native = await checkPhysicalPlotResourceSave({
            host: "native", origin, expectedBytes: [...expectedBytes],
            selectTarget: async scenario => { target = path.join(directory, scenario + ".png"); },
            save: url => routes.get(plotExternalIpcChannels.savePlot)(null, { url, format: "png" }),
            blockWrite: async () => {
                fs.writeFileSync(target, expectedBytes);
                fs.chmodSync(target, 0o444);
            },
            releaseWrite: async () => fs.chmodSync(target, 0o600),
            readTarget: async () => fs.existsSync(target) ? [...fs.readFileSync(target)] : null
        });
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(origin);
        const web = await page.evaluate(bytes => window.checkPlotSave(bytes), [...expectedBytes]);
        console.log(JSON.stringify({ native, browser: web, requests, privateDirectory: directory,
            source: "actual native R PNG, not a WebR device capture", renderedProductChecked: false }));
    }
    finally {
        if (target && fs.existsSync(target)) fs.chmodSync(target, 0o600);
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
