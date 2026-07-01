"use strict";

const http = require("http");
const https = require("https");


const baseUrl = String(process.argv[2] || process.env.DIALOGFORGE_WEB_URL || "http://127.0.0.1:5173")
    .replace(/\/+$/g, "");

const requiredEndpoints = [
    "/start?k=EN-DS-26-0001",
    "/api/composition",
    "/vendor/preact/preact.module.js",
    "/webr/webr.js",
    "/webr/loader.js",
    "/monaco/vs/loader.js",
    "/webr-library/library.data.gz"
];


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


const verifyComposition = function(result) {
    const composition = JSON.parse(result.body.toString("utf8"));

    if (composition.product?.id !== "DialogR") {
        throw new Error("/api/composition did not return the DialogR product composition");
    }

    if (composition.runtime?.id !== "webr") {
        throw new Error("/api/composition did not select the WebR runtime");
    }

    if (!Array.isArray(composition.menu) || !composition.menu.length) {
        throw new Error("/api/composition did not include a menu");
    }

    if (!composition.menu.some((item) => item?.id === "Analyze" || item?.label === "Analyze")) {
        throw new Error("/api/composition did not include the Analyze menu");
    }
};


const main = async function() {
    console.log(`Verifying DialogR Web deployment at ${baseUrl}`);

    for (const endpoint of requiredEndpoints) {
        const result = await fetchEndpoint(endpoint);

        assertOkEndpoint(result);

        if (endpoint === "/api/composition") {
            verifyComposition(result);
        }

        console.log(`OK ${endpoint}`);
    }
};


main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
