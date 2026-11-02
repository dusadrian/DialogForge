"use strict";

const assert = require("node:assert/strict");
const {
    createRRuntimeCommandInterrupt
} = require("../dist/src/runtime/providers/r/controllers/rRuntimeCommandInterrupt");


const phaseEvent = function(parentId, phase) {
    return { type: "execution_phase", parent_id: parentId, phase };
};


const createInterruptFixture = function() {
    let current = true;
    let available = true;
    let result = true;
    let signals = 0;
    const reports = [];
    const owner = createRRuntimeCommandInterrupt({
        isCurrent: function() {
            return current;
        },
        canInterrupt: function() {
            return available;
        },
        onTranscriptEvents: function(events) {
            reports.push(...events);
        },
        signalInterrupt: function() {
            signals += 1;

            if (result instanceof Error) {
                throw result;
            }

            return result;
        }
    });

    return {
        owner,
        reports,
        signals: function() {
            return signals;
        },
        retireSession: function() {
            current = false;
        },
        setSignalResult: function(value) {
            result = value;
        },
        setAvailable: function(value) {
            available = value;
        }
    };
};


const checkQueuedStop = function() {
    const fixture = createInterruptFixture();
    const owner = fixture.owner;

    assert.equal(owner.requestInterrupt(), null);
    owner.begin("first-command");
    assert.equal(owner.requestInterrupt(), true);
    assert.equal(owner.requestInterrupt(), true);
    assert.equal(fixture.signals(), 0, "A dispatched request has not entered R yet.");
    owner.observeEvent({ type: "input", parent_id: "first-command" });
    owner.observeEvent({ type: "state", parent_id: "first-command", state: "busy" });
    owner.observeEvent(phaseEvent("stale-command", "running"));
    owner.observeEvent(phaseEvent("first-command", "awaiting_input"));
    assert.equal(fixture.signals(), 0, "Only a matching running phase may deliver queued Stop.");
    owner.observeEvent(phaseEvent("first-command", "running"));
    assert.equal(fixture.signals(), 1);
    owner.observeEvent(phaseEvent("first-command", "running"));
    assert.equal(fixture.signals(), 1, "Duplicate running events must not replay queued Stop.");
    assert.equal(owner.requestInterrupt(), true);
    assert.equal(fixture.signals(), 2, "A later explicit Stop remains available during evaluation.");
    owner.observeEvent(phaseEvent("first-command", "evaluated"));
    assert.equal(owner.requestInterrupt(), null);
    owner.observeEvent(phaseEvent("first-command", "running"));
    assert.equal(fixture.signals(), 2, "A late running event cannot reopen the completed command.");
};


const checkActiveAndFinishedCommands = function() {
    const fixture = createInterruptFixture();
    const owner = fixture.owner;

    owner.begin("active-command");
    owner.observeEvent(phaseEvent("active-command", "running"));
    assert.equal(fixture.signals(), 0);
    assert.equal(owner.requestInterrupt(), true);
    assert.equal(fixture.signals(), 1);
    owner.observeEvent({ type: "completion", parent_id: "active-command", state: "idle" });
    assert.equal(owner.requestInterrupt(), null);

    owner.begin("next-command");
    owner.observeEvent(phaseEvent("active-command", "evaluated"));
    owner.finish("active-command");
    assert.equal(owner.requestInterrupt(), true);
    owner.observeEvent(phaseEvent("active-command", "running"));
    assert.equal(fixture.signals(), 1);
    owner.observeEvent(phaseEvent("next-command", "running"));
    assert.equal(fixture.signals(), 2, "Stale completion must not discard a newer command's Stop.");
    owner.finish("next-command");
    assert.equal(owner.requestInterrupt(), null);
};


const checkRetiredAndReplacedCommands = function() {
    for (const retirement of ["owner", "session", "replacement", "completion"]) {
        const fixture = createInterruptFixture();
        const owner = fixture.owner;

        owner.begin("queued-command");
        owner.requestInterrupt();

        if (retirement === "owner") {
            owner.retire();
        }
        else if (retirement === "session") {
            fixture.retireSession();
        }
        else if (retirement === "replacement") {
            owner.begin("replacement-command");
        }
        else {
            owner.observeEvent({ type: "completion", parent_id: "queued-command" });
        }

        owner.observeEvent(phaseEvent("queued-command", "running"));
        owner.observeEvent(phaseEvent("replacement-command", "running"));
        assert.equal(fixture.signals(), 0, retirement + " must discard the old Stop intent.");

        if (retirement !== "replacement") {
            assert.equal(owner.requestInterrupt(), null);
        }
    }
};


const checkSignalFailures = function() {
    for (const result of [false, null, new Error("Host interrupt failed")]) {
        const fixture = createInterruptFixture();
        const owner = fixture.owner;

        fixture.setSignalResult(result);
        owner.begin("active-command");
        owner.observeEvent(phaseEvent("active-command", "running"));
        assert.equal(owner.requestInterrupt(), result === null ? null : false);
        fixture.setSignalResult(true);
        assert.equal(owner.requestInterrupt(), true, "An explicit retry may signal after host failure.");
        assert.equal(fixture.signals(), 2);
        owner.finish("active-command");
        owner.begin("next-command");
        owner.observeEvent(phaseEvent("next-command", "running"));
        assert.equal(fixture.signals(), 2, "No failed Stop intent may spill into the next command.");
    }
};


const checkUnavailableAndFailedQueuedStop = function() {
    const unavailable = createInterruptFixture();
    unavailable.setAvailable(false);
    unavailable.owner.begin("unsupported-command");
    assert.equal(unavailable.owner.requestInterrupt(), null);
    unavailable.setAvailable(true);
    unavailable.owner.observeEvent(phaseEvent("unsupported-command", "running"));
    assert.equal(unavailable.signals(), 0, "Unsupported Stop must not leave a queued intent.");

    for (const failure of [false, null, new Error("Signal failed")]) {
        const fixture = createInterruptFixture();
        fixture.setSignalResult(failure);
        fixture.owner.begin("queued-command");
        assert.equal(fixture.owner.requestInterrupt(), true);
        fixture.owner.observeEvent(phaseEvent("queued-command", "running"));
        assert.equal(fixture.signals(), 1);
        assert.equal(fixture.reports.length, 1);
        assert.equal(fixture.reports[0].parentId, "queued-command");
        assert.equal(fixture.reports[0].streamName, "stderr");
        assert.match(fixture.reports[0].message, /Runtime (interrupt is not available|did not accept)/);
        fixture.owner.observeEvent(phaseEvent("queued-command", "running"));
        assert.equal(fixture.reports.length, 1, "Duplicate events must not repeat a delivery failure.");
    }
};


const main = async function() {
    checkQueuedStop();
    checkActiveAndFinishedCommands();
    checkRetiredAndReplacedCommands();
    checkSignalFailures();
    checkUnavailableAndFailedQueuedStop();
    console.log("Shared R Stop ownership, queued delivery, availability and retirement cases passed.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
