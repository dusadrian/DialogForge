"use strict";

const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn, spawnSync } = require("child_process");


const rootDir = path.resolve(__dirname, "..");


const readArgs = function() {
    const options = {
        productPath: "",
        webDist: "",
        build: false,
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
        if (current === "--web-dist") {
            index += 1;
            options.webDist = path.resolve(args[index] || "");
            continue;
        }
        if (current === "--build") {
            options.build = true;
            continue;
        }
        if (current === "--timeout-ms") {
            index += 1;
            options.timeoutMs = Number(args[index] || options.timeoutMs);
            continue;
        }

        throw new Error(`Unknown production web verification argument: ${current}`);
    }

    if (!options.productPath) {
        throw new Error("Missing required --product-path argument.");
    }

    options.webDist = options.webDist || path.join(options.productPath, "dist", "web");

    return options;
};


const readProduct = function(productPath) {
    const packagePath = path.join(productPath, "package.json");

    if (!fs.existsSync(packagePath)) {
        throw new Error(`Product package.json was not found: ${packagePath}`);
    }

    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const productId = String(packageJson.product?.id || "").trim();

    if (!productId) {
        throw new Error(`Product id is required in ${packagePath}`);
    }

    return { productId };
};


const runBuild = function(options) {
    const localBinPath = path.join(rootDir, "node_modules", ".bin");
    const currentPath = String(process.env.PATH || "");
    const result = spawnSync(process.execPath, [
        path.join(rootDir, "scripts", "build-web.js"),
        "--out-dir",
        options.webDist,
        options.productPath
    ], {
        cwd: rootDir,
        env: Object.assign({}, process.env, {
            DIALOGFORGE_WEB_PRODUCT_PATH: options.productPath,
            PATH: [localBinPath, currentPath].filter(Boolean).join(path.delimiter)
        }),
        stdio: "inherit"
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`Production web build failed with exit code ${result.status}`);
    }
};


const findOpenPort = function() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;

            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(port);
            });
        });
    });
};


const fetchStatus = function(url) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, (response) => {
            response.resume();
            response.on("end", () => {
                resolve(response.statusCode || 0);
            });
        });

        request.on("error", reject);
        request.setTimeout(3000, () => {
            request.destroy(new Error(`Timed out while fetching ${url}`));
        });
    });
};


const waitForServer = async function(url, child, timeoutMs) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
        if (child.exitCode !== null) {
            throw new Error(`Production web server exited with code ${child.exitCode}`);
        }

        try {
            if (await fetchStatus(url) === 200) {
                return;
            }
        }
        catch {}

        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });
    }

    throw new Error(`Timed out waiting for production web server at ${url}`);
};


const startServer = function(options, port) {
    const serverScript = path.join(options.webDist, "scripts", "web-product-dev-server.js");

    if (!fs.existsSync(serverScript)) {
        throw new Error(
            `Built production web server was not found: ${serverScript}. `
            + "Run with --build or build the product web artifact first."
        );
    }

    return spawn(process.execPath, [
        serverScript,
        "--product-path",
        options.productPath,
        "--host",
        "127.0.0.1",
        "--port",
        String(port)
    ], {
        cwd: options.webDist,
        env: Object.assign({}, process.env, {
            DIALOGFORGE_SOURCE_ROOT: rootDir,
            DIALOGFORGE_DIST_DIR: options.webDist,
            DIALOGFORGE_WEB_PRODUCT_PATH: options.productPath
        }),
        stdio: ["ignore", "pipe", "pipe"]
    });
};


