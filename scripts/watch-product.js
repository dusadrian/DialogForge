"use strict";

const fs = require("fs");
const os = require("os");
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
        throw new Error("Usage: npm run dev:watch -- /path/to/Product [electron args...]");
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


// How long a path the app claimed stays adoptable. Long enough to cover a
// multi-file write spread over a few poll cycles, short enough that a developer
// editing the same file straight afterwards still gets their restart.
const SELF_WRITE_CLAIM_MS = 5000;


/**
 * Paths the running app reported writing itself (a dialog import, say). Those
 * are not developer edits, so they must not cost the user their window. The app
 * claims a path before writing it, so a claim is always in hand by the time the
 * change shows up in a snapshot.
 *
 * @param {string} logPath
 * @param {Map<string, number>} claims
 */
const drainSelfWrites = function(logPath, claims) {
    const now = Date.now();

    claims.forEach((expiresAt, filePath) => {
        if (expiresAt <= now) {
            claims.delete(filePath);
        }
    });

    try {
        if (!fs.existsSync(logPath)) {
            return;
        }

        const contents = fs.readFileSync(logPath, "utf8");

        if (!contents) {
            return;
        }

        fs.writeFileSync(logPath, "", "utf8");
        contents
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => {
                claims.set(path.resolve(line), now + SELF_WRITE_CLAIM_MS);
            });
    }
    catch (error) {
        console.error("[DialogForge] Could not read the self-write log:");
        console.error(error && error.stack ? error.stack : error);
    }
};


/**
 * @param {Map<string, string>} left
 * @param {Map<string, string>} right
 * @returns {string[]}
 */
const changedPaths = function(left, right) {
    const changed = [];

    right.forEach((value, filePath) => {
        if (left.get(filePath) !== value) {
            changed.push(filePath);
        }
    });
    left.forEach((_value, filePath) => {
        if (!right.has(filePath)) {
            changed.push(filePath);
        }
    });

    return changed;
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
const startElectron = function(productPath, forwardedArgs, selfWriteLogPath) {
    const child = spawn(electronCommand(), [
        "dist/scripts/electron-main.js",
        "--product-path",
        productPath,
        ...forwardedArgs
    ], {
        cwd: rootDir,
        env: Object.assign({}, process.env, {
            DIALOGFORGE_PRODUCT_SELF_WRITE_LOG: selfWriteLogPath
        }),
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
    // Kept outside the product tree so writing to it cannot trigger a restart.
    const selfWriteLogPath = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-watch-")),
        "self-writes.log"
    );
    const selfWriteClaims = new Map();
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
                selection.forwardedArgs,
                selfWriteLogPath
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

        drainSelfWrites(selfWriteLogPath, selfWriteClaims);

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

        const changed = changedPaths(snapshot, nextSnapshot);

        snapshot = nextSnapshot;

        if (
            selfWriteClaims.size > 0
            && changed.every((filePath) => {
                return selfWriteClaims.has(path.resolve(filePath));
            })
        ) {
            console.log(
                "[DialogForge] Adopted "
                + String(changed.length)
                + " file(s) written by the running app; not restarting."
            );
            return;
        }

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
