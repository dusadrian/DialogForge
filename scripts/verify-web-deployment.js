"use strict";

const http = require("http");
const https = require("https");


const baseUrl = String(process.argv[2] || process.env.DIALOGFORGE_WEB_URL || "http://127.0.0.1:5173")
    .replace(/\/+$/g, "");
const runBrowserCheck = process.argv.includes("--browser");

const requiredEndpoints = [
    "/",
    "/start?k=EN-DS-26-0001",
    "/api/composition",
    "/api/product.css",
    "/vendor/dialogforge-iroh/0.1.0/index.mjs",
    "/vendor/dialogforge-iroh/0.1.0/dialogforge_iroh_bg.wasm",
    "/vendor/preact/preact.module.js",
    "/vendor/preact/hooks.module.js",
    "/webr/webr.js",
    "/webr/loader.js",
    "/monaco/vs/loader.js",
    "/webr-library/library.data.gz"
];

const requiredIsolationHeaders = {
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
    "cross-origin-resource-policy": "same-origin"
};


const fetchEndpoint = function(pathname) {
    return new Promise((resolve, reject) => {
        const target = new URL(`${baseUrl}${pathname}`);
        const client = target.protocol === "https:" ? https : http;
        const request = client.get(target, (response) => {
            const chunks = [];

            response.on("data", (chunk) => {
                chunks.push(chunk);
            });
            response.on("end", () => {
                resolve({
                    target,
                    pathname,
                    statusCode: response.statusCode || 0,
                    headers: response.headers,
                    body: Buffer.concat(chunks)
                });
            });
        });

        request.on("error", reject);
        request.setTimeout(15000, () => {
            request.destroy(new Error(`Timed out while fetching ${target}`));
        });
    });
};


const assertOkEndpoint = function(result) {
    if (result.statusCode !== 200) {
        throw new Error(`${result.pathname} returned HTTP ${result.statusCode}`);
    }

    if (!result.body.length) {
        throw new Error(`${result.pathname} returned an empty response`);
    }
};


const assertIsolationHeaders = function(result) {
    Object.entries(requiredIsolationHeaders).forEach(([name, expected]) => {
        const actual = String(result.headers[name] || "").toLowerCase();

        if (actual !== expected) {
            throw new Error(
                `${result.pathname} returned ${name}: ${actual || "<missing>"}; expected ${expected}`
            );
        }
    });
};


const assertContentType = function(result, expected) {
    const contentType = String(result.headers["content-type"] || "")
        .toLowerCase();

    if (!contentType.startsWith(expected)) {
        throw new Error(
            `${result.pathname} returned content-type ${contentType || "<missing>"}; `
            + `expected ${expected}`
        );
    }
};


const verifyWebAssetContract = function(result) {
    if (result.pathname === "/") {
        assertContentType(result, "text/html");

        if (result.body.toString("utf8").trim() === "Not found") {
            throw new Error("/ returned the fallback Not found response");
        }
    }

    if (result.pathname.endsWith("/index.mjs")) {
        assertContentType(result, "text/javascript");
    }

    if (result.pathname.endsWith(".wasm")) {
        assertContentType(result, "application/wasm");
    }
};


const verifyComposition = function(result) {
    const composition = JSON.parse(result.body.toString("utf8"));

    if (!composition.product || !composition.product.id) {
        throw new Error("/api/composition did not return a product composition");
    }

    if (!composition.runtime || !composition.runtime.id) {
        throw new Error("/api/composition did not return a runtime composition");
    }

    if (!Array.isArray(composition.menu) || !composition.menu.length) {
        throw new Error("/api/composition did not include a menu");
    }
};


const verifyBrowserIsolation = async function() {
    const { chromium } = require("playwright");
    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
        await page.goto(`${baseUrl}/start?k=EN-DS-26-0001`, {
            waitUntil: "domcontentloaded",
            timeout: 30000
        });

        const crossOriginIsolated = await page.evaluate(() => window.crossOriginIsolated === true);

        if (!crossOriginIsolated) {
            throw new Error("Browser did not report window.crossOriginIsolated === true");
        }
    } finally {
        await browser.close();
    }
};


const main = async function() {
    console.log(`Verifying DialogForge web deployment at ${baseUrl}`);

    for (const endpoint of requiredEndpoints) {
        const result = await fetchEndpoint(endpoint);

        assertOkEndpoint(result);
        assertIsolationHeaders(result);
        verifyWebAssetContract(result);

        if (endpoint === "/api/composition") {
            verifyComposition(result);
        }

        console.log(`OK ${endpoint}`);
    }

    if (runBrowserCheck) {
        await verifyBrowserIsolation();
        console.log("OK browser crossOriginIsolated");
    }
};


main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
