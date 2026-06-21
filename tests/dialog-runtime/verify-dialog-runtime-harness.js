"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createCompositeDialogExternalCallHost } = require("../../shared/dialog-runtime/custom-js/compositeExternalCallHost");
const { createDialogExternalCallHost } = require("../../shared/dialog-runtime/custom-js/externalCallHost");
const { createDialogRuntimeHarness } = require("../../shared/dialog-runtime/custom-js/dialogRuntimeHarness");
const createFakeProductHost = function () {
    const implemented = new Set([
        "fake.listItems",
        "fake.renderState"
    ]);

    return {
        supports: function (name) {
            return implemented.has(name);
        },
        call: async function (name) {
            if (name === "fake.listItems") {
                return {
                    status: "ready",
                    name,
                    value: ["one", "two"],
                    message: "Fake product call resolved."
                };
            }
            if (name === "fake.renderState") {
                return {
                    status: "ready",
                    name,
                    value: {
                        selected: "one",
                        visible: true
                    },
                    message: "Fake product call resolved."
                };
            }
            return {
                status: "unsupported",
                name,
                value: null,
                message: "Fake product call is not implemented."
            };
        }
    };
};
const host = createCompositeDialogExternalCallHost({
    shared: createDialogExternalCallHost({
        datasets: [
            { name: "survey", columns: ["A", "B", "Y"] }
        ]
    }),
    products: {
        fake: createFakeProductHost()
    }
});
const verify = async function () {
    const harness = createDialogRuntimeHarness({
        externalCallHost: host
    });
    assert.strictEqual(harness.supportsExternalCall("getDatasetVariablesForDialog"), true);
    assert.strictEqual(harness.supportsExternalCall("fake.listItems"), true);
    assert.strictEqual(harness.supportsExternalCall("fake.missing"), false);
    assert.deepStrictEqual(await harness.callExternal("getDatasetVariablesForDialog", {
        dataset: "survey"
    }), ["A", "B", "Y"]);
    assert.deepStrictEqual(await harness.callExternal("fake.listItems"), ["one", "two"]);
    assert.deepStrictEqual(await harness.callExternal("fake.renderState"), {
        selected: "one",
        visible: true
    });
    assert.strictEqual(await harness.callExternal("fake.missing"), null);
    assert.strictEqual(harness.getLastResult()?.status, "unsupported");
    assert.deepStrictEqual(harness.listCalls().map((call) => {
        return call.name;
    }), [
        "getDatasetVariablesForDialog",
        "fake.listItems",
        "fake.renderState",
        "fake.missing"
    ]);
};
verify()
    .then(() => {
    console.log("Dialog runtime harness verified.");
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
