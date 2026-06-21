"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createRuntimeRestartController } = require("../../shared/shell-electron/lifecycle/runtimeRestartController");
const readySnapshot = {
    providerId: "r",
    status: "ready",
    connection: "runtime-control",
    message: "ready"
};
const verifyRestoreRestart = async function () {
    const calls = [];
    const runtimeMethods = [];
    const controller = createRuntimeRestartController({
        runtimeSessionManager: {
            executeRuntimeMethod: async function (request) {
                runtimeMethods.push(request.method);
                calls.push(request.source);
                return {
                    status: "ready"
                };
            },
            getSnapshot: function () {
                return readySnapshot;
            },
            start: async function () {
                calls.push("start");
                return readySnapshot;
            },
            stop: async function () {
                calls.push("stop");
                return {
                    ...readySnapshot,
                    status: "stopped"
                };
            }
        },
        createWorkspacePath: () => "/tmp/restart.RData",
        removeWorkspaceFile: (filePath) => {
            calls.push("remove:" + filePath);
        },
        invalidateDatasetPreview: () => {
            calls.push("invalidate");
        },
        setRuntimeSession: () => {
            calls.push("set-session");
        },
        sendRuntimeSession: () => {
            calls.push("send-session");
        },
        refreshWorkspace: async () => {
            calls.push("refresh-workspace");
        },
        captureWorkspaceBaseline: async (source) => {
            calls.push(source);
        }
    });
    const result = await controller.restart("restore", "contract.restart");
    assert.deepStrictEqual(result, readySnapshot);
    assert.deepStrictEqual(runtimeMethods, [
        "runtime.save_workspace_file",
        "runtime.load_workspace_file"
    ]);
    assert.deepStrictEqual(calls, [
        "contract.restart.save",
        "invalidate",
        "stop",
        "start",
        "contract.restart.load",
        "remove:/tmp/restart.RData",
        "set-session",
        "send-session",
        "refresh-workspace",
        "contract.restart.baseline"
    ]);
};
const verifyCleanRestart = async function () {
    const runtimeMethods = [];
    const controller = createRuntimeRestartController({
        runtimeSessionManager: {
            executeRuntimeMethod: async function (request) {
                runtimeMethods.push(request.method);
                return {
                    status: "ready"
                };
            },
            getSnapshot: () => readySnapshot,
            start: async () => readySnapshot,
            stop: async () => ({
                ...readySnapshot,
                status: "stopped"
            })
        },
        createWorkspacePath: () => "/tmp/clean.RData",
        removeWorkspaceFile: () => { },
        invalidateDatasetPreview: () => { },
        setRuntimeSession: () => { },
        sendRuntimeSession: () => { },
        refreshWorkspace: async () => { },
        captureWorkspaceBaseline: async () => { }
    });
    await controller.restart("clean", "contract.clean");
    assert.deepStrictEqual(runtimeMethods, []);
};
const run = async function () {
    await verifyRestoreRestart();
    await verifyCleanRestart();
    console.log("Runtime restart controller contract verified.");
};
void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
