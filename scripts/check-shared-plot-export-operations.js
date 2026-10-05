const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const {
    copyPlotThroughHost,
    readPlotExportResource,
    savePlotThroughHost
} = require("../dist/src/base-app/features/plot-viewer/plotExportOperations");
const {
    createPlotDownloadController
} = require("../dist/src/shell-electron/external/plotDownloadController");
const {
    plotExternalIpcChannels
} = require("../dist/src/base-app/features/plot-viewer/plotExternalIpc");


// Load the real compiled host binding, replacing only its physical operations.
// These fixtures do not open pickers, write files or inspect/change a clipboard.
const loadPlotExportBinding = function(relativePath, replacements, globals = {}) {
    const filePath = path.resolve(__dirname, relativePath);
    const bindingRequire = createRequire(filePath);
    const binding = { exports: {} };

    vm.runInNewContext(fs.readFileSync(filePath, "utf8"), {
        ...globals,
        module: binding,
        exports: binding.exports,
        Buffer,
        Uint8Array,
        Blob,
        DOMException,
        require: function(name) {
            if (Object.hasOwn(replacements, name)) {
                return replacements[name];
            }

            return bindingRequire(name);
        }
    }, { filename: filePath });

    return binding.exports;
};


const createPlotExportResourceFixture = function(scenario, operations) {
    return {
        loadBuffer: async function(url, options) {
            operations.push("read");
            assert.equal(url, "https://plot-acceptance.invalid/plot");
            assert.equal(options.redirect, "follow");

            if (scenario.readFailure) {
                throw new Error("plot read failed");
            }

            return {
                ok: !scenario.httpFailure,
                status: scenario.httpFailure ? 404 : 200,
                body: new Uint8Array([1, 2, 3]),
                contentType: "image/png"
            };
        }
    };
};


const createNativePlotExportFixture = function(scenario) {
    const operations = [];
    const routes = new Map();
    const resourceClient = createPlotExportResourceFixture(scenario, operations);
    const binding = loadPlotExportBinding(
        "../dist/src/shell-electron/external/plotExternalIpcController.js",
        {
            fs: {
                promises: {
                    writeFile: async function(filePath, bytes) {
                        operations.push("write");
                        assert.equal(filePath, "/fixture/plot.png");
                        assert.deepEqual([...bytes], [1, 2, 3]);

                        if (scenario.writeFailure) {
                            throw new Error("plot write failed");
                        }

                        if (scenario.writeBarrier) {
                            await scenario.writeBarrier;
                        }
                    }
                }
            },
            electron: {
                nativeImage: {
                    createFromBuffer: function(bytes) {
                        assert.deepEqual([...bytes], [1, 2, 3]);
                        return { isEmpty: () => scenario.invalidImage === true };
                    }
                }
            }
        }
    );

    binding.createPlotExternalIpcController({
        ipcMain: {
            handle: function(channel, handler) {
                routes.set(channel, handler);
            }
        },
        shell: {},
        dialog: {
            showSaveDialog: async function(options) {
                operations.push("picker");
                assert.equal(options.title, "Save Plot as PNG");
                assert.equal(options.filters[0].name, "PNG Image");
                assert.deepEqual([...options.filters[0].extensions], ["png"]);

                if (scenario.pickerFailure) {
                    throw new Error("plot picker failed");
                }

                return {
                    canceled: scenario.cancel === true,
                    filePath: scenario.cancel ? "" : "/fixture/plot"
                };
            }
        },
        clipboard: {
            writeImage: function() {
                operations.push("copy");

                if (scenario.copyFailure) {
                    throw new Error("plot copy failed");
                }
            }
        },
        downloadsPath: "/fixture",
        plotViewerController: { getWindow: () => null },
        plotDownloadController: createPlotDownloadController({ resourceClient })
    });

    return {
        operations,
        save: function() {
            return routes.get(plotExternalIpcChannels.savePlot)(null, {
                url: "https://plot-acceptance.invalid/plot", format: "png"
            });
        },
        copy: function() {
            return routes.get(plotExternalIpcChannels.copyPlot)(
                null, "https://plot-acceptance.invalid/plot"
            );
        }
    };
};


