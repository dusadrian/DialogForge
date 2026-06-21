"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { invokeWorkspaceRoute, workspaceIpcChannels } = require("../../shared/core/ipc/workspaceIpc");
const run = async function () {
    const calls = [];
    const transport = {
        invoke: async function (channel, ...args) {
            calls.push({
                channel,
                args
            });
            return {
                status: "ready"
            };
        }
    };
    await invokeWorkspaceRoute(transport, workspaceIpcChannels.refresh);
    await invokeWorkspaceRoute(transport, workspaceIpcChannels.renameObject, {
        oldName: "oldData",
        newName: "newData",
        source: "test"
    });
    assert.deepStrictEqual(calls, [
        {
            channel: "base-app:refreshWorkspace",
            args: []
        },
        {
            channel: "base-app:renameWorkspaceObject",
            args: [{
                    oldName: "oldData",
                    newName: "newData",
                    source: "test"
                }]
        }
    ]);
    const rootDir = process.cwd();
    const preloadSource = fs.readFileSync(path.join(rootDir, "shared/base-app/bootstrap/preload.ts"), "utf8");
    const controllerSource = fs.readFileSync(path.join(rootDir, "shared/runtime/session/runtimeSessionIpcController.ts"), "utf8");
    Object.entries(workspaceIpcChannels).forEach(([name, channel]) => {
        assert.ok(preloadSource.includes(`workspaceIpcChannels.${name}`), "Preload must use the typed workspace route "
            + channel);
        assert.ok(controllerSource.includes(`workspaceIpcChannels.${name}`), "Main-process workspace controller must use the typed route "
            + channel);
    });
    console.log("Typed workspace IPC routes verified.");
};
void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
