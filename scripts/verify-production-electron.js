"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");


const rootDir = path.resolve(__dirname, "..");


const readArgs = function() {
    const options = {
        productPath: "",
        outputDir: "",
        targets: ["console", "help"],
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
        const executablePath = path.join(appPath, productName);

        if (fs.existsSync(executablePath)) {
            return {
                appPath,
                executablePath,
                resourcesPath: path.join(appPath, "resources")
            };
        }
    }

    throw new Error(
        `No unpacked ${productName} production application was found under ${outputDir}`
    );
};


const assertProductionLayout = function(application) {
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
};


const runSmokeTarget = function(application, product, target, timeoutMs) {
    return new Promise((resolve, reject) => {
        const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-production-"));
        const child = spawn(application.executablePath, [], {
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
            fs.rmSync(userDataPath, { recursive: true, force: true });

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
                    stderr.trim()
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

    assertProductionLayout(application);
    console.log(`Verifying packaged Electron application: ${application.appPath}`);

    for (const target of options.targets) {
        await runSmokeTarget(application, product, target, options.timeoutMs);
    }
};


main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
});
