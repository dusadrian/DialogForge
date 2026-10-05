"use strict";

const assert = require("node:assert/strict");
const {
    readConsoleOutputWidth
} = require("../dist/src/console/renderer/consoleOutputWidth");
const {
    createConsoleVisibleCommandController
} = require("../dist/src/console/renderer/consoleVisibleCommandController");
const originalHTMLElement = global.HTMLElement;
global.HTMLElement = class HTMLElement {};

try {
    for (const host of ["electron", "browser"]) {
        for (const [width, padding, glyphWidth, expected] of [
            [900, 20, 100, 86],
            [100, 0, 100, 80],
            [5000, 0, 100, 360],
            [0, 0, 100, null],
            [NaN, 0, 100, null],
            [900, 0, 0, null],
            [900, 0, NaN, null]
        ]) {
            let removed = false;
            let probes = 0;
            const terminal = {
                firstElementChild: null,
                getBoundingClientRect: () => ({ width }),
                appendChild: () => { probes++; }
            };
            const document = {
                getElementById: () => terminal,
                createElement: () => ({
                    style: {},
                    getBoundingClientRect: () => ({ width: glyphWidth }),
                    remove: () => { removed = true; }
                })
            };
            const window = {
                getComputedStyle: () => ({
                    paddingLeft: String(padding),
                    paddingRight: String(padding),
                    fontFamily: "monospace",
                    fontSize: "12px"
                })
            };
            assert.equal(readConsoleOutputWidth(document, window), expected, host);
            const measured = Number.isFinite(width) && width > 0;
            assert.equal(probes, measured ? 1 : 0);
            assert.equal(removed, measured);
        }

        for (const failureAt of ["style", "append", "probe", "remove"]) {
            let removed = false;
            const terminal = {
                getBoundingClientRect: () => ({ width: 900 }),
                appendChild: () => {
                    if (failureAt === "append") {
                        throw new Error("layout append failed");
                    }
                }
            };
            const document = {
                getElementById: () => terminal,
                createElement: () => ({
                    style: {},
                    getBoundingClientRect: () => {
                        if (failureAt === "probe") {
                            throw new Error("glyph measurement failed");
                        }
                        return { width: 100 };
                    },
                    remove: () => {
                        removed = true;
                        if (failureAt === "remove") {
                            throw new Error("layout removal failed");
                        }
                    }
                })
            };
            const window = {
                getComputedStyle: () => {
                    if (failureAt === "style") {
                        throw new Error("style measurement failed");
                    }
                    return { paddingLeft: "0", paddingRight: "0" };
                }
            };
            assert.equal(readConsoleOutputWidth(document, window),
                failureAt === "remove" ? 90 : null, `${host}/${failureAt}`);
            assert.equal(removed, failureAt !== "style");
        }
    }
}
finally {
    if (originalHTMLElement === undefined) {
        delete global.HTMLElement;
    }
    else {
        global.HTMLElement = originalHTMLElement;
    }
}

const checkCommandWidthFallback = async function(host) {
    for (const width of [null, NaN, 0, 92.5, "throw"]) {
        const requests = [];
        const busy = [];
        const history = [];
        const controller = createConsoleVisibleCommandController({
            getSession: () => ({ status: "ready" }),
            startSession: async () => { throw new Error("unexpected startup"); },
            renderStatus() {},
            recordHistory: (text) => history.push(text),
            registerCompletionInput() {},
            setRuntimeBusy: (value) => busy.push(value),
            readOutputWidth: () => {
                if (width === "throw") {
                    throw new Error("width is unavailable");
                }
                return width;
            },
            executeCommand: async (request) => {
                requests.push(request);
                return { status: "ready" };
            }
        });
        const result = await controller.executeWithReceipt("1 + 1", host);
        assert.equal(result.accepted, true, `${host}/${width}`);
        assert.equal(requests.length, 1);
        assert.deepEqual(history, ["1 + 1"]);
        assert.deepEqual(busy, [true, false]);
        assert.equal(requests[0].outputWidth, width === 92.5 ? 93 : undefined);
    }

    const busy = [];
    const controller = createConsoleVisibleCommandController({
        getSession: () => ({ status: "ready" }),
        startSession: async () => { throw new Error("unexpected startup"); },
        renderStatus() {},
        recordHistory() {},
        registerCompletionInput() {},
        setRuntimeBusy: (value) => busy.push(value),
        readOutputWidth: () => { throw new Error("width is unavailable"); },
        executeCommand: async () => { throw new Error("real execution failed"); }
    });
    await assert.rejects(controller.executeWithReceipt("stop('failure')", host),
        /real execution failed/);
    assert.deepEqual(busy, [true, false],
        "Optional measurement failure must not hide the real execution failure.");
};

Promise.all([checkCommandWidthFallback("electron"), checkCommandWidthFallback("browser")])
    .then(() => {
        console.log("Shared console width cases passed; rendered acceptance is separate.");
    }).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
