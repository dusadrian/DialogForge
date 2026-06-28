"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");


const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const ignoredDirectories = new Set([
    ".git",
    "dist",
    "node_modules"
]);
const ignoredFileSuffixes = [
    ".log",
    ".tmp",
    ".swp"
];


/**
 * @typedef {Object} ProductWatchSelection
 * @property {string} productPath
 * @property {string[]} forwardedArgs
 */


/**
 * @returns {ProductWatchSelection}
 */
const readArgs = function() {
    const args = process.argv.slice(2);
    const productPath = args[0] && !args[0].startsWith("-")
        ? path.resolve(args[0])
        : "";

    if (!productPath) {
        throw new Error("Usage: npm run dev:product -- /path/to/Product [electron args...]");
    }

    return {
        productPath,
        forwardedArgs: args.slice(1)
    };
};


const shouldIgnoreEntry = function(entryName) {
    return ignoredDirectories.has(entryName)
        || ignoredFileSuffixes.some((suffix) => {
            return entryName.endsWith(suffix);
        });
};


const listWatchedFiles = function(rootPath) {
    const files = [];
    const visit = function(directoryPath) {
        fs.readdirSync(directoryPath, { withFileTypes: true }).forEach((entry) => {
            if (shouldIgnoreEntry(entry.name)) {
                return;
            }

            const entryPath = path.join(directoryPath, entry.name);

            if (entry.isDirectory()) {
                visit(entryPath);
                return;
            }

            if (entry.isFile()) {
                files.push(entryPath);
            }
        });
    };

    visit(rootPath);

    return files;
};


/**
 * @param {string} rootPath
 * @returns {Map<string, string>}
 */
const readTreeSnapshot = function(rootPath) {
    const snapshot = new Map();

    listWatchedFiles(rootPath).forEach((filePath) => {
        const stat = fs.statSync(filePath);

        snapshot.set(filePath, `${String(stat.mtimeMs)}:${String(stat.size)}`);
    });

    return snapshot;
};


/**
 * @param {Map<string, string>} left
 * @param {Map<string, string>} right
 * @returns {boolean}
 */
const snapshotsAreEqual = function(left, right) {
    if (left.size !== right.size) {
        return false;
    }

    for (const [filePath, value] of left.entries()) {
        if (right.get(filePath) !== value) {
            return false;
        }
    }

    return true;
};


/**
 * @param {string} productPath
 */
const stageProduct = function(productPath) {
    const result = spawnSync(process.execPath, [
        path.join(distDir, "scripts/package-product.js"),
        "--product-path",
        productPath,
        "--stage-only"
    ], {
        cwd: rootDir,
        env: process.env,
        stdio: "inherit"
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(
            "Product staging failed with exit code " + String(result.status)
        );
    }
};


const electronCommand = function() {
    return process.platform === "win32"
        ? "electron.cmd"
        : "electron";
};


/**
 * @param {string} productPath
 * @param {string[]} forwardedArgs
 * @returns {import("child_process").ChildProcess}
 */
const startElectron = function(productPath, forwardedArgs) {
    const child = spawn(electronCommand(), [
        "dist/scripts/electron-main.js",
        "--product-path",
        productPath,
        ...forwardedArgs
    ], {
        cwd: rootDir,
        env: process.env,
        stdio: "inherit"
    });

    child.on("error", (error) => {
        console.error("[DialogForge] Could not start Electron:");
        console.error(error && error.stack ? error.stack : error);
    });

    return child;
};


/**
 * @param {import("child_process").ChildProcess | null} child
 * @returns {Promise<void>}
 */
const stopElectron = function(child) {
    if (!child || child.killed || child.exitCode !== null) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            child.kill("SIGKILL");
        }, 3000);

        child.once("exit", () => {
            clearTimeout(timeout);
            resolve();
        });
        child.kill("SIGTERM");
    });
};


const main = function() {
    const selection = readArgs();
    let snapshot = readTreeSnapshot(selection.productPath);
    let electronProcess = null;
    let busy = false;
    let pendingRefresh = false;
    let stoppingForRestart = false;

    const restartElectron = async function(reason) {
        if (busy) {
            pendingRefresh = true;
            return;
        }

        busy = true;

        try {
            console.log(`[DialogForge] Staging product after ${reason}.`);
            stageProduct(selection.productPath);
            stoppingForRestart = true;
            await stopElectron(electronProcess);
            stoppingForRestart = false;
            electronProcess = startElectron(
                selection.productPath,
                selection.forwardedArgs
            );
            electronProcess.once("exit", (code) => {
                if (!stoppingForRestart && !busy) {
                    process.exit(code ?? 0);
                }
            });
        }
        catch (error) {
            stoppingForRestart = false;
            console.error("[DialogForge] Product refresh failed:");
            console.error(error && error.stack ? error.stack : error);
        }
        finally {
            busy = false;

            if (pendingRefresh) {
                pendingRefresh = false;
                void restartElectron("pending product file change");
            }
        }
    };

    void restartElectron("startup");

    const pollTimer = setInterval(() => {
        let nextSnapshot;

        try {
            nextSnapshot = readTreeSnapshot(selection.productPath);
        }
        catch (error) {
            console.error("[DialogForge] Could not read product tree:");
            console.error(error && error.stack ? error.stack : error);
            return;
        }

        if (snapshotsAreEqual(snapshot, nextSnapshot)) {
            return;
        }

        snapshot = nextSnapshot;
        void restartElectron("product file change");
    }, 750);

    const stop = async function() {
        clearInterval(pollTimer);
        await stopElectron(electronProcess);
        process.exit(0);
    };

    process.on("SIGINT", () => {
        void stop();
    });
    process.on("SIGTERM", () => {
        void stop();
    });
};


main();