const createBrowserPlotExportFixture = function(scenario) {
    const operations = [];
    const resourceClient = createPlotExportResourceFixture(scenario, operations);
    const binding = loadPlotExportBinding(
        "../dist/src/shell-web/browserPlotAdapter.js",
        {
            "../core/host/browserResourceClient": {
                createBrowserResourceClient: () => resourceClient
            }
        },
        {
            ClipboardItem: class {
                constructor(items) {
                    assert.equal(items["image/png"].size, 3);
                }
            },
            navigator: {
                clipboard: {
                    write: async function() {
                        operations.push("copy");

                        if (scenario.copyFailure) {
                            throw new Error("plot copy failed");
                        }
                    }
                }
            }
        }
    );
    const windowRef = {
        showSaveFilePicker: async function() {
            operations.push("picker");

            if (scenario.cancel) {
                throw new DOMException("plot picker canceled", "AbortError");
            }
            if (scenario.pickerFailure) {
                throw new Error("plot picker failed");
            }

            return {
                name: "plot.png",
                createWritable: async function() {
                    return {
                        write: async function(blob) {
                            operations.push("write");
                            const bytes = new Uint8Array(await blob.arrayBuffer());
                            assert.deepEqual([...bytes], [1, 2, 3]);

                            if (scenario.writeFailure) {
                                throw new Error("plot write failed");
                            }

                            if (scenario.writeBarrier) {
                                await scenario.writeBarrier;
                            }
                        },
                        close: async function() {
                            operations.push("close");

                            if (scenario.closeFailure) {
                                throw new Error("plot close failed");
                            }
                        }
                    };
                }
            };
        }
    };

    return {
        operations,
        save: function() {
            return binding.saveBrowserPlot({
                url: "https://plot-acceptance.invalid/plot", format: "png"
            }, windowRef, {});
        },
        copy: function() {
            return binding.copyBrowserPlot("https://plot-acceptance.invalid/plot");
        },
        saveWithoutPicker: function(documentRef) {
            return binding.saveBrowserPlot({
                url: "https://plot-acceptance.invalid/plot", format: "png", index: 2
            }, {}, documentRef);
        }
    };
};


const checkPlotExportOperations = async function() {
    const body = new Uint8Array([1, 2, 3]);
    const resource = { ok: true, status: 200, body, contentType: "image/png" };
    const client = {
        async loadBuffer(url, options) {
            assert.equal(url, "fixture:plot");
            assert.equal(options.redirect, "follow");
            return resource;
        }
    };
    assert.equal(await readPlotExportResource(client, "fixture:plot"), resource);
    resource.ok = false;
    resource.status = 404;
    let failedWrites = 0;
    const failedDownload = await savePlotThroughHost(async () => {
        await readPlotExportResource(client, "fixture:plot");
        failedWrites += 1;
        return "plot.png";
    });
    assert.equal(failedDownload.status, "failed");
    assert.equal(failedDownload.message, "plot-download-http-404");
    assert.equal(failedWrites, 0);
    assert.equal((await copyPlotThroughHost(async () => {
        await readPlotExportResource(client, "fixture:plot");
    })).status, "failed");

    let writes = 0;
    const saved = await savePlotThroughHost(async () => {
        writes += 1;

        return "plot.png";
    });

    assert.equal(saved.status, "saved");
    assert.equal(saved.filePath, "plot.png");
    assert.equal(writes, 1);
    assert.equal((await savePlotThroughHost(async () => null)).status, "canceled");
    const requested = await savePlotThroughHost(async () => ({ status: "requested" }));
    assert.equal(requested.status, "requested");
    assert.equal(requested.filePath, "");
    assert.match(requested.message, /completion cannot be confirmed/);

    const aborted = new Error("picker canceled");
    const canceled = await savePlotThroughHost(async () => {
        throw aborted;
    }, error => error === aborted);

    assert.equal(canceled.status, "canceled");

    for (const message of ["picker failed", "download failed", "write failed", "close failed"]) {
        const failed = await savePlotThroughHost(async () => {
            throw new Error(message);
        });

        assert.equal(failed.status, "failed");
        assert.equal(failed.message, message);
        assert.equal(failed.filePath, "");
    }

    let copied = false;
    assert.equal((await copyPlotThroughHost(async () => {
        copied = true;
    })).status, "copied");
    assert.equal(copied, true);

    const failedCopy = await copyPlotThroughHost(async () => {
        throw new Error("clipboard unavailable");
    });

    assert.equal(failedCopy.status, "failed");
    assert.equal(failedCopy.message, "clipboard unavailable");
};