const verifyRenderedHelp = async function(options, product, port) {
    const { chromium } = require("playwright");
    const host = `${product.productId.toLowerCase()}.production.test`;
    const baseUrl = `http://${host}:${port}`;
    const browser = await chromium.launch({
        args: [
            `--host-resolver-rules=MAP ${host} 127.0.0.1`,
            `--unsafely-treat-insecure-origin-as-secure=${baseUrl}`
        ]
    });
    const page = await browser.newPage();
    const failures = [];

    page.on("pageerror", (error) => {
        failures.push(`pageerror: ${error.message}`);
    });
    page.on("console", (message) => {
        if (message.type() === "error") {
            failures.push(`console: ${message.text()}`);
        }
    });
    page.on("response", (response) => {
        if (response.status() >= 400) {
            failures.push(`HTTP ${response.status()}: ${response.url()}`);
        }
    });
    page.on("requestfailed", (request) => {
        failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ""}`);
    });

    try {
        await page.goto(baseUrl, {
            waitUntil: "domcontentloaded",
            timeout: options.timeoutMs
        });

        const crossOriginIsolated = await page.evaluate(() => {
            return window.crossOriginIsolated === true;
        });

        if (!crossOriginIsolated) {
            throw new Error("Production web page is not cross-origin isolated.");
        }

        const compositionJson = await page.evaluate(async () => {
            const response = await fetch("/api/composition");

            if (!response.ok) {
                throw new Error(`/api/composition returned HTTP ${response.status}`);
            }

            return response.json();
        });

        if (compositionJson.product?.id !== product.productId) {
            throw new Error(
                `Production web composition selected ${compositionJson.product?.id || "<none>"}; `
                + `expected ${product.productId}`
            );
        }
        if (compositionJson.runtime?.id !== "webr") {
            throw new Error(
                `Production web composition selected runtime ${compositionJson.runtime?.id || "<none>"}; `
                + "expected webr"
            );
        }

        await page.waitForFunction(() => {
            const input = document.getElementById("visibleCommandInput");
            return Boolean(
                input
                && input.dialogForgeConsoleInputView?.setText
                && input.dialogForgeConsoleInputView?.submit
            );
        }, null, { timeout: options.timeoutMs });

        try {
            await page.waitForFunction(() => {
                const message = document.getElementById("consoleCoverMessage")?.textContent || "";

                return message.includes("WebR ready")
                    && !document.body.classList.contains("console-cover-visible");
            }, null, { timeout: options.timeoutMs });
        }
        catch (error) {
            const statusText = await page.locator("#consoleCoverMessage").innerText().catch(() => "");

            throw new Error([
                error instanceof Error ? error.message : String(error),
                `WebR startup status: ${statusText}`,
                `Browser failures: ${failures.join("\n") || "<none>"}`
            ].join("\n"));
        }

        await page.evaluate(async () => {
            const input = document.getElementById("visibleCommandInput");

            input.dialogForgeConsoleInputView.setText("?print");
            await input.dialogForgeConsoleInputView.submit();
        });

        const helpFrame = page.frameLocator(".dialogforge-web-help-frame");
        const helpDocument = helpFrame.frameLocator("#helpFrame");
        const body = helpDocument.locator("body");

        try {
            await page.waitForFunction(() => {
                const outerFrame = document.querySelector(".dialogforge-web-help-frame");
                const helpPage = outerFrame?.contentDocument;
                const documentFrame = helpPage?.getElementById("helpFrame");
                const text = documentFrame?.contentDocument?.body?.innerText || "";

                return text.includes("Print Values");
            }, null, { timeout: options.timeoutMs });
        }
        catch (error) {
            const frameDiagnostics = await Promise.all(page.frames().map(async (frame) => {
                return {
                    url: frame.url(),
                    text: (await frame.locator("body").innerText().catch(() => "")).slice(0, 800)
                };
            }));
            const consoleText = await page.locator("#consoleTerminal").innerText().catch(() => "");
            const statusText = await page.locator("#consoleCoverMessage").innerText().catch(() => "");

            throw new Error([
                error instanceof Error ? error.message : String(error),
                `Console status: ${statusText}`,
                `Console transcript: ${consoleText.slice(-1200)}`,
                `Frames: ${JSON.stringify(frameDiagnostics, null, 4)}`,
                `Browser failures: ${failures.join("\n") || "<none>"}`
            ].join("\n"));
        }

        const helpText = await body.innerText();

        if (/Unable to load help page|HTTP 404/i.test(helpText)) {
            throw new Error(`Production web help reported a load failure: ${helpText.slice(0, 500)}`);
        }
        if (failures.length > 0) {
            throw new Error(`Production web browser errors:\n${failures.join("\n")}`);
        }

        console.log(`OK production web ?print help (${product.productId}) at ${baseUrl}`);
    }
    finally {
        await browser.close();
    }
};


const stopServer = function(child) {
    if (child.exitCode === null) {
        child.kill("SIGTERM");
    }
};


const main = async function() {
    const options = readArgs();
    const product = readProduct(options.productPath);

    if (options.build) {
        runBuild(options);
    }

    const port = await findOpenPort();
    const server = startServer(options, port);
    let serverOutput = "";

    server.stdout.on("data", (chunk) => {
        serverOutput += chunk.toString();
    });
    server.stderr.on("data", (chunk) => {
        serverOutput += chunk.toString();
    });

    try {
        await waitForServer(`http://127.0.0.1:${port}/`, server, 30000);
        await verifyRenderedHelp(options, product, port);
    }
    catch (error) {
        const message = error instanceof Error ? error.stack || error.message : String(error);

        throw new Error(`${message}\nProduction web server output:\n${serverOutput.trim()}`);
    }
    finally {
        stopServer(server);
    }
};


main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
});
