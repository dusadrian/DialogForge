"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");


let stagedProductPath = "";


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
    const manifestPath = path.join(productPath, "package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const productId = String(manifest.product?.id || "").trim();

    if (!productId) {
        throw new Error(`Product package at ${manifestPath} must define product.id.`);
    }

    return productId;
};


const stageProduct = function(productPath) {
    const resolvedProductPath = path.resolve(productPath);

    if (stagedProductPath === resolvedProductPath) {
        return;
    }

    const projectRoot = process.cwd();
    const result = spawnSync(
        process.execPath,
        [
            path.join(projectRoot, "dist/scripts/package-product.js"),
            "--product-path",
            resolvedProductPath,
            "--stage-only"
        ],
        {
            cwd: projectRoot,
            env: process.env,
            stdio: "inherit"
        }
    );

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`Product staging exited with status ${result.status}.`);
    }

    stagedProductPath = resolvedProductPath;
};


const productLaunchArgs = function(mainEntry) {
    const productPath = readRequiredProductPath();
    stageProduct(productPath);

    return [
        mainEntry,
        "--product-path",
        productPath
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
        const mainPage = pages.find((page) => {
            return page.url().endsWith("/src/base-app/pages/main.html");
        });

        if (mainPage) {
            return mainPage;
        }

        for (const page of pages) {
            const hasMarker = await Promise.race([
                pageHasMainWindowMarker(page),
                new Promise((resolve) => setTimeout(() => resolve(false), 500))
            ]);

            if (hasMarker) {
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


const readApplicationProcessIds = function(mainPid) {
    if (process.platform === "win32") {
        return [mainPid];
    }

    const result = spawnSync("ps", ["-axo", "pid=,ppid="], {
        encoding: "utf8",
        timeout: 2000
    });
    const rows = String(result.stdout || "").trim().split("\n").map(function(line) {
        return line.trim().split(/\s+/).map(Number);
    });
    const owned = [mainPid];

    for (let index = 0; index < owned.length; index += 1) {
        for (const [pid, parent] of rows) {
            if (parent === owned[index] && !owned.includes(pid)) {
                owned.push(pid);
            }
        }
    }

    return owned;
};


const closeTestApplication = async function(app) {
    const child = app.process();

    if (!child || child.exitCode !== null || child.signalCode !== null) {
        return true;
    }

    // Capture ownership before closing. Never inspect or reactivate the UI
    // after close, including when a renderer cannot answer the quit request.
    const owned = readApplicationProcessIds(child.pid);
    let timer;
    let failure;

    try {
        failure = await Promise.race([
            app.close().then(() => "", error => String(error)),
            new Promise(resolve => {
                timer = setTimeout(() => {
                    resolve("Electron did not close within 2 seconds.");
                }, 2000);
            })
        ]);
    }
    finally {
        clearTimeout(timer);
    }

    if (!failure) {
        return true;
    }

    console.error("Test application cleanup failed: " + failure);
    process.exitCode = 1;

    if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            timeout: 5000,
            windowsHide: true
        });
    }
    else {
        for (const pid of owned.reverse()) {
            try {
                process.kill(pid, "SIGKILL");
            }
            catch (error) {
                if (error.code !== "ESRCH") {
                    console.error("Could not stop test process " + pid + ": " + error);
                }
            }
        }
    }

    // Cleanup must not replace the original readiness/assertion exception.
    // Callers that relaunch within a test must require this result to be true.
    return false;
};


module.exports = {
    closeTestApplication,
    findMainWindowPage,
    productLaunchArgs,
    requiredProductId
};
