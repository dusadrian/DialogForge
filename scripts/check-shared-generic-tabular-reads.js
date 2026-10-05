"use strict";

const assert = require("node:assert/strict");
const { createTabularIpcController } = require("../dist/src/shell-electron/runtime/tabularIpcController");
const { createRuntimeSessionDatasetChannelAdapter } = require(
    "../dist/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter"
);
const { tabularIpcChannels } = require("../dist/src/core/ipc/tabularIpc");

const checkRetiredReads = async function() {
    for (const method of ["readTabularSchema", "readTabularPreview"]) {
        for (const transition of ["generation", "provider", "status", "replacement"]) {
            for (const host of ["native", "browser"]) {
                if (host === "native" && transition === "replacement") {
                    continue;
                }
                let session = { providerId: "fixture", lifecycleGeneration: 1, status: "ready" };
                let current = true;
                let release;
                const held = new Promise(resolve => { release = resolve; });
                const publications = [];
                const runtime = {
                    getSnapshot: () => session,
                    getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
                    readTabularSchema: () => held,
                    readTabularPreview: () => assert.fail("Use the warmed preview reader")
                };
                let read;
                if (host === "native") {
                    const handlers = new Map();
                    createTabularIpcController({
                        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                        runtimeSessionManager: runtime,
                        readInitialDatasetPreview: () => held,
                        sendTabularPreview: snapshot => publications.push(snapshot)
                    });
                    const channel = method === "readTabularSchema"
                        ? tabularIpcChannels.readSchema : tabularIpcChannels.readPreview;
                    read = input => handlers.get(channel)({}, input);
                } else {
                    read = createRuntimeSessionDatasetChannelAdapter({
                        runtimeSessionManager: runtime,
                        isCurrentRuntime: () => current,
                        readTabularPreview: () => held,
                        publishTabularPreview: snapshot => publications.push(snapshot),
                        invalidateDataset: () => assert.fail("Read must not invalidate cache")
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
                    rows: [{ x: "old-owner-marker" }], columns: [{ name: "old-owner-marker" }] });
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
    for (const reject of [false, true]) {
        const outputs = [];
        for (const host of ["native", "browser"]) {
            const calls = [];
            const publications = [];
            const failure = Error("fixture read failed");
            const schema = { status: "ready", objectName: "data" };
            const preview = { status: "ready", objectName: "data", rows: [] };
            const runtime = {
                getSnapshot: () => ({ providerId: "fixture", lifecycleGeneration: 1, status: "ready" }),
                getWorkspaceSnapshot: () => ({ providerId: "fixture", objects: [] }),
                async readTabularSchema(name) {
                    calls.push(["schema", name]);
                    if (reject) {
                        throw failure;
                    }
                    return schema;
                },
                readTabularPreview: () => assert.fail("Generic read must use injected warm reader")
            };
            const warmReader = async request => {
                calls.push(["preview", request]);
                if (reject) {
                    throw failure;
                }
                return preview;
            };
            let readSchema;
            let readPreview;
            if (host === "native") {
                const handlers = new Map();
                createTabularIpcController({
                    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
                    runtimeSessionManager: runtime,
                    readInitialDatasetPreview: warmReader,
                    sendTabularPreview: value => publications.push(value)
                });
                readSchema = input => handlers.get(tabularIpcChannels.readSchema)({}, input);
                readPreview = input => handlers.get(tabularIpcChannels.readPreview)({}, input);
            } else {
                const adapter = createRuntimeSessionDatasetChannelAdapter({
                    runtimeSessionManager: runtime,
                    readTabularPreview: warmReader,
                    publishTabularPreview: value => publications.push(value),
                    invalidateDataset: () => assert.fail("Read must not invalidate cache")
                });
                readSchema = adapter.readTabularSchema;
                readPreview = adapter.readTabularPreview;
            }
            const request = { objectName: "data", rowStart: 4, rowCount: 40,
                columns: ["x"], columnCount: 32 };
            if (reject) {
                await assert.rejects(readSchema(" data "), error => error === failure);
                await assert.rejects(readPreview(request), error => error === failure);
                assert.deepEqual(publications, []);
            } else {
                assert.equal(await readSchema(" data "), schema);
                assert.equal(await readPreview("data"), preview);
                assert.equal(await readPreview(request), preview);
                assert.equal(calls[2][1], request, "Do not replace warmed read request limits.");
                assert.deepEqual(publications, [preview, preview]);
            }
            outputs.push(calls);
        }
        assert.deepEqual(outputs[0], outputs[1]);
    }
    console.log("Shared generic read cases passed; browser preload/rendered acceptance remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
