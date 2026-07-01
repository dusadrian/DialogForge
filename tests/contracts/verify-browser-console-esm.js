"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");
const http = require("http");
const { chromium } = require("playwright");
const serverModule = require("../../scripts/web-dialogr-dev-server");


const request = function(port, pathname) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: "127.0.0.1",
            port,
            path: pathname,
            method: "GET"
        }, (response) => {
            const chunks = [];

            response.on("data", (chunk) => {
                chunks.push(chunk);
            });
            response.on("end", () => {
                resolve({
                    statusCode: response.statusCode,
                    headers: response.headers,
                    body: Buffer.concat(chunks).toString("utf8")
                });
            });
        });

        req.on("error", reject);
        req.end();
    });
};


const listen = function(server) {
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            resolve(server.address().port);
        });
    });
};


const close = function(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
};


(async () => {
    const server = serverModule.createWebDialogRDevServer({
        productPath: "/Users/dusadrian/Documents/GitHub/DialogR"
    });
    const port = await listen(server);
    const browser = await chromium.launch();

    try {
        const coordinator = await request(
            port,
            "/browser-esm/shared/console/renderer/mainConsoleCoordinator.js"
        );

        assert.strictEqual(coordinator.statusCode, 200);
        assert.match(String(coordinator.headers["content-type"]), /javascript/);
        assert.ok(coordinator.body.includes("createMainConsoleCoordinator"));

        const extensionless = await request(
            port,
            "/browser-esm/shared/console/services/consoleSessionState"
        );

        assert.strictEqual(extensionless.statusCode, 200);
        assert.match(String(extensionless.headers["content-type"]), /javascript/);
        assert.ok(extensionless.body.includes("createConsoleSessionState"));

        const page = await browser.newPage();

        await page.goto(`http://127.0.0.1:${port}/`, {
            waitUntil: "domcontentloaded"
        });
        const result = await page.evaluate(async () => {
            const sessionModule = await import(
                "/browser-esm/shared/console/services/consoleSessionState.js"
            );
            const coordinatorModule = await import(
                "/browser-esm/shared/console/renderer/mainConsoleCoordinator.js"
            );
            const session = sessionModule.createConsoleSessionState(() => "ready");

            return {
                prompt: session.getPromptState().inputPrompt,
                phase: session.getSessionPhase(),
                hasCoordinator: typeof coordinatorModule.createMainConsoleCoordinator === "function"
            };
        });

        assert.deepStrictEqual(result, {
            prompt: "> ",
            phase: "ready",
            hasCoordinator: true
        });
    }
    finally {
        await browser.close();
        await close(server);
    }

    console.log("Browser shared-console ESM modules verified.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