const checkPlotHostExportReceipts = async function() {
    const hosts = [
        { name: "native IPC", create: createNativePlotExportFixture },
        { name: "browser", create: createBrowserPlotExportFixture }
    ];
    const saveCases = [
        { name: "saved", scenario: {}, status: "saved", steps: ["picker", "read", "write"] },
        { name: "canceled", scenario: { cancel: true }, status: "canceled", steps: ["picker"] },
        {
            name: "picker failure", scenario: { pickerFailure: true },
            status: "failed", message: "plot picker failed", steps: ["picker"]
        },
        {
            name: "HTTP failure", scenario: { httpFailure: true },
            status: "failed", message: "plot-download-http-404", steps: ["picker", "read"]
        },
        {
            name: "read failure", scenario: { readFailure: true },
            status: "failed", message: "plot read failed", steps: ["picker", "read"]
        },
        {
            name: "write failure", scenario: { writeFailure: true },
            status: "failed", message: "plot write failed", steps: ["picker", "read", "write"]
        }
    ];

    for (const host of hosts) {
        for (const item of saveCases) {
            const fixture = host.create(item.scenario);
            const result = await fixture.save();
            const label = host.name + ": " + item.name;

            assert.equal(result.status, item.status, label);
            assert.deepEqual(
                fixture.operations.filter(step => step !== "close"), item.steps, label
            );

            if (item.status !== "saved") {
                assert.equal(result.filePath, "", label + " must not claim a saved file");
            }
            if (item.message) {
                assert.equal(result.message, item.message, label);
            }
            if (host.name === "browser" && item.steps.includes("write")) {
                assert.equal(fixture.operations.at(-1), "close",
                    label + " closes the writable even when writing fails");
            }
        }

        for (const item of [
            { scenario: {}, status: "copied", steps: ["read", "copy"] },
            { scenario: { httpFailure: true }, status: "failed", steps: ["read"] },
            { scenario: { readFailure: true }, status: "failed", steps: ["read"] },
            { scenario: { copyFailure: true }, status: "failed", steps: ["read", "copy"] }
        ]) {
            const fixture = host.create(item.scenario);
            const result = await fixture.copy();

            assert.equal(result.status, item.status, host.name + ": Copy receipt");
            assert.deepEqual(fixture.operations, item.steps,
                host.name + ": rejected resources cannot reach the clipboard");
        }

        let finishWrite;
        const writeBarrier = new Promise(resolve => {
            finishWrite = resolve;
        });
        const pendingFixture = host.create({ writeBarrier });
        let settled = false;
        const pendingSave = pendingFixture.save().then(result => {
            settled = true;
            return result;
        });

        await new Promise(resolve => setImmediate(resolve));
        assert.ok(pendingFixture.operations.includes("write"));
        assert.equal(settled, false, host.name + ": an unfinished write is not saved");
        finishWrite();
        assert.equal((await pendingSave).status, "saved");
    }

    const invalidImage = createNativePlotExportFixture({ invalidImage: true });
    assert.equal((await invalidImage.copy()).status, "failed");
    assert.deepEqual(invalidImage.operations, ["read"],
        "Native image decoding rejection cannot write the clipboard");

    const failedClose = createBrowserPlotExportFixture({ closeFailure: true });
    const closeResult = await failedClose.save();
    assert.equal(closeResult.status, "failed");
    assert.equal(closeResult.filePath, "");
    assert.equal(closeResult.message, "plot close failed");
    assert.deepEqual(failedClose.operations, ["picker", "read", "write", "close"]);

    const downloads = [];
    const fallback = createBrowserPlotExportFixture({});
    const requested = await fallback.saveWithoutPicker({
        createElement: function(tag) {
            assert.equal(tag, "a");
            return {
                click: function() {
                    downloads.push({ url: this.href, name: this.download });
                    fallback.operations.push("download-request");
                },
                remove: function() {
                    fallback.operations.push("remove-link");
                }
            };
        },
        body: {
            appendChild: function() {
                fallback.operations.push("append-link");
            }
        }
    });

    assert.equal(requested.status, "requested");
    assert.equal(requested.filePath, "");
    assert.match(requested.message, /completion cannot be confirmed/);
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].url, "https://plot-acceptance.invalid/plot");
    assert.equal(downloads[0].name, "plot-3.png");
    assert.deepEqual(fallback.operations, ["append-link", "download-request", "remove-link"],
        "No-picker fallback reports a request, not a completed file write");
};


checkPlotExportOperations().then(checkPlotHostExportReceipts).then(() => {
    console.log("Shared export and actual host-binding receipt cases passed; physical/rendered acceptance remains separate.");
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
