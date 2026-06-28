"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");

const {
    createBundledWebRRuntimeBridge
} = require("../../shared/runtime/providers/webr/webRRuntimeBridge");
const {
    mountWebRFilesystem
} = require("../../shared/runtime/providers/webr/webRFilesystemMount");


const createRuntime = function(log) {
    return {
        init: async function() {
            log.push(["init"]);
        },
        close: function() {
            log.push(["close"]);
        },
        evalRVoid: async function(code) {
            log.push(["evalRVoid", code]);
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
    const directLog = [];
    const directRuntime = createRuntime(directLog);

    const directResult = await mountWebRFilesystem(directRuntime, {
        kind: "workerfs",
        source: "browser",
        mountpoint: "/uploads/",
        options: {
            blobs: [
                {
                    name: "data.csv",
                    data: new Uint8Array([1, 2, 3])
                }
            ]
        }
    });

    assert.strictEqual(directResult.status, "mounted");
    assert.strictEqual(directResult.mountpoint, "/uploads");
    assert.deepStrictEqual(directLog.map((entry) => entry[0]), [
        "unmount",
        "mkdir",
        "mount"
    ]);
    assert.strictEqual(directLog[2][1], "WORKERFS");

    await assert.rejects(
        () => mountWebRFilesystem(directRuntime, {
            kind: "workerfs",
            source: "browser",
            mountpoint: "relative",
            options: {}
        }),
        /absolute virtual path/
    );

    const bridgeLog = [];
    const bridge = createBundledWebRRuntimeBridge({
        createRuntime: async function() {
            return createRuntime(bridgeLog);
        }
    });

    assert.ok(bridge, "Injected bridge should be available for mount tests.");

    await bridge.start();
    const mounted = await bridge.mountFilesystem({
        kind: "nodefs",
        source: "test",
        mountpoint: "/host",
        root: "/tmp/dialogforge-host"
    });

    assert.strictEqual(mounted.kind, "nodefs");
    assert.deepStrictEqual(bridgeLog, [
        ["init"],
        ["unmount", "/host"],
        ["mkdir", "/host"],
        ["mount", "NODEFS", { root: "/tmp/dialogforge-host" }, "/host"]
    ]);

    console.log("WebR filesystem mount boundary verified.");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
