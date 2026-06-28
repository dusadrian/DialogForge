"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");

const {
    selectRuntimeProvider
} = require("../../shared/core/contracts/runtimeProviderSelection");


const registeredProviderIds = ["r", "server-r", "webr", "python"];


const select = function(input) {
    return selectRuntimeProvider(Object.assign({
        registeredProviderIds,
        productRuntimeProviders: ["r", "server-r", "webr"],
        defaultRuntimeProvider: "r"
    }, input));
};


let selection = select({
    hostKind: "electron"
});
assert.strictEqual(selection.selectedProviderId, "r");
assert.strictEqual(selection.source, "default");
assert.deepStrictEqual(selection.visibleProviderIds, ["r"]);
assert.deepStrictEqual(selection.hiddenProviderIds, ["server-r", "webr"]);

selection = select({
    hostKind: "electron",
    persistedProviderId: "webr"
});
assert.strictEqual(selection.selectedProviderId, "r");
assert.strictEqual(selection.source, "default");

selection = select({
    hostKind: "electron",
    explicitProviderId: "webr"
});
assert.strictEqual(selection.selectedProviderId, "webr");
assert.strictEqual(selection.source, "explicit");

selection = select({
    hostKind: "web"
});
assert.strictEqual(selection.selectedProviderId, "server-r");
assert.strictEqual(selection.source, "first-visible");
assert.deepStrictEqual(selection.visibleProviderIds, ["server-r", "webr"]);
assert.deepStrictEqual(selection.hiddenProviderIds, ["r"]);

selection = select({
    hostKind: "web",
    persistedProviderId: "webr"
});
assert.strictEqual(selection.selectedProviderId, "webr");
assert.strictEqual(selection.source, "persisted");

selection = selectRuntimeProvider({
    hostKind: "web",
    registeredProviderIds,
    productRuntimeProviders: ["r"],
    defaultRuntimeProvider: "r"
});
assert.strictEqual(selection.selectedProviderId, "r");
assert.deepStrictEqual(selection.visibleProviderIds, ["r"]);

assert.throws(() => {
    select({
        explicitProviderId: "python"
    });
}, /not supported/);

assert.throws(() => {
    selectRuntimeProvider({
        registeredProviderIds: ["r"],
        productRuntimeProviders: ["r", "server-r"],
        defaultRuntimeProvider: "r"
    });
}, /not registered/);

console.log("Runtime provider selection policy verified.");
