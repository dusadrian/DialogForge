"use strict";

const assert = require("node:assert/strict");
const { readRuntimeDatasetFilterMask } = require("../dist/src/runtime/tabular-data/runtimeDatasetFilterMask");

const main = async function() {
    for (const host of ["native", "browser"]) {
        const requests = [];
        const page = { name: "data", rowStart: 1, rowCount: 3, filteredOut: [true, false, false] };
        const runtime = {
            executeRuntimeMethod: async function(request) {
                requests.push(request);
                return { status: "ready", value: page };
            }
        };
        const options = { fallbackRows: 3, readFilterState: () => ({ command: "subset(data, x > 1)" }) };
        assert.equal(await readRuntimeDatasetFilterMask(runtime, { name: " data ", rowCount: 3 }, options), page, host);
        assert.equal(requests[0].method, "workspace.dataset_filter_mask");
        assert.deepEqual(requests[0].params, {
            name: "data", code: "subset(data, x > 1)", rowStart: 1, rowCount: 3
        });
        requests.length = 0;
        assert.deepEqual(await readRuntimeDatasetFilterMask(runtime, { name: "data", rowCount: 3 }, {
            fallbackRows: 3, readFilterState: () => null
        }), { ...page, filteredOut: [false, false, false] });
        assert.equal(requests.length, 0, "Cleared filters do not execute a mask query.");
        assert.equal(await readRuntimeDatasetFilterMask(runtime, {}, options), null);
        assert.equal(requests.length, 0, "Missing names do not execute a mask query.");
        const unavailable = { executeRuntimeMethod: async () => ({ status: "unavailable" }) };
        assert.deepEqual(await readRuntimeDatasetFilterMask(unavailable, { name: "data", rowCount: 3 }, options),
            { ...page, filteredOut: [false, false, false] }, "Retain existing native unavailable-result behavior.");
    }
    console.log("Shared dataset filter-mask cases passed.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
