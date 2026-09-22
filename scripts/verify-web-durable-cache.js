"use strict";

// Proves the durable asset cache does the one thing it exists for: keep the
// heavy WebR and Monaco runtime available after the HTTP cache is gone.
//
// The test clears only the HTTP cache between loads, leaving Cache Storage
// alone. That is exactly what automatic eviction under storage pressure looks
// like to the page, and it is the case plain HTTP caching cannot survive.
//
// Usage: node scripts/verify-web-durable-cache.js [baseUrl]

const baseUrl = String(
    process.argv[2] || process.env.DIALOGFORGE_WEB_URL || "http://127.0.0.1:5173"
).replace(/\/+$/g, "");

const runtimeReadyTimeout = 120000;

const immutableAssetPattern = new RegExp([
    "^/(?:webr|monaco)-[0-9a-f]{16}/",
    "^/browser-esm/(?:dialogBuilder|shell)-[0-9a-f]{16}\\.js$",
    "^/browser-product/dialogs/customJSRuntime-[0-9a-f]{16}\\.js$"
].join("|"));


const waitForRuntimeReady = function(page) {
    return page.waitForFunction(() => {
        const cover = document.getElementById("consoleCoverMessage");

        return Boolean(cover) && cover.textContent.trim() === "WebR ready";
    }, undefined, { timeout: runtimeReadyTimeout });
};


const readDurableCacheState = function(page) {
    return page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        const names = await caches.keys();
        const assetCacheName = names.find((name) => {
            return name.startsWith("dialogforge-assets-");
        });
        const entries = assetCacheName
            ? (await (await caches.open(assetCacheName)).keys())
                .map((request) => new URL(request.url).pathname)
            : [];

        return {
            controlled: Boolean(navigator.serviceWorker.controller),
            active: Boolean(registration && registration.active),
            persisted: navigator.storage?.persisted
                ? await navigator.storage.persisted()
                : null,
            assetCacheName: assetCacheName || "",
            entries
        };
    });
};


const main = async function() {
    const { chromium } = require("playwright");
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log(`Verifying the durable asset cache at ${baseUrl}`);

        await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
        await waitForRuntimeReady(page);

        // The warm-up is fired once the runtime reports ready; give the worker
        // a moment to store what the page told it about.
        await page.waitForTimeout(6000);

        const firstVisit = await readDurableCacheState(page);

        if (!firstVisit.active) {
            throw new Error("No service worker became active on the first visit");
        }

        const cachedRuntime = firstVisit.entries.filter((pathname) => {
            return immutableAssetPattern.test(pathname);
        });
        const missingHeavy = ["/R.wasm", "/R.js", "/libRblas.so", "/libRlapack.so"]
            .filter((suffix) => {
                return !cachedRuntime.some((pathname) => pathname.endsWith(suffix));
            });

        if (missingHeavy.length) {
            throw new Error(
                `The durable cache is missing ${missingHeavy.join(", ")}`
            );
        }

        console.log(
            `OK first visit stored ${cachedRuntime.length} immutable assets `
            + `in ${firstVisit.assetCacheName}`
        );
        console.log(`OK persistent storage granted: ${firstVisit.persisted}`);

        // Drop the HTTP cache only. Cache Storage survives, which is exactly
        // what automatic eviction under storage pressure looks like, and what
        // plain HTTP caching cannot survive.
        //
        // The assertion is deliberately not "block the network and see if it
        // still boots": Playwright's request interception can run ahead of the
        // service worker, so a block reports a failure the browser would never
        // have had. What is checked instead is that the heavy runtime is in
        // Cache Storage and that the app still starts once the HTTP cache is
        // gone. Byte-level proof comes from scripts/measure-web-transfer.js.
        const client = await context.newCDPSession(page);

        await client.send("Network.clearBrowserCache");
        console.log("-- HTTP cache cleared (Cache Storage left intact)");

        await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
        await waitForRuntimeReady(page);

        const secondVisit = await readDurableCacheState(page);

        if (!secondVisit.controlled) {
            throw new Error("The second visit was not controlled by the service worker");
        }

        const stillCached = ["/R.wasm", "/R.js", "/libRblas.so", "/libRlapack.so"]
            .filter((suffix) => {
                return secondVisit.entries.some((pathname) => pathname.endsWith(suffix));
            });

        if (stillCached.length !== 4) {
            throw new Error(
                "The heavy runtime is no longer in the durable cache after reload"
            );
        }

        console.log("OK second visit controlled by the service worker");
        console.log(
            'OK reached "WebR ready" with no HTTP cache, heavy runtime still '
            + "held in Cache Storage"
        );
        console.log("\nDurable asset cache OK.");
    }
    finally {
        await browser.close();
    }
};


main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
