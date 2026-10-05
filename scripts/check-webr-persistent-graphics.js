"use strict";

// Actual local WebR/canvas device check. The selected-product shell and native
// httpgd acceptance are separate requirements, not implied by this fixture.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const { build } = require("esbuild");
const {
    readRegressionPackageLibrary,
    regressionPackageLibrarySource,
    serveRegressionPackageLibrary
} = require("./webr-regression-package-library");


const main = async function() {
    const root = path.resolve(__dirname, "..");
    const runtimeRoot = path.join(root, "node_modules/webr/dist");
    const packageLibrary = readRegressionPackageLibrary(root);
    const fixtureBundle = await build({
        stdin: { resolveDir: root, contents: regressionPackageLibrarySource(packageLibrary) },
        bundle: true, platform: "browser", format: "esm", write: false
    });
    const sources = ["runtimeInitialization.R", "runtimePrelude.R", "runtimeBindingInspection.R", "runtimeDiagnostics.R",
        "runtimeEventCore.R", "runtimePromptCore.R", "runtimeGraphicsCore.R"];
    const server = http.createServer(function(request, response) {
        const pathname = new URL(request.url, "http://localhost").pathname;
        if (serveRegressionPackageLibrary(pathname, response, packageLibrary)) {
            return;
        }
        if (pathname === "/package-fixture.js") {
            response.setHeader("Content-Type", "text/javascript");
            response.end(fixtureBundle.outputFiles[0].contents);
            return;
        }
        if (pathname === "/") {
            response.setHeader("Content-Type", "text/html");
            response.end('<!doctype html><title>Disposable WebR graphics acceptance</title><canvas id=plot></canvas><script type="module" src="/package-fixture.js"></script>');
            return;
        }
        const relative = pathname.startsWith("/webr/") ? pathname.slice(6) : "";
        const file = path.resolve(runtimeRoot, relative);
        if (!relative || !file.startsWith(`${runtimeRoot}${path.sep}`) || !fs.existsSync(file)
            || !fs.statSync(file).isFile()) {
            response.writeHead(404);
            response.end();
            return;
        }
        if (/\.(m?js)$/.test(file)) {
            response.setHeader("Content-Type", "text/javascript");
        } else if (file.endsWith(".wasm")) {
            response.setHeader("Content-Type", "application/wasm");
        }
        fs.createReadStream(file).pipe(response);
    });
    let browser;
    let deadline;
    try {
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
        browser = await chromium.launch({ headless: true });
        deadline = setTimeout(() => {
            void browser.close();
        }, 45000);
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => typeof window.mountRegressionPackageLibrary === "function");
        await page.evaluate(async ({ sources, inspectionArchive }) => {
            const { WebR, ChannelType } = await import("/webr/webr.js");
            const runtime = new WebR({ baseUrl: `${location.origin}/webr/`, channelType: ChannelType.PostMessage });
            window.graphicsRuntime = runtime;
            await runtime.init();
            window.graphicsPackageLibraryTimings = await window.mountRegressionPackageLibrary(runtime);
            await runtime.evalRVoid(`${sources[0]}\nruntime_initialize_environment()`);
            await runtime.evalRVoid('dir.create("/tmp/graphics-helper", recursive=TRUE)');
            await runtime.FS.writeFile("/tmp/graphics-helper.tgz", new Uint8Array(inspectionArchive));
            await runtime.evalRVoid('utils::untar("/tmp/graphics-helper.tgz", exdir="/tmp/graphics-helper", tar="internal"); assign("runtime_inspection_library", "/tmp/graphics-helper", envir=as.environment("DialogApp"))');
            for (const source of sources.slice(1)) {
                await runtime.evalRVoid(`eval(parse(text=${JSON.stringify(source)}), envir=as.environment("DialogApp"))`);
            }
            await runtime.evalRVoid('as.environment("DialogApp")$runtime_install_worker_graphics_transport()');
            window.drawCommand = async function(code, parentId) {
                const fence = `fixture-graphics-${parentId}`;
                const completion = JSON.stringify({ type: fence });
                const evaluation = runtime.evalRVoid(`local({
                    rt <- as.environment("DialogApp")
                    previous <- rt$plot_signature()
                    eval(parse(text=${JSON.stringify(code)}), envir=.GlobalEnv)
                    rt$sync_runtime_plot(${JSON.stringify(parentId)}, previous)
                    rt$sync_runtime_plot(${JSON.stringify(parentId)}, previous)
                    webr::eval_js(${JSON.stringify(`globalThis.Module.webr.channel.write(${completion}); null`)})
                })`);
                const evaluationFailure = evaluation.then(function() {
                    // Successful evaluation still waits for its channel fence.
                    return new Promise(function() {});
                });
                let images = 0;
                let colors = { red: 0, blue: 0 };
                for (;;) {
                    const message = await Promise.race([
                        runtime.read(), evaluationFailure
                    ]);
                    if (message.type === fence) {
                        break;
                    }
                    if (message.type !== "dialogforge-graphics") {
                        continue;
                    }
                    for (const image of message.data) {
                        images += 1;
                        const canvas = document.getElementById("plot");
                        canvas.width = image.width;
                        canvas.height = image.height;
                        const context = canvas.getContext("2d");
                        context.drawImage(image, 0, 0);
                        image.close();
                        const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data;
                        colors = { red: 0, blue: 0 };
                        for (let offset = 0; offset < bytes.length; offset += 4) {
                            if (bytes[offset] > 200 && bytes[offset + 1] < 50 && bytes[offset + 2] < 50) {
                                colors.red += 1;
                            }
                            if (bytes[offset + 2] > 200 && bytes[offset] < 50 && bytes[offset + 1] < 50) {
                                colors.blue += 1;
                            }
                        }
                    }
                }
                await evaluation;
                return { images, colors };
            };
        }, {
            sources: sources.map((name) => fs.readFileSync(
                path.join(root, "src/runtime/providers/r/r-sources", name), "utf8"
            )),
            inspectionArchive: Array.from(fs.readFileSync(path.join(root,
                "dist/r-runtime/webr/4.6.0/dialogforgeruntime_0.1.1.tgz")))
        });
        const first = await page.evaluate(() => window.drawCommand(
            'par(mar=c(0,0,0,0)); plot.new(); plot.window(c(0,1),c(0,1),xaxs="i",yaxs="i"); rect(.1,.1,.3,.3,col="red",border=NA)', "first"
        ));
        assert.equal(first.images, 1, "Completion must not publish the same signature twice.");
        assert.ok(first.colors.red > 0);
        const next = await page.evaluate(() => window.drawCommand(
            'drawer <- function() segments(.6,.6,.9,.9,col="blue",lwd=4); drawer()', "indirect"
        ));
        assert.equal(next.images, 1);
        assert.equal(next.colors.red, first.colors.red, "Existing pixels survive delivery and subsequent drawing.");
        assert.ok(next.colors.blue > 0);
        assert.equal((await page.evaluate(() => window.drawCommand("1 + 1", "unchanged"))).images, 0);
        const external = await page.evaluate(() => window.drawCommand(
            'local({dev.off(); pdf(NULL); plot(1:3, main="External PDF device")})',
            "external-reuse"
        ));
        assert.equal(external.images, 0, "A reused device number must not publish a closed canvas.");
        assert.equal(await page.evaluate(() => window.graphicsRuntime.evalRNumber("length(webr::canvas_cache())")), 0);
        const recreated = await page.evaluate(() => window.drawCommand(
            'dev.off(); plot(1:3, main="Identical page")', "recreated"
        ));
        assert.equal(recreated.images, 1);
        const repeated = await page.evaluate(() => window.drawCommand(
            'plot(1:3, main="Identical page")', "identical-new-page"
        ));
        assert.equal(repeated.images, 1, "Identical content on a new page is not an unchanged drawing.");
        const replaced = await page.evaluate(() => window.drawCommand(
            'local({dev.off(); .replacement_canvas <<- webr::canvas(width=720,height=576,capture=TRUE); plot(1:3,main="External same backend")})',
            "same-backend-replacement"
        ));
        assert.equal(replaced.images, 0, "A same-name replacement must not inherit an app registration.");
        assert.equal(await page.evaluate(() => window.graphicsRuntime.evalRNumber("length(webr::canvas_cache())")), 1,
            "Cleanup must preserve the replacement's foreign backing canvas.");
        const ownedAgain = await page.evaluate(() => window.drawCommand(
            'dev.off(); webr::canvas_destroy(.replacement_canvas()); rm(.replacement_canvas); plot(1:3,main="Owned again")',
            "owned-again"
        ));
        assert.equal(ownedAgain.images, 1);
        assert.equal((await page.evaluate(() => window.drawCommand("dev.off()", "closed"))).images, 0);
        assert.equal(await page.evaluate(() => window.graphicsRuntime.evalRNumber("length(webr::canvas_cache())")), 0);
        await page.evaluate(() => window.graphicsRuntime.close());
        await page.close();
    } finally {
        clearTimeout(deadline);
        if (browser) {
            await browser.close();
        }
        await new Promise((resolve) => server.close(resolve));
    }
    console.log("Actual WebR persistent canvas/indirect drawing cases passed; native and selected-product acceptance remain open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
