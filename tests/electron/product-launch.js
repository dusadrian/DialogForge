"use strict";

const fs = require("node:fs");
const path = require("node:path");


const readRequiredProductPath = function() {
    const productPath = String(
        process.env.DIALOGFORGE_ELECTRON_PRODUCT_PATH || ""
    ).trim();

    if (!productPath) {
        throw new Error(
            "DIALOGFORGE_ELECTRON_PRODUCT_PATH must point at an external product directory."
        );
    }

    return productPath;
};


const readProductId = function(productPath) {
    const manifestPath = path.join(productPath, "product.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const productId = String(manifest.id || "").trim();

    if (!productId) {
        throw new Error(`Product manifest at ${manifestPath} must define an id.`);
    }

    return productId;
};


const productLaunchArgs = function(mainEntry) {
    return [
        mainEntry,
        "--product-path",
        readRequiredProductPath()
    ];
};


const pageHasMainWindowMarker = async function(page) {
    try {
        return await page.evaluate(() => {
            return Boolean(document.getElementById("visibleCommandInput"));
        });
    }
    catch {
        return false;
    }
};


const findMainWindowPage = async function(app, timeout = 30000) {
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
        const pages = app.windows();

        for (const page of pages) {
            if (await pageHasMainWindowMarker(page)) {
                return page;
            }
        }

        const remaining = Math.max(1, deadline - Date.now());
        const waitMs = Math.min(250, remaining);
        await Promise.race([
            app.waitForEvent("window", {
                timeout: waitMs
            }).catch(() => null),
            new Promise((resolve) => {
                setTimeout(resolve, waitMs);
            })
        ]);
    }

    throw new Error("Timed out waiting for the DialogForge main window.");
};


const requiredProductId = function() {
    return readProductId(readRequiredProductPath());
};


module.exports = {
    findMainWindowPage,
    productLaunchArgs,
    requiredProductId
};
