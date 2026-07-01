"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");

const {
    createBundledWebRRuntimeBridge
} = require("../../shared/runtime/providers/webr/webRRuntimeBridge");
const {
    getRuntimeProvider
} = require("../../shared/runtime/providers/runtimeProviderRegistry");


const createRuntime = function(log, failCommand = "") {
    return {
        init: async function() {
            log.push(["init"]);
        },
        close: function() {
            log.push(["close"]);
        },
        evalRVoid: async function(code) {
            log.push(["evalRVoid", code]);

            if (code === failCommand) {
                throw new Error("bootstrap failed");
            }
        },
        evalRRaw: async function() {
            return "";
        },
        FS: {
            unmount: async function(mountpoint) {
                log.push(["unmount", mountpoint]);
            },
            mkdir: async function(mountpoint) {
                log.push(["mkdir", mountpoint]);
            },
            mount: async function(type, options, mountpoint) {
                log.push(["mount", type, options, mountpoint]);
            }
        }
    };
};


void (async function() {
    const log = [];
    const bridge = createBundledWebRRuntimeBridge({
        createRuntime: async function() {
            return createRuntime(log);
        },
        bootstrap: {
            mounts: [
                {
                    kind: "nodefs",
                    source: "test",
                    mountpoint: "/app",
                    root: "/tmp/dialogforge-app"
                }
            ],
            sourceFiles: ["/app/runtime.R"],
            commands: [".libPaths(c(.libPaths(), '/app/library'))"]
        }
    });

    assert.ok(bridge);

    await bridge.start();

    assert.deepStrictEqual(log, [
        ["init"],
        ["unmount", "/app"],
        ["mkdir", "/app"],
        ["mount", "NODEFS", { root: "/tmp/dialogforge-app" }, "/app"],
        ["evalRVoid", "webr::shim_install()"],
        ["evalRVoid", "source(\"/app/runtime.R\")"],
        ["evalRVoid", ".libPaths(c(.libPaths(), '/app/library'))"]
    ]);
    assert.strictEqual(bridge.getBootstrapResult().packageInstallShim, true);
    assert.deepStrictEqual(bridge.getBootstrapResult().sourceFiles, ["/app/runtime.R"]);
    assert.deepStrictEqual(bridge.getBootstrapResult().commands, [
        ".libPaths(c(.libPaths(), '/app/library'))"
    ]);

    const provider = getRuntimeProvider("webr", {
        runtimeBootstrap: {
            sourceFiles: ["/product/startup.R"]
        }
    });

    assert.ok(provider.transportController);

    let attempts = 0;
    const failingBridge = createBundledWebRRuntimeBridge({
        createRuntime: async function() {
            attempts += 1;
            return createRuntime([], "stop('broken')");
        },
        bootstrap: {
            commands: ["stop('broken')"]
        }
    });

    assert.ok(failingBridge);
    await assert.rejects(() => failingBridge.start(), /bootstrap failed/);
    await assert.rejects(() => failingBridge.start(), /bootstrap failed/);
    assert.strictEqual(attempts, 2);

    console.log("WebR bootstrap hook verified.");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
