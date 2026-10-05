"use strict";

const assert = require("node:assert/strict");
const { createRuntimeEventDelivery } = require("../dist/src/runtime/events/runtimeEventDelivery");
const { createRuntimeEventListController } = require("../dist/src/runtime/session/runtimeEventListController");
const { createRuntimeEventState } = require("../dist/src/runtime/session/runtimeEventState");
const { createProviderRuntimeEvent } = require("../dist/src/runtime/providers/r/protocol/runtimeControlEvents");

const main = async function() {
    for (const host of ["r", "webr"]) {
        let generation = 1;
        const pending = [];
        const published = [];
        const effects = [];
        const manager = {
            getSnapshot: () => ({ providerId: host, status: "ready", lifecycleGeneration: generation }),
            listRuntimeEvents: () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
        };
        let current = manager;
        const delivery = createRuntimeEventDelivery({
            getRuntime: () => current,
            publish: (snapshot, changes) => published.push({ snapshot, changes }),
            publishEffects: (snapshot) => effects.push(snapshot)
        });
        const event = {
            providerId: host, type: "tabular.cell.updated", objectName: "data",
            createdAt: "fixture", payload: { columnName: "x", rowIndex: 1 }
        };
        const snapshot = { status: "ready", providerId: host, events: [event] };
        const first = delivery.refresh();
        const second = delivery.refresh();
        pending[1].resolve(snapshot);
        await second;
        pending[0].resolve(snapshot);
        await first;
        assert.equal(published.length, 1);
        assert.equal(published[0].changes.length, 1);
        delivery.publishSnapshot(snapshot);
        assert.equal(published.at(-1).changes.length, 0, "Same-scope events are projected once.");
        generation += 1;
        delivery.publishSnapshot(snapshot);
        assert.equal(published.at(-1).changes.length, 1, "A replacement generation owns its own projection history.");

        const oldGeneration = delivery.refresh();
        generation += 1;
        pending[2].resolve(snapshot);
        await oldGeneration;
        assert.equal(published.length, 3);
        const oldFailure = delivery.refresh();
        current = { ...manager };
        pending[3].reject(new Error("retired failure"));
        await oldFailure;
        assert.equal(published.length, 3);
        await delivery.refresh({ expectedRuntime: manager });
        assert.equal(pending.length, 4, "A retired command must not read replacement-session events.");

        delivery.publishSnapshot(snapshot, { sendDatasetChanges: false });
        assert.equal(published.at(-1).changes.length, 0);
        delivery.publishSnapshot(snapshot);
        assert.equal(published.at(-1).changes.length, 1,
            "Suppressing dataset delivery must not consume its events.");

        const waiting = delivery.refresh();
        delivery.publishSnapshot(snapshot);
        const publications = published.length;
        pending[4].resolve(snapshot);
        await waiting;
        assert.equal(published.length, publications, "Direct publication retires earlier pending reads.");

        let createSnapshots = 0;
        const reader = createRuntimeEventListController({
            getSnapshot: manager.getSnapshot,
            providerEventController: { listRuntimeEvents: manager.listRuntimeEvents },
            runtimeEventState: {
                createSnapshot: () => { createSnapshots += 1; return snapshot; }
            }
        });
        const providerRead = reader.listRuntimeEvents();
        generation += 1;
        pending[5].resolve([event]);
        assert.equal((await providerRead).status, "unavailable");
        assert.equal(createSnapshots, 0, "Never combine retired provider events with current session memory.");

        const history = createRuntimeEventState(40, () => generation);
        const providerPlot = createProviderRuntimeEvent({
            type: "plot", viewer_url: "fixture", status: "available"
        }, manager.getSnapshot());
        assert.equal(providerPlot.lifecycleGeneration, generation);
        history.record(host, "tabular.cell.updated", "data", "old data", event.payload);
        generation += 1;
        const retainedHistory = history.createSnapshot(host, []);
        assert.equal(retainedHistory.events.length, 1, "Keep diagnostic history across restart.");
        assert.equal(retainedHistory.events[0].lifecycleGeneration, generation - 1);
        delivery.publishSnapshot(retainedHistory);
        assert.deepEqual(published.at(-1).changes, [],
            "Historical events must not replay dataset effects after projection history resets.");
        assert.equal(published.at(-1).snapshot.events.length, 1, "Diagnostic history is not discarded.");
        assert.equal(effects.at(-1).events.length, 0, "Retired history cannot reopen a plot or publish another live effect.");
        const plot = { ...event, type: "plot", lifecycleGeneration: generation, payload: { viewerUrl: "fixture" } };
        delivery.publishSnapshot({ ...retainedHistory, events: [...retainedHistory.events, plot] });
        assert.deepEqual(effects.at(-1).events, [plot]);

        const providerHistoryReader = createRuntimeEventListController({
            getSnapshot: manager.getSnapshot,
            providerEventController: { listRuntimeEvents: async () => [providerPlot] },
            runtimeEventState: history
        });
        const providerHistory = await providerHistoryReader.listRuntimeEvents();
        assert.equal(providerHistory.events[0].lifecycleGeneration, providerPlot.lifecycleGeneration,
            "Listing history must not relabel a prior provider event as current.");
        delivery.publishSnapshot(providerHistory);
        assert.equal(effects.at(-1).events.length, 0);
    }
    console.log("Shared runtime event delivery cases passed; host/window acceptance remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
