"use strict";

const assert = require("node:assert/strict");


const main = async function() {
    const previousWindow = global.window;
    let response;
    let failure;
    const requests = [];
    global.window = {
        dialogForge: {
            datasetViewer: {
                getVariablesBatch: async (...args) => {
                    requests.push(args);
                    if (failure) {
                        throw failure;
                    }
                    return response;
                }
            }
        }
    };
    try {
        const { createDatasetViewerClient } = require("../dist/src/dataset-editor/renderer/datasetViewerClient");
        const client = createDatasetViewerClient();
        for (const items of [undefined, null, {}, "", [null], [4], [[]], [{}], [{ name: "" }], [{ name: "x", measure: "ratio" }, null]]) {
            response = { name: "data", total: 2, start: 1, count: 2, items };
            assert.equal(await client.getVariablesBatch("data", 1, 2), null,
                "Malformed entries must fail the batch, not shift positions or become empty success");
        }
        for (const invalid of [null, undefined, [], "invalid", 3]) {
            response = invalid;
            assert.equal(await client.getVariablesBatch("data", 1, 2), null);
        }
        response = { name: "data", total: 0, start: 1, count: 0, items: [] };
        assert.deepEqual(await client.getVariablesBatch("data", 1, 2), response);

        response = {
            name: "data", total: 2, start: 1, count: 2,
            items: [{ name: "x", measure: ["nominal", "ratio"], label: "X" }, { name: "y", measure: "ordinal", label: "Y" }]
        };
        const actual = await client.getVariablesBatch("data", 1, 2);
        assert.deepEqual(actual.items, [{ name: "x", measure: "ratio", label: "X" }, { name: "y", measure: "ordinal", label: "Y" }]);
        assert.equal(response.items[0].measure[0], "nominal", "Projection must not mutate source metadata");
        assert.deepEqual(requests.at(-1), ["data", 1, 2]);
        const valid = response;
        for (const patch of [
            { name: "replacement" }, { start: 2 }, { start: "1" },
            { count: 1 }, { count: "2" }, { count: -1 },
            { total: -1 }, { total: 1 }, { total: 2.5 },
            { total: "2" }, { total: NaN }, { total: Infinity },
            { total: Number.MAX_SAFE_INTEGER + 1 },
            { count: 0, items: [] }
        ]) {
            response = { ...valid, ...patch };
            assert.equal(await client.getVariablesBatch("data", 1, 2), null);
        }
        response = { ...valid, total: 3, count: 3, items: [...valid.items, { name: "z", measure: "ratio" }] };
        assert.equal(await client.getVariablesBatch("data", 1, 2), null, "Oversized page must fail");
        response = { name: "data", total: 2, start: 3, count: 0, items: [] };
        assert.deepEqual(await client.getVariablesBatch("data", 3, 2), response, "Beyond-end empty page remains valid");
        failure = new Error("Read failed");
        assert.equal(await client.getVariablesBatch("data", 1, 2), null);
        console.log("Shared Variables batch projection cases passed (controlled bridge, not actual host acceptance).");
    } finally {
        if (previousWindow === undefined) {
            delete global.window;
        } else {
            global.window = previousWindow;
        }
    }
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
