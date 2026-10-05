"use strict";

const assert = require("node:assert/strict");
const { createRuntimeVariableMetadataExecutionController } = require("../dist/src/runtime/tabular-data/runtimeVariableMetadataExecutionController");
const { createRuntimeLabelStateExecutionController } = require("../dist/src/runtime/tabular-data/runtimeLabelStateExecutionController");
const { createRuntimeTabularReadController } = require("../dist/src/runtime/tabular-data/runtimeTabularReadController");

const main = async function() {
    let epoch = 0;
    let available = true;
    let session = { providerId: "fixture", status: "ready" };
    let release;
    let fallbacks = 0;
    const deferred = () => new Promise((resolve) => { release = resolve; });
    const fallback = () => {
        fallbacks += 1;
        return { status: "ready", columns: [], rows: [], variables: [], valueLabels: [], declaredMissing: [] };
    };
    const options = {
        getSnapshot: () => session,
        getWorkspaceReadEpoch: () => epoch,
        isWorkspaceReadAvailable: () => available,
        getActiveObjectName: () => "probe",
        materializeRows: () => { fallbacks += 1; return true; }
    };
    const metadata = createRuntimeVariableMetadataExecutionController({
        ...options,
        providerTabularController: { readVariableMetadata: deferred },
        fallbackVariableMetadataController: { readSnapshot: fallback },
        getRows: () => [], createColumns: () => [],
        readVariableMetadata: deferred, recordRuntimeEvent() {}
    });
    const labels = createRuntimeLabelStateExecutionController({
        ...options, providerId: "fixture",
        providerTabularController: { readValueLabels: deferred, readDeclaredMissing: deferred },
        fallbackLabelStateController: { readValueLabels: fallback, readDeclaredMissing: fallback },
        recordRuntimeEvent() {}
    });
    const tabular = createRuntimeTabularReadController({
        ...options, hasFallbackRows: () => false,
        workspaceController: { readTabularPreview: deferred, readTabularSchema: deferred },
        readOnlyAdapter: { readTabularPreview: fallback },
        fallbackWorkspaceController: { readTabularPreview: fallback }
    });
    const readers = [
        () => metadata.readVariableMetadata("probe"),
        () => labels.readValueLabels("probe"),
        () => labels.readDeclaredMissing("probe"),
        () => tabular.readPreview("probe", { rowStart: 1, rowCount: 1, columns: [] }),
        () => tabular.readSchema("probe")
    ];
    for (const read of readers) {
        for (const response of [null, { status: "ready", columns: [], rows: [] }]) {
            for (const transition of ["epoch", "stopped", "pending"]) {
                available = true;
                session = { ...session, status: "ready" };
                const before = fallbacks;
                const pending = read();
                if (transition === "epoch") {
                    epoch += 1;
                } else if (transition === "stopped") {
                    session = { ...session, status: "stopped" };
                } else {
                    available = false;
                }
                release(response);
                assert.equal((await pending).status, "unavailable");
                assert.equal(fallbacks, before, "Superseded responses cannot enter local fallback state");
            }
        }
    }

    available = true;
    session = { ...session, status: "ready" };
    for (const read of readers.slice(0, 4)) {
        const before = fallbacks;
        const pending = read();
        release(null);
        assert.equal((await pending).status, "ready");
        assert.ok(fallbacks > before, "Unchanged provider-null reads retain ordinary fallback behavior");
    }
    const schema = tabular.readSchema("probe");
    release(null);
    // Schema may use the preview provider only when its first boundary is current.
    await Promise.resolve();
    release({ status: "unavailable" });
    assert.equal((await schema).status, "unavailable");
    console.log("Provider read fallthrough: epoch/readiness/pending retirement blocks fallback effects.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
