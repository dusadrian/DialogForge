"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");


const rootDir = path.resolve(__dirname, "..");


const readArgs = function() {
    const options = {
        productPath: "",
        outputDir: "",
        targets: [
            "application-menu",
            "package-update-menu",
            "console",
            "help",
            "script-editor"
        ],
        timeoutMs: 120000
    };
    const args = process.argv.slice(2);

    for (let index = 0; index < args.length; index += 1) {
        const current = args[index];

        if (current === "--product-path") {
            index += 1;
            options.productPath = path.resolve(args[index] || "");
            continue;
        }
        if (current === "--output-dir") {
            index += 1;
            options.outputDir = path.resolve(args[index] || "");
            continue;
        }
        if (current === "--target") {
            index += 1;
            options.targets = [String(args[index] || "").trim()].filter(Boolean);
            continue;
        }
        if (current === "--timeout-ms") {
            index += 1;
            options.timeoutMs = Number(args[index] || options.timeoutMs);
            continue;
        }

        throw new Error(`Unknown production Electron verification argument: ${current}`);
    }

    if (!options.productPath) {
        throw new Error("Missing required --product-path argument.");
    }

    options.outputDir = options.outputDir || path.join(options.productPath, "build", "output");

    return options;
};


const readProduct = function(productPath) {
    const packagePath = path.join(productPath, "package.json");

    if (!fs.existsSync(packagePath)) {
        throw new Error(`Product package.json was not found: ${packagePath}`);
    }

    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const productId = String(packageJson.product?.id || "").trim();
    const productName = String(packageJson.product?.name || packageJson.productName || productId).trim();
    const runtime = String(packageJson.product?.defaultRuntimeProvider || "r").trim();

    if (!productId || !productName) {
        throw new Error(`Product id and name are required in ${packagePath}`);
    }

    return {
        productId,
        productName,
        runtime
    };
};


const findPackagedApplication = function(outputDir, productName) {
    if (!fs.existsSync(outputDir)) {
        throw new Error(`Production output directory was not found: ${outputDir}`);
    }

    const entries = fs.readdirSync(outputDir, { withFileTypes: true });

    if (process.platform === "darwin") {
        for (const entry of entries) {
            if (!entry.isDirectory() || !/^mac(?:-|$)/.test(entry.name)) {
                continue;
            }

            const appPath = path.join(outputDir, entry.name, `${productName}.app`);
            const executablePath = path.join(appPath, "Contents", "MacOS", productName);
            const resourcesPath = path.join(appPath, "Contents", "Resources");

            if (fs.existsSync(executablePath)) {
                return { appPath, executablePath, resourcesPath };
            }
        }
    }

    if (process.platform === "win32") {
        const appPath = path.join(outputDir, "win-unpacked");
        const executablePath = path.join(appPath, `${productName}.exe`);

        if (fs.existsSync(executablePath)) {
            return {
                appPath,
                executablePath,
                resourcesPath: path.join(appPath, "resources")
            };
        }
    }

    if (process.platform === "linux") {
        const appPath = path.join(outputDir, "linux-unpacked");
        // electron-builder derives the Linux executable name from the package
        // name, not from productName, so accept both spellings.
        const candidates = [
            productName,
            productName
                .toLowerCase()
                .replace(/[^a-z0-9._-]+/g, "-")
                .replace(/^-+|-+$/g, "")
        ];

        for (const candidate of candidates) {
            if (!candidate) {
                continue;
            }

            const executablePath = path.join(appPath, candidate);

            if (fs.existsSync(executablePath)) {
                return {
                    appPath,
                    executablePath,
                    resourcesPath: path.join(appPath, "resources")
                };
            }
        }
    }

    throw new Error(
        `No unpacked ${productName} production application was found under ${outputDir}`
    );
};


