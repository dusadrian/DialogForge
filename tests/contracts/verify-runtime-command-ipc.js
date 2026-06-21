"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { invokeRuntimeCommandRoute, runtimeCommandIpcChannels } = require("../../shared/core/ipc/runtimeCommandIpc");
const run = async function () {
    const calls = [];
    const transport = {
        invoke: async function (channel, input) {
            calls.push({
                channel,
                input
            });
            return [];
        }
    };
    await invokeRuntimeCommandRoute(transport, runtimeCommandIpcChannels.executeVisible, {
        code: "1 + 1",
        source: "test"
    });
    assert.deepStrictEqual(calls, [{
            channel: "base-app:executeVisibleCommand",
            input: {
                code: "1 + 1",
                source: "test"
            }
        }]);
    const rootDir = process.cwd();
    const preloadSource = fs.readFileSync(path.join(rootDir, "shared/base-app/bootstrap/preload.ts"), "utf8");
    const controllerSource = fs.readFileSync(path.join(rootDir, "shared/runtime/session/runtimeSessionIpcController.ts"), "utf8");
    Object.entries(runtimeCommandIpcChannels).forEach(([name, channel]) => {
        assert.ok(preloadSource.includes(`runtimeCommandIpcChannels.${name}`), "Preload must use the typed runtime command route "
            + channel);
        assert.ok(controllerSource.includes(`runtimeCommandIpcChannels.${name}`), "Main-process runtime controller must use the typed route "
            + channel);
    });
    console.log("Typed runtime command IPC routes verified.");
};
void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
