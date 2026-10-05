"use strict";

const assert = require("node:assert/strict");
const { createRuntimeLabelStateOperationController } = require("../dist/src/runtime/tabular-data/runtimeLabelStateOperationController");
const { createRuntimeLabelStateExecutionController } = require("../dist/src/runtime/tabular-data/runtimeLabelStateExecutionController");

const main = async function() {
    let epoch = 0;
    let available = true;
    let active = "first";
    let release;
    let reads = 0;
    let events = 0;
    let generation = 0;
    const session = { providerId: "fixture", status: "ready" };
    const writes = [];
    const deferred = function() {
        reads += 1;
        return new Promise((resolve) => { release = resolve; });
    };
    const operation = createRuntimeLabelStateOperationController({
        getSnapshot: () => session,
        getWorkspaceReadEpoch: () => epoch,
        isWorkspaceReadAvailable: () => available,
        getActiveObjectName: () => active,
        hasRuntimeCapability: () => true,
        readVariableMetadata: deferred,
        labelStateExecutionController: {
            readValueLabels: deferred,
            readDeclaredMissing: deferred,
            writeValueLabels: async (request) => { writes.push(request); return { status: "updated" }; },
            writeDeclaredMissing: async (request) => { writes.push(request); return { status: "updated" }; }
        }
    });

    for (const read of [operation.readValueLabels, operation.readDeclaredMissing]) {
        const first = read("first");
        release({ status: "ready", objectName: "first" });
        assert.equal((await first).status, "ready");
        const changed = read("first");
        epoch += 1;
        release({ status: "ready", objectName: "first" });
        assert.equal((await changed).status, "unavailable");
        available = false;
        const before = reads;
        assert.equal((await read("first")).status, "unavailable");
        assert.equal(reads, before, "Pending/stale label reads must not dispatch");
        available = true;
    }

    const metadata = { status: "ready", variables: [{ name: "value" }] };
    for (const write of [operation.writeValueLabels, operation.writeDeclaredMissing]) {
        active = "first";
        const request = { objectName: "", variableName: "value", labels: [], values: [] };
        const pinned = write(request);
        active = "second";
        release(metadata);
        await pinned;
        assert.equal(writes.at(-1).objectName, "first", "Selection changes cannot retarget the write");
        const before = writes.length;
        const stale = write(request);
        epoch += 1;
        release(metadata);
        assert.equal((await stale).status, "unavailable");
        assert.equal(writes.length, before, "Superseded validation must not dispatch mutation");
        const stopped = write(request);
        session.status = "stopped";
        release(metadata);
        assert.equal((await stopped).status, "unavailable");
        assert.equal(writes.length, before);
        session.status = "ready";
    }

    const execution = createRuntimeLabelStateExecutionController({
        providerId: "fixture", getSnapshot: () => session,
        getWorkspaceGeneration: () => generation,
        getActiveObjectName: () => active,
        materializeRows: () => false,
        fallbackLabelStateController: {},
        recordRuntimeEvent: () => { events += 1; },
        providerTabularController: {
            writeValueLabels: deferred, writeDeclaredMissing: deferred
        }
    });
    for (const write of [execution.writeValueLabels, execution.writeDeclaredMissing]) {
        const request = { objectName: "first", variableName: "value", labels: [], values: [] };
        const current = write(request);
        release({ status: "updated" });
        await current;
        const before = events;
        const retired = write(request);
        generation += 1;
        release({ status: "updated" });
        assert.equal((await retired).status, "updated", "Keep known execution outcome separate from local effects");
        assert.equal(events, before, "Retired provider responses cannot emit success events");
    }
    console.log("Label ownership: read freshness, pinned targets, preflight retirement and event isolation.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
