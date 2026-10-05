"use strict";

// Exercises the actual worker/channel/renderer files, with a disposable byte
// source in place of WebR. This is not selected-product or actual WebR acceptance.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const esbuild = require("esbuild");
const { chromium } = require("playwright");


const main = async function() {
    const root = path.resolve(__dirname, "..");
    const bundle = function(entry, globalName) {
        return esbuild.buildSync({
            entryPoints: [path.join(root, entry)], bundle: true, write: false,
            platform: "browser", format: "iife", target: "es2022", globalName
        }).outputFiles[0].text;
    };
    const worker = bundle("src/shell-web/serviceWorker.js");
    const channel = bundle("src/shell-web/browserHelpResourceChannel.ts", "HelpChannel");
    const reader = bundle("src/runtime/providers/webr/webRHelpDocument.ts", "HelpReader");
    const help = fs.readFileSync(path.join(root, "src/base-app/pages/help.html"), "utf8");
    const server = http.createServer(function(request, response) {
        const pathname = new URL(request.url, "http://localhost").pathname;
        if (pathname === "/sw.js" || pathname === "/channel.js" || pathname === "/reader.js") {
            response.setHeader("Content-Type", "text/javascript");
            response.end(pathname === "/sw.js" ? worker : pathname === "/reader.js" ? reader : channel);
        } else if (pathname === "/") {
            response.setHeader("Content-Type", "text/html");
            response.end('<script src="/channel.js"></script><script src="/reader.js"></script><div id="viewer"></div>');
        } else if (pathname === "/src/base-app/pages/help.html") {
            response.setHeader("Content-Type", "text/html");
            response.end(help);
        } else if (["arrow-left.svg", "arrow-right.svg", "home.svg"].includes(path.basename(pathname))) {
            response.setHeader("Content-Type", "image/svg+xml");
            response.end(fs.readFileSync(path.join(root, "src/assets/icons", path.basename(pathname))));
        } else {
            response.writeHead(404);
            response.end("No fixture resource at this unscoped address");
        }
    });
    let browser;
    try {
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
        const origin = `http://127.0.0.1:${server.address().port}`;
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(origin);
        await page.evaluate(async () => {
            await navigator.serviceWorker.register("/sw.js");
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) {
                await new Promise((resolve) => navigator.serviceWorker.addEventListener(
                    "controllerchange", resolve, { once: true }
                ));
            }
        });
        const base = await page.evaluate(async () => {
            window.resourceReads = [];
            const html = '<main><link rel="stylesheet" href="/doc/html/probe.css">'
                + '<script src="/doc/html/probe.js"></script><div id="assetProbe">Resource probe</div></main>';
            const reader = HelpReader.createWebRHelpPageReader(location.origin, async (command) => {
                // Mock only the worker's physical R reply; use the canonical
                // packet decoder, reader, channel and renderer unchanged.
                const pathname = JSON.parse(command.match(/\.path <- ("[^\n]*")/)[1]);
                window.resourceReads.push(`${location.origin}${pathname}`);
                const css = pathname.endsWith("probe.css");
                const topic = pathname.endsWith("names.html");
                const body = topic ? html : css
                    ? "#assetProbe { color: rgb(1, 2, 3); }"
                    : 'document.documentElement.dataset.resourceScript = "loaded";';
                return JSON.stringify({
                    status: 200, headers: [],
                    contentType: topic ? "text/html" : css ? "text/css" : "text/javascript",
                    body: Array.from(new TextEncoder().encode(body), (value) =>
                        value.toString(16).padStart(2, "0")).join("")
                });
            });
            window.resourceChannel = HelpChannel.createBrowserHelpResourceChannel({
                serviceWorker: navigator.serviceWorker, origin: location.origin,
                reader
            });
            const resourceBase = await window.resourceChannel.register();
            const loaded = await reader.fetchPage("/library/base/html/names.html");
            if (!loaded.ok) {
                throw new Error(loaded.error);
            }
            const params = new URLSearchParams({
                doc: btoa(loaded.text), base: loaded.url,
                resourceBase
            });
            const frame = document.createElement("iframe");
            frame.id = "helpViewer";
            frame.style.cssText = "width:800px;height:600px;border:0";
            frame.src = `/src/base-app/pages/help.html?${params}`;
            document.getElementById("viewer").append(frame);
            return resourceBase;
        });
        const document = page.frameLocator("#helpViewer").frameLocator("#helpFrame");
        await document.locator('html[data-resource-script="loaded"]').waitFor();
        assert.equal(await document.locator('link[rel="stylesheet"]').evaluate(
            (element) => Boolean(element.sheet)
        ), true);
        assert.equal(await document.locator("#assetProbe").evaluate(
            (element) => getComputedStyle(element).color
        ), "rgb(1, 2, 3)");
        assert.deepEqual((await page.evaluate(() => window.resourceReads)).sort(), [
            `${origin}/doc/html/probe.css`, `${origin}/doc/html/probe.js`,
            `${origin}/library/base/html/names.html`
        ]);
        const delivery = await page.evaluate(async (resourceBase) => {
            const response = await fetch(`${resourceBase}/doc/html/probe.css`);
            const cache = await caches.open("dialogforge-assets-DIALOGFORGE_BUILD_ID");
            return { status: response.status, policy: response.headers.get("cache-control"),
                cached: Boolean(await cache.match(`${resourceBase}/doc/html/probe.css`)) };
        }, base);
        assert.deepEqual(delivery, { status: 200, policy: "no-store", cached: false });
        await page.evaluate(() => window.resourceChannel.close());
        await page.waitForFunction(async (resourceBase) => {
            return (await fetch(`${resourceBase}/doc/html/probe.css`)).status === 410;
        }, base);
        await page.close();
    } finally {
        if (browser) {
            await browser.close();
        }
        await new Promise((resolve) => server.close(resolve));
    }
    console.log("Actual service-worker/channel/shared-viewer integration passed; WebR and product acceptance remain open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