const assertProductionLayout = function(application, productPath) {
    const appAsarPath = path.join(application.resourcesPath, "app.asar");
    const unpackedRuntimePath = path.join(
        application.resourcesPath,
        "app.asar.unpacked",
        "src",
        "runtime",
        "providers",
        "r",
        "r-sources"
    );

    if (!fs.existsSync(appAsarPath)) {
        throw new Error(`Packaged app.asar was not found: ${appAsarPath}`);
    }
    if (!fs.existsSync(unpackedRuntimePath)) {
        throw new Error(`Unpacked R runtime sources were not found: ${unpackedRuntimePath}`);
    }

    const productRuntimeProfile = path.join(
        productPath,
        "runtime",
        "runtimeControlProfile.R"
    );

    if (fs.existsSync(productRuntimeProfile)) {
        const unpackedProductRuntimeProfile = path.join(
            application.resourcesPath,
            "app.asar.unpacked",
            "product",
            "runtime",
            "runtimeControlProfile.R"
        );

        if (!fs.existsSync(unpackedProductRuntimeProfile)) {
            throw new Error(
                "Product R runtime profile was not unpacked for the external R process: "
                + unpackedProductRuntimeProfile
            );
        }
    }
};


// A packaged crash exits on a signal with nothing useful on stderr, so pull the
// crashing thread out of the macOS crash report to name the faulting library.
// GitHub runners do not reliably write crash reports, so fall back to rerunning
// the crash under lldb, which reports the faulting frames directly.
const captureMacBacktrace = function(application, target, timeoutMs) {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-lldb-"));
    const result = spawnSync(
        "lldb",
        [
            "-b",
            "-o", "run",
            "-o", "thread backtrace all",
            "-o", "quit",
            "--", application.executablePath
        ],
        {
            cwd: application.appPath,
            encoding: "utf8",
            timeout: timeoutMs,
            env: Object.assign({}, process.env, {
                DIALOGFORGE_ELECTRON_SMOKE: "1",
                DIALOGFORGE_ELECTRON_SMOKE_TARGET: target,
                DIALOGFORGE_TEST_USER_DATA_PATH: userDataPath
            })
        }
    );

    try {
        fs.rmSync(userDataPath, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 200
        });
    } catch (cleanupError) {
        // The backtrace matters more than the temporary directory.
    }

    if (result.error) {
        return `lldb backtrace unavailable: ${result.error.message}`;
    }

    const output = `${result.stdout || ""}${result.stderr || ""}`;
    const lines = output.split("\n");
    const stopIndex = lines.findIndex((line) => {
        return /stop reason = /.test(line);
    });
    const excerpt = stopIndex >= 0
        ? lines.slice(stopIndex, stopIndex + 40)
        : lines.slice(-40);

    return ["lldb backtrace:", ...excerpt].join("\n");
};


// A crash inside Electron cannot tell us whether the native iroh binary itself
// is at fault, so load the very same unpacked .node in a plain Node process.
const checkUnpackedNativeIroh = function(application) {
    const bindingPath = path.join(
        application.resourcesPath,
        "app.asar.unpacked",
        "node_modules",
        "@number0",
        "iroh-darwin-universal",
        "iroh.darwin-universal.node"
    );

    if (!fs.existsSync(bindingPath)) {
        return `Unpacked native iroh binary was not found: ${bindingPath}`;
    }

    const probe = `
        const binding = require(${JSON.stringify(bindingPath)});
        binding.Iroh.memory()
            .then((node) => {
                return node.net.nodeId();
            })
            .then((nodeId) => {
                console.log("native-iroh-ok " + nodeId);
                process.exit(0);
            })
            .catch((error) => {
                console.log("native-iroh-error " + error.message);
                process.exit(3);
            });
    `;
    const result = spawnSync(process.execPath, ["-e", probe], {
        encoding: "utf8",
        timeout: 60000
    });
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();

    return [
        `Native iroh probe (${process.arch}, plain Node ${process.version}):`,
        `  binary: ${bindingPath}`,
        `  exit: ${result.status === null ? "null" : result.status}`
            + `${result.signal ? ` (${result.signal})` : ""}`,
        output ? `  output: ${output.split("\n").slice(0, 8).join("\n          ")}` : ""
    ].filter(Boolean).join("\n");
};


