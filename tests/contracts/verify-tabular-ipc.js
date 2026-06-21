"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { invokeTabularRoute, tabularIpcChannels } = require("../../shared/core/ipc/tabularIpc");
const run = async function () {
    const calls = [];
    const transport = {
        invoke: async function (channel, input) {
            calls.push({
                channel,
                input
            });
            return {
                status: "ready"
            };
        }
    };
    await invokeTabularRoute(transport, tabularIpcChannels.writeCell, {
        objectName: "dataset",
        rowIndex: 1,
        columnName: "score",
        value: "42"
    });
    assert.deepStrictEqual(calls, [{
            channel: "base-app:writeCell",
            input: {
                objectName: "dataset",
                rowIndex: 1,
                columnName: "score",
                value: "42"
            }
        }]);
    const rootDir = process.cwd();
    const preloadSource = fs.readFileSync(path.join(rootDir, "shared/base-app/bootstrap/preload.ts"), "utf8");
    const controllerSource = fs.readFileSync(path.join(rootDir, "shared/runtime/tabular-data/tabularIpcController.ts"), "utf8");
    Object.entries(tabularIpcChannels).forEach(([name, channel]) => {
        assert.ok(preloadSource.includes(`tabularIpcChannels.${name}`), "Preload must use the typed tabular route "
            + channel);
        assert.ok(controllerSource.includes(`tabularIpcChannels.${name}`), "Main-process tabular controller must use the typed route "
            + channel);
    });
    console.log("Typed tabular IPC routes verified.");
};
void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
