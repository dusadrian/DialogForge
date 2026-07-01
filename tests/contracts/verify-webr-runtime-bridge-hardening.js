"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");

const {
    createBundledWebRRuntimeBridge
} = require("../../shared/runtime/providers/webr/webRRuntimeBridge");
const {
    webRTransportMethods
} = require("../../shared/runtime/providers/webr/webRTransportMethods");


const createRequest = function(id, method, params) {
    return {
        id,
        method,
        params,
        createdAt: new Date().toISOString()
    };
};


void (async function() {
    let created = 0;
    let initialized = 0;
    let activeOperations = 0;
    let maxActiveOperations = 0;
    const operationOrder = [];
    const bridge = createBundledWebRRuntimeBridge({
        createRuntime: async function() {
            created += 1;

            return {
                init: async function() {
                    initialized += 1;
                    await new Promise((resolve) => setTimeout(resolve, 10));
                },
                close: function() {
                    return;
                },
                evalRVoid: async function(code) {
                    activeOperations += 1;
                    maxActiveOperations = Math.max(maxActiveOperations, activeOperations);
                    operationOrder.push(`start:${code}`);
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    operationOrder.push(`end:${code}`);
                    activeOperations -= 1;
                },
                evalRRaw: async function(code, outputType) {
                    void code;
                    void outputType;

                    return "";
                }
            };
        }
    });

    assert.ok(bridge, "Injected WebR runtime bridge should be created in Node tests.");

    const starts = await Promise.all([
        bridge.start(),
        bridge.start(),
        bridge.start()
    ]);

    assert.deepStrictEqual(starts, [
        "Bundled WebR runtime started.",
        "Bundled WebR runtime started.",
        "Bundled WebR runtime started."
    ]);
    assert.strictEqual(created, 1);
    assert.strictEqual(initialized, 1);
    assert.deepStrictEqual(operationOrder, [
        "start:webr::shim_install()",
        "end:webr::shim_install()"
    ]);

    await Promise.all([
        bridge.sendRequest(createRequest(
            "request-1",
            webRTransportMethods.visibleCommand,
            { text: "first", source: "test" }
        )),
        bridge.sendRequest(createRequest(
            "request-2",
            webRTransportMethods.visibleCommand,
            { text: "second", source: "test" }
        ))
    ]);

    assert.strictEqual(maxActiveOperations, 1);
    assert.deepStrictEqual(operationOrder, [
        "start:webr::shim_install()",
        "end:webr::shim_install()",
        "start:first",
        "end:first",
        "start:second",
        "end:second"
    ]);

    bridge.close();

    console.log("WebR runtime bridge queue and initialization guard verified.");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