// macOS 12+ writes .ips crash reports as a JSON header line followed by a JSON
// body; older .crash reports are plain text. Handle both.
const summarizeCrashReport = function(contents) {
    const lines = contents.split("\n");

    try {
        const body = JSON.parse(lines.slice(1).join("\n"));
        const images = Array.isArray(body.usedImages) ? body.usedImages : [];
        const threads = Array.isArray(body.threads) ? body.threads : [];
        const faulting = threads[body.faultingThread] || threads[0] || {};
        const frames = Array.isArray(faulting.frames) ? faulting.frames : [];
        const described = frames.slice(0, 20).map((frame, index) => {
            const image = images[frame.imageIndex] || {};
            const binary = String(image.name || image.path || "unknown");
            const symbol = frame.symbol
                ? `${frame.symbol} + ${frame.symbolLocation || 0}`
                : `0x${Number(frame.imageOffset || 0).toString(16)}`;

            return `  ${index}  ${binary}  ${symbol}`;
        });

        return [
            `Exception: ${JSON.stringify(body.exception || {})}`,
            `Faulting thread: ${body.faultingThread}`,
            ...described
        ].join("\n");
    } catch (parseError) {
        const crashedIndex = lines.findIndex((line) => {
            return /Thread \d+ Crashed/.test(line);
        });

        return crashedIndex >= 0
            ? lines.slice(crashedIndex, crashedIndex + 25).join("\n")
            : lines.slice(0, 40).join("\n");
    }
};


const findMacCrashReports = function(reportDir, productName, startedAt) {
    return fs.readdirSync(reportDir)
        .filter((name) => {
            return name.startsWith(productName) && /\.(ips|crash)$/.test(name);
        })
        .map((name) => {
            const reportPath = path.join(reportDir, name);

            return { reportPath, modifiedAt: fs.statSync(reportPath).mtimeMs };
        })
        .filter((report) => {
            return report.modifiedAt >= startedAt;
        })
        .sort((left, right) => {
            return right.modifiedAt - left.modifiedAt;
        });
};


const readMacCrashReport = function(productName, startedAt) {
    const reportDirs = [
        path.join(os.homedir(), "Library", "Logs", "DiagnosticReports"),
        path.join("/Library", "Logs", "DiagnosticReports")
    ].filter((candidate) => {
        return fs.existsSync(candidate);
    });

    if (process.platform !== "darwin" || reportDirs.length === 0) {
        return "";
    }

    // ReportCrash writes the report asynchronously, so it is usually not on
    // disk yet when the crashed child exits. Wait for it before giving up.
    let reports = [];

    for (let attempt = 0; attempt < 20; attempt += 1) {
        reports = reportDirs.flatMap((reportDir) => {
            return findMacCrashReports(reportDir, productName, startedAt);
        }).sort((left, right) => {
            return right.modifiedAt - left.modifiedAt;
        });

        if (reports.length > 0) {
            break;
        }

        spawnSync("sleep", ["0.5"]);
    }

    if (reports.length === 0) {
        return `No macOS crash report for ${productName} appeared under `
            + `${reportDirs.join(", ")}.`;
    }

    const contents = fs.readFileSync(reports[0].reportPath, "utf8");

    return [
        `Crash report: ${reports[0].reportPath}`,
        summarizeCrashReport(contents)
    ].join("\n");
};


const hasXvfbRun = function() {
    return spawnSync("which", ["xvfb-run"], { stdio: "ignore" }).status === 0;
};


