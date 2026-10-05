"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");


const main = async function() {
    const root = path.resolve(__dirname, "..");
    const html = fs.readFileSync(path.join(root, "src/base-app/pages/help.html"), "utf8");
    const origin = "http://localhost:5173";
    const base = `${origin}/library/base/html/names.html`;
    const document = '<main><link rel="stylesheet" href="/doc/html/probe.css">'
        + '<script src="/doc/html/probe.js"></script>'
        + '<img id="resourceImage" src="/doc/html/probe.png">'
        + '<div id="assetProbe">Resource probe</div>'
        + '<a id="nextTopic" href="next.html">Next topic</a></main>';
    const browser = await chromium.launch({ headless: true });
    try {
        for (const adapter of ["native-url", "scoped-worker-url"]) {
            const page = await browser.newPage();
            const requests = [];
            const resourceBase = adapter === "native-url"
                ? ""
                : `${origin}/__dialogforge_runtime_help/${"a".repeat(32)}`;
            await page.route("**/*", async (route) => {
                const url = new URL(route.request().url());
                if (url.pathname.endsWith("/help.html")) {
                    await route.fulfill({ contentType: "text/html", body: html });
                } else if (url.pathname.endsWith("/probe.css")) {
                    requests.push(url.href);
                    await route.fulfill({ contentType: "text/css", body: "#assetProbe { color: rgb(1, 2, 3); }" });
                } else if (url.pathname.endsWith("/probe.js")) {
                    requests.push(url.href);
                    await route.fulfill({ contentType: "text/javascript",
                        body: 'document.documentElement.dataset.resourceScript = "loaded";' });
                } else if (url.pathname.endsWith("/probe.png")) {
                    requests.push(url.href);
                    await route.fulfill({ contentType: "image/png", body: Buffer.from(
                        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGNcAAAAASUVORK5CYII=",
                        "base64") });
                } else if (["arrow-left.svg", "arrow-right.svg", "home.svg"].includes(path.basename(url.pathname))) {
                    await route.fulfill({ contentType: "image/svg+xml", body: fs.readFileSync(
                        path.join(root, "src/assets/icons", path.basename(url.pathname))) });
                } else {
                    await route.abort();
                }
            });
            await page.addInitScript(({ resourceBase }) => {
                window.dialogForge = {
                    fetchHelpPage: async (url) => ({
                        ok: true, status: 200, url, resourceBaseUrl: resourceBase,
                        text: '<main id="nextPage">Next page</main>'
                    })
                };
            }, { resourceBase });
            const params = new URLSearchParams({
                doc: Buffer.from(document).toString("base64"), base, resourceBase
            });
            await page.goto(`${origin}/src/base-app/pages/help.html?${params}`);
            const frame = page.frameLocator("#helpFrame");
            await frame.locator('html[data-resource-script="loaded"]').waitFor();
            const values = await frame.locator("#assetProbe").evaluate((element) => ({
                color: getComputedStyle(element).color,
                base: element.ownerDocument.baseURI,
                image: element.ownerDocument.querySelector("#resourceImage").src,
                link: element.ownerDocument.querySelector("#nextTopic").href
            }));
            assert.equal(values.color, "rgb(1, 2, 3)");
            assert.equal(values.base, base, "Resource routing must not redefine navigation's base URI.");
            assert.equal(values.image, `${resourceBase || origin}/doc/html/probe.png`);
            const imageWidth = await frame.locator("#resourceImage").evaluate((image) => {
                if (image.complete) {
                    return image.naturalWidth;
                }
                return new Promise((resolve) => {
                    image.onload = () => resolve(image.naturalWidth);
                    image.onerror = () => resolve(0);
                });
            });
            assert.equal(imageWidth, 1, "The resource image must decode, not just carry a rewritten URL.");
            assert.equal(values.link, `${origin}/library/base/html/next.html`);
            assert.equal(requests.length, 3);
            await frame.locator("#nextTopic").click();
            await frame.locator("#nextPage").waitFor();
            await page.locator("#helpBack").click();
            await frame.locator("#assetProbe").waitFor();
            await page.locator("#helpForward").click();
            await frame.locator("#nextPage").waitFor();
            await page.locator("#helpHome").click();
            await frame.locator("#assetProbe").waitFor();
            assert.equal(await page.locator(".help-toolbar").evaluate((element) => element.getBoundingClientRect().height), 28);
            await page.close();
        }
    } finally {
        await browser.close();
    }
    console.log("Shared viewer resource/navigation fixtures passed; these mocks are not native R/WebR application acceptance.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
