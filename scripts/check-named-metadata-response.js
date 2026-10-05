"use strict";

const assert = require("node:assert/strict");
const { createDatasetEditorWarmCache } = require("../dist/src/dataset-editor/datasetEditorWarmCache");


const main = async function() {
    const variable = label => ({ name: "x", label });
    const valid = () => ({ name: "data", total: 1, items: [variable("accepted")] });
    const responses = [
        ["ordinary", valid(), false],
        ["missing-variable", { name: "data", total: 1, items: [] }, false],
        ["empty-dataset", { name: "data", total: 0, items: [] }, false],
        ["foreign", { ...valid(), name: "other" }, true],
        ["missing-items", { name: "data", total: 1 }, true],
        ["non-array-items", { ...valid(), items: {} }, true],
        ["negative-total", { ...valid(), total: -1 }, true],
        ["fractional-total", { ...valid(), total: 1.5 }, true],
        ["string-total", { ...valid(), total: "1" }, true],
        ["oversized-items", { ...valid(), total: 0 }, true],
        ["null-item", { ...valid(), items: [null] }, true],
        ["array-item", { ...valid(), items: [[]] }, true],
        ["missing-name", { ...valid(), items: [{ label: "bad" }] }, true],
        ["blank-name", { ...valid(), items: [{ name: " " }] }, true],
        ["array-envelope", [], true],
        ["null-envelope", null, true]
    ];

    for (const [scenario, value, invalid] of responses) {
        for (const retired of [false, true]) {
            let settle;
            let reads = 0;
            const held = new Promise(resolve => { settle = resolve; });
            const cache = createDatasetEditorWarmCache({
                executeRuntimeMethod(request) {
                    if (request.method === "workspace.dataset_variables_named") {
                        return held;
                    }
                    reads += 1;
                    return Promise.resolve({ status: "ready", value: {
                        name: "data", total: 1, start: 1, count: 1,
                        items: [variable(reads === 1 ? "before" : "fresh")]
                    } });
                },
                readVariableMetadata() { throw Error("Unexpected full fallback"); },
                readTabularPreview() { throw Error("Unexpected preview read"); }
            });
            cache.warmVariableMetadata("data");
            await cache.readVariableMetadata("data", 1, 1);
            const refresh = cache.refreshVariableMetadata("data", ["x"]);
            const observed = refresh.then(() => null, error => error);
            if (retired) {
                cache.invalidateVariableMetadata("data");
            }
            settle({ status: "ready", value });
            const error = await observed;
            assert.equal(Boolean(error), invalid && !retired, scenario + ": failure admission");
            if (error) {
                assert.equal(error.message,
                    "Variable metadata refresh returned an invalid dataset response.");
            }
            const after = await cache.readVariableMetadata("data", 1, 1);
            const expected = retired || invalid ? "fresh"
                : scenario === "ordinary" ? "accepted" : "before";
            assert.equal(after.items[0].label, expected, scenario + ": cache projection");
            assert.equal(reads, retired || invalid ? 2 : 1, scenario + ": cache reuse/recovery");
            cache.invalidate();
        }
    }
    process.stdout.write("Named metadata response cases passed.\n");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
