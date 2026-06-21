"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createCompositeDialogExternalCallHost } = require("../../shared/dialog-runtime/custom-js/compositeExternalCallHost");
const { createDialogExternalCallHost } = require("../../shared/dialog-runtime/custom-js/externalCallHost");
const { createDialogRuntimeExternalCallPlan } = require("../../shared/dialog-runtime/custom-js/dialogRuntimePlan");
const fakeProductHost = {
    supports: function (name) {
        return name === "fake.listItems" || name === "fake.preview";
    },
    call: async function (name) {
        if (name === "fake.listItems") {
            return {
                status: "ready",
                name,
                value: [{ name: "item1" }],
                message: "Fake product call resolved."
            };
        }
        if (name === "fake.preview") {
            return {
                status: "ready",
                name,
                value: { ready: true },
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
const host = createCompositeDialogExternalCallHost({
    shared: createDialogExternalCallHost({
        datasets: [
            { name: "data", columns: ["x", "y"] }
        ]
    }),
    products: {
        fake: fakeProductHost
    }
});
const verify = async function () {
    assert.strictEqual(host.supports("getDatasetVariablesForDialog"), true);
    assert.strictEqual(host.supports("fake.preview"), true);
    assert.strictEqual(host.supports("fake.missing"), false);
    assert.deepStrictEqual((await host.call("getDatasetVariablesForDialog", {
        dataset: "data"
    })).value, ["x", "y"]);
    assert.deepStrictEqual((await host.call("fake.listItems")).value, [
        { name: "item1" }
    ]);
    assert.deepStrictEqual(createDialogRuntimeExternalCallPlan([
        "getDatasetVariablesForDialog",
        "fake.preview",
        "fake.missing"
    ], host), {
        supported: [
            "getDatasetVariablesForDialog",
            "fake.preview"
        ],
        unsupported: ["fake.missing"]
    });
    assert.strictEqual((await host.call("missing.product")).status, "unsupported");
};
verify()
    .then(() => {
    console.log("Composite dialog external-call host verified.");
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
