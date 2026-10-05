"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { chromium } = require("playwright");


const main = async function() {
    const root = path.resolve(__dirname, "..");
    const source = process.env.DIALOGFORGE_HELP_HTML
        || path.join(root, "src/base-app/pages/help.html");
    const html = fs.readFileSync(source, "utf8");
    const origin = "http://localhost:5173";
    const base = `${origin}/library/QCA/html/00Index.html`;
    const browser = await chromium.launch({ headless: true });

    try {
        for (const adapter of ["native-url", "scoped-worker-url"]) {
            const page = await browser.newPage();
            const resourceBase = adapter === "native-url"
                ? ""
                : `${origin}/__dialogforge_runtime_help/${"b".repeat(32)}`;
            const requests = [];
            let releaseResource;
            const pendingResource = new Promise((resolve) => {
                releaseResource = resolve;
            });
            let markResourceStarted;
            const resourceStarted = new Promise((resolve) => {
                markResourceStarted = resolve;
            });

            try {
                await page.route("**/*", async (route) => {
                    const url = new URL(route.request().url());

                    if (url.pathname.endsWith("/help.html")) {
                        await route.fulfill({ contentType: "text/html", body: html });
                    } else if (url.pathname.endsWith("/pending.png")) {
                        markResourceStarted();
                        await pendingResource;
                        await route.abort().catch(() => {});
                    } else {
                        requests.push(url.pathname);
                        await route.abort();
                    }
                });
                await page.addInitScript(({ resourceBase }) => {
                    window.helpReads = [];
                    window.helpRetirements = 0;
                    window.dialogForge = {
                        retireHelpRequest: () => { window.helpRetirements += 1; },
                        fetchHelpPage: async (url) => {
                            window.helpReads.push(url);
                            return {
                                ok: true, status: 200, url, resourceBaseUrl: resourceBase,
                                text: '<main id="nextPage">QCA topic document</main>'
                            };
                        }
                    };
                }, { resourceBase });

                const document = '<a id="earlyLink" href="truthTable.html">'
                    + '<span id="earlyChild">Truth table</span></a>'
                    + '<img src="/doc/html/pending.png">';
                const params = new URLSearchParams({
                    doc: Buffer.from(document).toString("base64"), base, resourceBase
                });
                await page.goto(`${origin}/src/base-app/pages/help.html?${params}`, {
                    waitUntil: "domcontentloaded"
                });
                const frame = page.frameLocator("#helpFrame");
                await frame.locator("#earlyLink").waitFor();
                await Promise.race([
                    resourceStarted,
                    delay(5000, undefined, { ref: false }).then(() => {
                        throw new Error("The held image request did not start.");
                    })
                ]);
                assert.notEqual(await frame.locator("body").evaluate(
                    (element) => element.ownerDocument.readyState
                ), "complete", "The real resource request must still hold document load.");

                await frame.locator("#earlyChild").click();
                await frame.locator("#nextPage").waitFor({ timeout: 5000 });
                assert.deepEqual(await page.evaluate(() => window.helpReads), [
                    `${origin}/library/QCA/html/truthTable.html`
                ]);
                assert.equal(requests.includes("/library/QCA/html/truthTable.html"), false,
                    "An early click must use the owning Help reader, not a static server navigation.");
                assert.equal(await page.evaluate(() => window.helpRetirements), 1,
                    "Following a help link retires any pending host opening.");
                await page.locator("#helpBack").click();
                await frame.locator("#earlyLink").waitFor();
                assert.equal(await page.evaluate(() => window.helpRetirements), 2,
                    "Back navigation retires pending host openings, including cached documents.");
            } finally {
                releaseResource();
                await page.close();
            }
        }
    } finally {
        await browser.close();
    }

    console.log("Early help navigation passed both resource bindings; actual host acceptance is separate.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