// Headless Linux runners have no X server, and the smoke targets create real
// BrowserWindows, so run the packaged binary under Xvfb when no display is set.
const smokeLaunchCommand = function(executablePath) {
    // CI runners cannot own chrome-sandbox as root, so the setuid sandbox
    // helper refuses to start. The sandbox is irrelevant for this smoke run.
    const electronArgs = process.platform === "linux" ? ["--no-sandbox"] : [];

    if (process.platform !== "linux" || process.env.DISPLAY || !hasXvfbRun()) {
        return { command: executablePath, args: electronArgs };
    }

    return {
        command: "xvfb-run",
        args: [
            "-a",
            "--server-args=-screen 0 1280x1024x24",
            executablePath,
            ...electronArgs
        ]
    };
};


const runSmokeTarget = function(application, product, target, timeoutMs) {
    return new Promise((resolve, reject) => {
        const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-production-"));
        const startedAt = Date.now();
        const launch = smokeLaunchCommand(application.executablePath);
        const child = spawn(launch.command, launch.args, {
            cwd: application.appPath,
            env: Object.assign({}, process.env, {
                DIALOGFORGE_ELECTRON_SMOKE: "1",
                DIALOGFORGE_ELECTRON_SMOKE_TARGET: target,
                DIALOGFORGE_TEST_USER_DATA_PATH: userDataPath
            }),
            stdio: ["ignore", "pipe", "pipe"]
        });
        let stdout = "";
        let stderr = "";
        let settled = false;

        const finish = function(error) {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timeout);
            // Electron helper processes can still be flushing into the
            // temporary user data directory when the main process exits, so
            // retry the cleanup and never fail the smoke run over it.
            try {
                fs.rmSync(userDataPath, {
                    recursive: true,
                    force: true,
                    maxRetries: 10,
                    retryDelay: 200
                });
            } catch (cleanupError) {
                console.warn(
                    `Could not remove temporary user data directory ${userDataPath}: ${cleanupError.message}`
                );
            }

            if (error) {
                reject(error);
                return;
            }

            resolve();
        };

        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("error", finish);
        child.on("exit", (code, signal) => {
            const combined = `${stdout}\n${stderr}`;
            const expectedSmoke = target === "console"
                ? "electron-console"
                : `electron-${target}`;
            const failedStartup = /Uncaught Exception|JavaScript error occurred|Startup Error:/i.test(combined);
            const correctProduct = combined.includes(`\"product\": \"${product.productId}\"`);
            const correctSmoke = combined.includes(`\"smoke\": \"${expectedSmoke}\"`);

            if (code !== 0 || signal || failedStartup || !correctProduct || !correctSmoke) {
                finish(new Error([
                    `Packaged ${product.productName} smoke target "${target}" failed.`,
                    `Exit: ${code === null ? "null" : code}${signal ? ` (${signal})` : ""}`,
                    stdout.trim(),
                    stderr.trim(),
                    signal && process.platform === "darwin"
                        ? checkUnpackedNativeIroh(application)
                        : "",
                    signal ? readMacCrashReport(product.productName, startedAt) : "",
                    signal && process.platform === "darwin"
                        ? captureMacBacktrace(application, target, timeoutMs)
                        : ""
                ].filter(Boolean).join("\n")));
                return;
            }

            console.log(`OK packaged Electron ${target} (${product.productId})`);
            finish();
        });

        const timeout = setTimeout(() => {
            child.kill("SIGKILL");
            finish(new Error([
                `Packaged ${product.productName} smoke target "${target}" timed out.`,
                stdout.trim(),
                stderr.trim()
            ].filter(Boolean).join("\n")));
        }, timeoutMs);
    });
};


const main = async function() {
    const options = readArgs();
    const product = readProduct(options.productPath);
    const application = findPackagedApplication(options.outputDir, product.productName);

    assertProductionLayout(application, options.productPath);
    console.log(`Verifying packaged Electron application: ${application.appPath}`);

    for (const target of options.targets) {
        await runSmokeTarget(application, product, target, options.timeoutMs);
    }
};


main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
});
