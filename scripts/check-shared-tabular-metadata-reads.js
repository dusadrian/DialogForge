"use strict";

const assert = require("node:assert/strict");
const { createTabularIpcController } = require("../dist/src/shell-electron/runtime/tabularIpcController");
const { createRuntimeSessionDatasetChannelAdapter } = require(
    "../dist/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter"
);
const { tabularIpcChannels } = require("../dist/src/core/ipc/tabularIpc");

const checkRetiredReads = async function() {
    for (const kind of ["VariableMetadata", "ValueLabels", "DeclaredMissing"]) {
        for (const transition of ["generation", "provider", "status", "replacement"]) {
            for (const host of ["native", "browser"]) {
                if (host === "native" && transition === "replacement") {
                    continue;
                }
                const method = "read" + kind;
                let session = { providerId: "fixture", lifecycleGeneration: 1, status: "ready" };
                let current = true;
                let release;
                const held = new Promise(resolve => { release = resolve; });
                const publications = [];
                const runtime = {
                    getSnapshot: () => session,
                    getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
                    [method]: () => held
                };
                let read;
                if (host === "native") {
                    const handlers = new Map();
                    createTabularIpcController({
                        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                        runtimeSessionManager: runtime,
                        ["send" + kind]: snapshot => publications.push(snapshot)
                    });
                    read = name => handlers.get(tabularIpcChannels[method])({}, name);
                } else {
                    read = createRuntimeSessionDatasetChannelAdapter({
                        runtimeSessionManager: runtime,
                        isCurrentRuntime: () => current,
                        ["publish" + kind]: snapshot => publications.push(snapshot),
                        invalidateDataset: () => assert.fail("Retired read must not invalidate cache")
                    })[method];
                }
                const pending = read("data");
                if (transition === "generation") {
                    session = { ...session, lifecycleGeneration: 2 };
                } else if (transition === "provider") {
                    session = { ...session, providerId: "replacement" };
                } else if (transition === "status") {
                    session = { ...session, status: "stopped" };
                } else {
                    current = false;
                }
                release({ status: "ready", providerId: "fixture", objectName: "data",
                    variables: ["old-owner-marker"], labels: ["old-owner-marker"],
                    values: ["old-owner-marker"] });
                const result = await pending;
                assert.equal(result.status, "unavailable");
                assert.equal(JSON.stringify(result).includes("old-owner-marker"), false);
                assert.deepEqual(publications, []);
            }
        }
    }
};

const main = async function() {
    await checkRetiredReads();
    for (const kind of ["VariableMetadata", "ValueLabels", "DeclaredMissing"]) {
        const method = "read" + kind;
        for (const disposition of ["ready", "unavailable", "throws", "publication-throws"]) {
            const outputs = [];
            for (const host of ["native", "browser"]) {
                const calls = [];
                const publications = [];
                const failure = Error("fixture metadata read failure");
                const snapshot = { status: disposition === "unavailable" ? "unavailable" : "ready",
                    objectName: "data", variables: [], message: "Keep exact runtime snapshot." };
                const runtime = {
                    getSnapshot: () => ({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" }),
                    getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
                    async [method](name) {
                        calls.push(name);
                        if (disposition === "throws") {
                            throw failure;
                        }
                        return snapshot;
                    }
                };
                const publish = value => {
                    publications.push(value);
                    if (disposition === "publication-throws") {
                        throw failure;
                    }
                };
                let read;
                if (host === "native") {
                    const handlers = new Map();
                    createTabularIpcController({
                        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                        runtimeSessionManager: runtime,
                        ["send" + kind]: publish
                    });
                    read = name => handlers.get(tabularIpcChannels[method])({}, name);
                } else {
                    read = createRuntimeSessionDatasetChannelAdapter({
                        runtimeSessionManager: runtime,
                        ["publish" + kind]: publish,
                        invalidateDataset: () => assert.fail("Metadata read must not invalidate cache")
                    })[method];
                }
                let result;
                if (disposition === "throws" || disposition === "publication-throws") {
                    await assert.rejects(read(" data "), error => error === failure);
                } else {
                    result = await read(" data ");
                    assert.equal(result, snapshot);
                }
                assert.deepEqual(calls, ["data"]);
                assert.deepEqual(publications, disposition === "throws" ? [] : [snapshot]);
                outputs.push({ calls, publications, result });
            }
            assert.deepEqual(outputs[0], outputs[1]);
        }
    }
    console.log("Shared metadata read cases passed; actual bridge/rendered acceptance remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
