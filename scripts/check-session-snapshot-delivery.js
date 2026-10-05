"use strict";

const assert = require("node:assert/strict");
const { publishRuntimeSessionSnapshot, createRuntimeSessionPublication } = require("../dist/src/runtime/events/runtimeEventDelivery");
const { createMainRendererEventController } = require(
    "../dist/src/base-app/features/main-window/mainRendererEventController"
);


const initial = { providerId: "fixture", lifecycleGeneration: 1,
    status: "ready", connection: "fixture", message: "Ready" };
let current = initial;
const rendered = [];
const controller = createMainRendererEventController({
    getRuntimeSession: () => current,
    renderRuntimeSession: value => { current = value; rendered.push(value); }
});
for (const snapshot of [
    { ...initial, lifecycleGeneration: 2 },
    { ...initial, providerId: "replacement", lifecycleGeneration: 2 },
    { ...initial, connection: "reconnected", message: "New diagnostics" }
]) {
    controller.handleRuntimeSession(snapshot);
    assert.equal(current, snapshot, "Same status must not discard session identity/details");
    assert.equal(rendered.at(-1), snapshot);
}

const events = [];
publishRuntimeSessionSnapshot(initial, {
    publishSession: value => events.push(["session", value]),
    publishScriptPhase: value => events.push(["script", value])
});
assert.deepEqual(events, [["session", initial], ["script", { phase: "ready" }]]);
assert.equal(events[0][1], initial);
const failure = Error("Session publication rejected");
assert.throws(() => publishRuntimeSessionSnapshot(initial, {
    publishSession: () => { throw failure; },
    publishScriptPhase: () => assert.fail("Phase must not overtake failed session publication")
}), error => error === failure);

const heldEvents = [];
const publication = createRuntimeSessionPublication({
    publishSession: value => heldEvents.push(["session", value]),
    publishScriptPhase: value => heldEvents.push(["script", value])
});
const releaseFirst = publication.deferReady();
const releaseSecond = publication.deferReady();
assert.equal(publication.publish(initial), false,
    "Startup ready must not reach retained consumers while Restore owns readiness.");
assert.deepEqual(heldEvents, []);
const stopped = { ...initial, status: "stopped" };
assert.equal(publication.publish(stopped), true,
    "Non-ready retirement must still invalidate retained consumers.");
assert.deepEqual(heldEvents, [["session", stopped], ["script", { phase: "stopped" }]]);
releaseFirst();
releaseFirst();
assert.equal(publication.publish(initial), false, "A duplicate release must not end another hold.");
releaseSecond();
assert.equal(heldEvents.length, 2, "Releasing cannot replay a held, possibly retired ready snapshot.");
const restored = { ...initial, lifecycleGeneration: 2, workspaceRestored: true };
assert.equal(publication.publish(restored), true);
assert.equal(heldEvents.at(-2)[1], restored, "Restored result and fields must survive publication.");
console.log("Shared session snapshot delivery cases passed (controlled consumer, not physical host acceptance).");
