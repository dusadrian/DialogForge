"use strict";

const assert = require("node:assert/strict");
const { deliverDatasetMutationEffects } = require("../dist/src/dataset-editor/datasetMutationDelivery");

const main = async function() {
    for (const retireAt of ["none", "initial", "cache-a", "cache-b", "changes", "workspace", "refresh"]) {
        let current = retireAt !== "initial";
        const calls = [];
        const accepted = await deliverDatasetMutationEffects({
            isCurrent: () => current,
            objectNames: ["a", "b"],
            updateCache: name => {
                calls.push("cache-" + name);
                if (retireAt === "cache-" + name) {
                    current = false;
                }
            },
            publishChanges: () => {
                calls.push("changes");
                if (retireAt === "changes") {
                    current = false;
                }
            },
            publishWorkspace: async () => {
                calls.push("workspace");
                if (retireAt === "workspace") {
                    current = false;
                }
                return true;
            },
            refreshConsumers: async () => {
                calls.push("refresh");
                if (retireAt === "refresh") {
                    current = false;
                }
            }
        });
        const stages = ["cache-a", "cache-b", "changes", "workspace", "refresh"];
        assert.deepEqual(calls, retireAt === "initial" ? [] : retireAt === "none"
            ? stages : stages.slice(0, stages.indexOf(retireAt) + 1));
        assert.equal(accepted, retireAt === "none");
    }
    const failure = Error("fixture refresh exception");
    await assert.rejects(deliverDatasetMutationEffects({
        isCurrent: () => true, objectNames: [], updateCache: () => {},
        refreshConsumers: async () => { throw failure; }
    }), error => error === failure);
    for (const disposition of ["rejected", "throws", "held-retired"]) {
        let current = true;
        let release;
        let entered;
        const held = new Promise(resolve => { release = resolve; });
        const publicationEntered = new Promise(resolve => { entered = resolve; });
        const pending = deliverDatasetMutationEffects({
            isCurrent: () => current, objectNames: [], updateCache: () => {},
            publishWorkspace: async () => {
                entered();
                if (disposition === "throws") {
                    throw failure;
                }
                if (disposition === "held-retired") {
                    await held;
                    return true;
                }
                return false;
            },
            refreshConsumers: () => assert.fail("Unaccepted workspace refreshed consumers")
        });
        if (disposition === "throws") {
            await assert.rejects(pending, error => error === failure);
        } else {
            await publicationEntered;
            if (disposition === "held-retired") {
                current = false;
                release();
            }
            assert.equal(await pending, false);
        }
    }
    console.log("Shared mutation delivery cases passed; actual paired-host delivery remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
