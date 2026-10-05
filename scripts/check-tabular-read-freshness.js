"use strict";

const assert = require("node:assert/strict");
const { createRuntimeWorkspaceState } = require("../dist/src/runtime/session/runtimeWorkspaceState");
const { createRuntimeTabularReadOperationController } = require("../dist/src/runtime/tabular-data/runtimeTabularReadOperationController");
const { createRuntimeVariableMetadataOperationController } = require("../dist/src/runtime/tabular-data/runtimeVariableMetadataOperationController");

const main = async function() {
    let session = { providerId: "fixture", status: "ready" };
    const state = createRuntimeWorkspaceState("fixture");
    let release;
    let reads = 0;
    const deferredRead = function() {
        reads += 1;
        return new Promise((resolve) => { release = resolve; });
    };
    const options = {
        getSnapshot: () => session,
        getActiveObjectName: () => "probe",
        getWorkspaceReadEpoch: state.getReadEpoch,
        isWorkspaceReadAvailable: () => ["fresh", "unread"].includes(state.createSnapshot(session).freshness)
    };
    const tabular = createRuntimeTabularReadOperationController({
        ...options,
        tabularReadController: { readSchema: deferredRead, readPreview: deferredRead }
    });
    const metadata = createRuntimeVariableMetadataOperationController({
        ...options,
        variableMetadataExecutionController: { readVariableMetadata: deferredRead },
        hasRuntimeCapability: () => true,
        readVariableMetadataValue: () => ""
    });
    const readOperations = [
        () => tabular.readSchema("probe"),
        () => tabular.readPreview("probe"),
        () => metadata.readVariableMetadata("probe")
    ];
    const readyResult = {
        status: "ready", providerId: "fixture", objectName: "probe",
        columns: [{ name: "old" }], rows: [[1]], variables: [{ name: "old" }]
    };

    for (const read of readOperations) {
        const unchanged = read();
        release(readyResult);
        assert.equal((await unchanged).status, "ready", "Unread workspace permits initial reads");

        const changed = read();
        const token = state.beginCommandReconciliation();
        state.endCommandReconciliation(token);
        release(readyResult);
        assert.equal((await changed).status, "unavailable", "Even a completed intervening command retires old reads");

        const pendingToken = state.beginCommandReconciliation();
        const before = reads;
        assert.equal((await read()).status, "unavailable");
        assert.equal(reads, before, "Pending workspace does not dispatch a new read");
        state.endCommandReconciliation(pendingToken);

        const retired = read();
        state.invalidate();
        release(readyResult);
        assert.equal((await retired).status, "unavailable", "Replacement session rejects old data");

        const refreshed = read();
        state.remember([]);
        release(readyResult);
        assert.equal((await refreshed).status, "unavailable", "Accepted refresh retires earlier data");

        state.markStale();
        const beforeStale = reads;
        assert.equal((await read()).status, "unavailable");
        assert.equal(reads, beforeStale);
        state.remember([]);
    }
    session = { ...session, status: "stopped" };
    assert.equal((await metadata.readVariableMetadata("probe")).status, "unavailable");
    console.log("Tabular reads: pending, stale, command, refresh and replacement-session ownership.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
