"use strict";

const assert = require("node:assert/strict");
const { createDatasetEditorWarmCache } = require("../dist/src/dataset-editor/datasetEditorWarmCache");


const main = async function() {
    for (const failureKind of ["exception", "returned-failure", "invalid-response"]) {
        for (const scenario of ["current", "newer-patch", "retired", "other-object"]) {
            let settlePage;
            let settleRefresh;
            let rejectRefresh;
            let reads = 0;
            const oldPage = new Promise(resolve => { settlePage = resolve; });
            const refreshResult = new Promise((resolve, reject) => {
                settleRefresh = resolve;
                rejectRefresh = reject;
            });
            const variable = (name, label) => ({ name, label });
            const page = label => ({ status: "ready", value: {
                name: "data", total: 2, start: 1, count: 2,
                items: [variable("x", label), variable("y", label)]
            } });
            const cache = createDatasetEditorWarmCache({
                executeRuntimeMethod(request) {
                    if (request.method === "workspace.dataset_variables_named") {
                        return refreshResult;
                    }
                    reads += 1;
                    return reads === 1 ? oldPage : Promise.resolve(page("fresh"));
                },
                readVariableMetadata() { throw Error("Unexpected full fallback"); },
                readTabularPreview() { throw Error("Unexpected preview read"); }
            });
            const reading = cache.readVariableMetadata("data", 1, 2);
            const refresh = cache.refreshVariableMetadata(
                scenario === "other-object" ? "other" : "data", ["x", "y"]
            );
            const observed = refresh.then(() => null, error => error);
            if (scenario === "newer-patch") {
                cache.patchVariableMetadata("data", "x", variable("x", "accepted"));
            }
            if (scenario === "retired") {
                cache.invalidateVariableMetadata("data");
            }
            const failure = Error("Named refresh failed");
            if (failureKind === "exception") {
                rejectRefresh(failure);
            }
            else if (failureKind === "returned-failure") {
                settleRefresh({ status: "failed", message: failure.message });
            }
            else {
                settleRefresh({ status: "ready", value: { name: "foreign", total: 2, items: [] } });
            }
            const error = await observed;
            assert.equal(Boolean(error), scenario !== "retired", "Refresh error admission");
            if (failureKind === "exception" && scenario !== "retired") {
                assert.equal(error, failure, "Exception identity");
            }
            settlePage(page("old"));
            const old = await reading;
            if (scenario === "other-object") {
                assert.equal(old.items[0].label, "old", "Unrelated failure retired a read");
            }
            else {
                assert.equal(old, null, "Failed refresh admitted the old direct read");
            }
            const fresh = await cache.readVariableMetadata("data", 1, 2);
            assert.equal(fresh.items[0].label, scenario === "newer-patch" ? "accepted" : "fresh");
            assert.equal(fresh.items[1].label, "fresh");
            assert.equal(reads, 2, "Recovery did not read current metadata");
            cache.invalidate();
        }
    }
    process.stdout.write("Named metadata failure read retirement cases passed.\n");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
