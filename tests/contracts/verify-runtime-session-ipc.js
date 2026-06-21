"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { invokeRuntimeSessionRoute, runtimeSessionIpcChannels } = require("../../shared/core/ipc/runtimeSessionIpc");
const calls = [];
const transport = {
    invoke: async function (channel, ...args) {
        calls.push({
            channel,
            args
        });
        return {
            providerId: "r",
            status: "ready",
            connection: "runtime-control",
            message: "ready"
        };
    }
};
const run = async function () {
    await invokeRuntimeSessionRoute(transport, runtimeSessionIpcChannels.get);
    await invokeRuntimeSessionRoute(transport, runtimeSessionIpcChannels.restart, {
        action: "restore"
    });
    assert.deepStrictEqual(calls, [
        {
            channel: "base-app:getRuntimeSession",
            args: []
        },
        {
            channel: "base-app:restartRuntime",
            args: [{
                    action: "restore"
                }]
        }
    ]);
    const rootDir = process.cwd();
    const preloadSource = fs.readFileSync(path.join(rootDir, "shared/base-app/bootstrap/preload.ts"), "utf8");
    const sessionControllerSource = fs.readFileSync(path.join(rootDir, "shared/runtime/session/runtimeSessionIpcController.ts"), "utf8");
    const packageControllerSource = fs.readFileSync(path.join(rootDir, "shared/runtime/providers/r/dependencies/packageInstallIpcController.ts"), "utf8");
    Object.values(runtimeSessionIpcChannels).forEach((channel) => {
        assert.ok(!preloadSource.includes(`ipcRenderer.invoke("${channel}"`), "Preload must use typed runtime-session routes for "
            + channel);
    });
    assert.ok(sessionControllerSource.includes("runtimeSessionIpcChannels.get"));
    assert.ok(sessionControllerSource.includes("runtimeSessionIpcChannels.start"));
    assert.ok(sessionControllerSource.includes("runtimeSessionIpcChannels.stop"));
    assert.ok(packageControllerSource.includes("runtimeSessionIpcChannels.restart"));
    assert.ok(packageControllerSource.includes("runtimeSessionIpcChannels.restartForPackages"));
    console.log("Typed runtime-session IPC routes verified.");
};
void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
