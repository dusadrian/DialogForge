"use strict";
const assert = require("node:assert/strict");
const { createRuntimeHelpEventDelivery } = require("../dist/src/runtime/help/runtimeHelpEventDelivery");
const { createHelpRequestOwner } = require("../dist/src/runtime/help/helpRequestOwner");
const { createProviderRuntimeEvent } = require("../dist/src/runtime/providers/r/protocol/runtimeControlEvents");
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return {promise, resolve, reject}; };
(async function() {
    let generation = 1;
    let runtime = { getSnapshot: () => ({ lifecycleGeneration: generation }) };
    const openings = [], errors = [], pending = [];
    const requests = createHelpRequestOwner();
    const delivery = createRuntimeHelpEventDelivery({
        getRuntime: () => runtime,
        requests,
        async openPage(path, isCurrent) {
            const hold = deferred(); pending.push({ hold, isCurrent });
            await hold.promise;
            if (isCurrent()) { openings.push(path); }
        },
        reportError: error => errors.push(error)
    });
    const event = (id, gen = generation) => createProviderRuntimeEvent({
        type: "help_page", id, path: "/library/QCA/html/truthTable.html"
    }, { providerId: "r", lifecycleGeneration: gen });
    const present = events => delivery.present({ events });
    present([event("a"), event("a")]);
    assert.equal(pending.length, 1, "Live/collected replay opens once");
    generation++;
    pending[0].hold.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(openings.length, 0, "Retired generation cannot open a help window");
    present([event("a", 1), event("a")]);
    assert.equal(pending.length, 2, "Fresh generation may reuse R event sequence");
    present([event("b")]);
    pending[1].hold.resolve(); pending[2].hold.resolve();
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(openings, ["/library/QCA/html/truthTable.html"], "Latest help request wins");
    present([event("c")]);
    runtime = { getSnapshot: () => ({ lifecycleGeneration: generation }) };
    pending[3].hold.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(openings.length, 1, "Different runtime with equal generation cannot publish");
    assert.equal(createProviderRuntimeEvent({type:"help_page",id:"x",path:"https://example.test"}, {providerId:"r"}), null);
    present([event("newest"), event("older")]);
    assert.equal(pending.length, 6);
    assert.equal(pending[4].isCurrent(), false, "Newest-first snapshots retire earlier requests");
    assert.equal(pending[5].isCurrent(), true);
    pending[4].hold.reject(Error("retired")); pending[5].hold.resolve();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(errors, [], "Retired failures must not affect the current viewer");
    present([event("live-error")]);
    pending[6].hold.reject(Error("live"));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(errors.length, 1, "Current failures must be reported");
    assert.equal(errors[0].message, "live");
    present([event("before-f1")]);
    const f1IsCurrent = requests.begin();
    openings.push("/library/base/html/mean.html");
    pending[7].hold.resolve();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(f1IsCurrent(), true);
    assert.equal(openings.at(-1), "/library/base/html/mean.html",
        "A pending R callback must not replace a newer manual Help/F1 page");
    present([event("after-f1")]);
    assert.equal(f1IsCurrent(), false, "A newer callback also retires manual help reads");
    requests.retire();
    pending[8].hold.resolve();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(openings.at(-1), "/library/base/html/mean.html",
        "Viewer navigation or closing must retire pending callbacks");
    const slowManual = requests.begin();
    const newerManual = requests.begin();
    assert.equal(slowManual(), false, "Two manual Help/F1 openings share the same ordering");
    assert.equal(newerManual(), true);
    requests.retire();
    assert.equal(newerManual(), false, "Closing also retires a pending manual help opening");
    assert.ok(createProviderRuntimeEvent({type:"help_page", id:"chooser", path:"/library/NULL/help/mean"}, {providerId:"r", lifecycleGeneration:generation}));
    assert.ok(createProviderRuntimeEvent({type:"help_page", id:"home", path:"/doc/html/index.html"}, {providerId:"r", lifecycleGeneration:generation}));
    console.log("Shared R help callback replay, request ordering, and retirement checks passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
