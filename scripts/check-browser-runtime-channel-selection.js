"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
    createBrowserWebRRuntime, signalBrowserWebRInterrupt
} = require("../dist/src/runtime/providers/webr/webRBrowserRuntime");
const { createBrowserWebRSession } = require("../dist/src/runtime/providers/webr/webRBrowserSession");

const main = async function() {
    const received = [];
    let signals = 0;
    class WebR {
        constructor(options) {
            received.push(options);
        }
        interrupt() { signals++; }
    }
    const importWebRModule = async () => ({
        WebR,
        ChannelType: { Automatic: 0, SharedArrayBuffer: 1, PostMessage: 3 }
    });

    const args = ["--no-save", "--no-restore"];
    const interruptible = await createBrowserWebRRuntime({
        importWebRModule,
        baseUrl: "/webr/",
        homedir: "/home/DialogR",
        rArgs: args
    });
    assert.deepEqual(received[0], {
        baseUrl: "/webr/", homedir: "/home/DialogR", RArgs: args
    });
    assert.notEqual(received[0].RArgs, args);
    assert.equal(Object.hasOwn(received[0], "channelType"), false,
        "the SDK must select the available physical channel, not force PostMessage");

    await createBrowserWebRRuntime({ importWebRModule });
    assert.deepEqual(received[1], {});
    assert.equal(signalBrowserWebRInterrupt(interruptible), true);
    assert.equal(signals, 1);
    let current = true;
    const session = createBrowserWebRSession({
        runtime: interruptible, isCurrentSession: () => current,
        runtimeControlClient: { execute: async () => { throw new Error("A physical signal must not queue an R request"); } },
        visibleCommands: { readConsoleOutputWidth: () => 120, recordTranscriptEvents() {} },
        workspaceChanged: async () => {}
    });
    const delivered = await session.runtimeSessionManager.executeRuntimeMethod({ method: "runtime.interrupt", params: {} });
    assert.equal(delivered.status, "ready", "The browser session uses the SAME R extension controller");
    assert.match(delivered.message, /WebR worker accepted/);
    assert.ok(!delivered.message.includes("SIGINT"), "Worker delivery is not a native OS signal");
    assert.equal(signals, 2);
    current = false;
    const retired = await session.runtimeSessionManager.executeRuntimeMethod({ method: "runtime.interrupt", params: {} });
    assert.equal(retired.status, "unavailable");
    assert.equal(signals, 2, "A retired browser session cannot signal its old worker");
    assert.equal(signalBrowserWebRInterrupt({ interrupt() { signals++; } }), null,
        "An untracked SDK channel cannot be assumed to support Interrupt");
    const sharedMemory = Object.getOwnPropertyDescriptor(globalThis, "SharedArrayBuffer");
    try {
        Object.defineProperty(globalThis, "SharedArrayBuffer", { configurable: true, value: undefined });
        const unsupported = await createBrowserWebRRuntime({ importWebRModule });
        assert.equal(signalBrowserWebRInterrupt(unsupported), null,
            "PostMessage's void/log-only interrupt must not be acknowledged as accepted");
        assert.equal(signals, 2, "Unsupported physical channels must not receive a fake-success signal");
    } finally {
        Object.defineProperty(globalThis, "SharedArrayBuffer", sharedMemory);
    }

    // Blocking reads must use the public R console interface, not eval_js's
    // error translator. Physical compiled-console/input tests cover that call.
    const source = fs.readFileSync(
        "src/runtime/providers/r/r-sources/runtimeWorkerPromptTransport.R", "utf8"
    );
    assert.ok(source.includes("read_console_line(prompt, host_transport = TRUE)"));
    assert.ok(!source.includes("module.webr.readConsole()"));
    assert.ok(source.includes("runtime_install_console_input_scope()"));
    assert.ok(source.includes("read_console_line <- runtime_console_input_reader"));
    const core = fs.readFileSync("src/runtime/providers/r/r-sources/runtimePromptCore.R", "utf8");
    assert.ok(core.includes('getNamespaceVersion(namespace)), "0.0.4"'));
    console.log("Browser runtime preserves SDK channel negotiation and host paths/arguments.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
