"use strict";

const assert = require("node:assert/strict");
const { createRVisibleCommandExecutor } = require(
    "../dist/src/runtime/providers/r/controllers/rVisibleCommandExecutor"
);
const { createConsoleSessionState } = require(
    "../dist/src/console/services/consoleSessionState"
);
const { createLiveTranscriptEventsFromRuntimeControl } = require(
    "../dist/src/runtime/providers/r/protocol/runtimeControlEvents"
);

const main = async function() {
    const published = [];
    let dispatch;
    let finish;
    let sequence = 0;
    const client = {
        execute: function(request, options) {
            dispatch = options.onDispatched;
            return new Promise((resolve) => {
                finish = () => resolve({
                    id: request.id, method: request.method, ok: true,
                    events: [{
                        type: "input", id: "r-input", parent_id: "activity",
                        code: "ask_user()"
                    }]
                });
            });
        }
    };
    const executor = createRVisibleCommandExecutor({
        getClient: () => client,
        createRequestId: (prefix) => prefix + (++sequence),
        resolveParentId: () => "activity",
        onTranscriptEvents: (events) => published.push(...events)
    });
    const execution = executor.executeVisibleCommand(
        { text: "ask_user()", source: "publication-fixture" },
        { providerId: "r", status: "ready" }
    );
    assert.deepEqual(published, [], "Queued input is not yet dispatched");
    dispatch();
    assert.equal(published.length, 1);
    assert.equal(published[0].type, "submitted");
    assert.equal(published[0].parentId, "activity");
    assert.equal(published[0].text, "ask_user()");
    finish();
    const result = await execution;
    const runtimeInput = result.transcriptEvents.find((event) => event.type === "submitted");
    const session = createConsoleSessionState(() => "ready");
    assert.equal(session.getTranscriptEventKey(runtimeInput),
        session.getTranscriptEventKey(published[0]),
        "Runtime confirmation must not duplicate dispatch publication");
    assert.notEqual(session.getTranscriptEventKey({ ...runtimeInput, parentId: "next" }),
        session.getTranscriptEventKey(published[0]),
        "A subsequent execution of identical code remains a separate submission");
    assert.notEqual(session.getTranscriptEventKey({ ...runtimeInput, type: "prompt", id: "one" }),
        session.getTranscriptEventKey({ ...runtimeInput, type: "prompt", id: "two" }),
        "Only input submissions coalesce by activity; prompt identities stay distinct");
    const request = { text: "menu()", source: "live-event-fixture" };
    const stream = {
        type: "stream", id: "choices", parent_id: "activity",
        text: "1: One\n2: Two\n", name: "stdout"
    };
    assert.equal(createLiveTranscriptEventsFromRuntimeControl(
        stream, request, "activity", false
    )[0].id, "choices");
    assert.deepEqual(createLiveTranscriptEventsFromRuntimeControl(
        stream, request, "replacement", false
    ), [], "Late events cannot enter a replacement activity");
    for (const type of ["stream", "completion", "state"]) {
        assert.deepEqual(createLiveTranscriptEventsFromRuntimeControl(
            { ...stream, type }, request, "activity", true
        ), [], "Both hosts retain the journal's accepted delivery barrier");
    }
    assert.equal(createLiveTranscriptEventsFromRuntimeControl(
        { ...stream, type: "prompt", prompt: "Selection:", password: false },
        request, "activity", true
    )[0].id, "choices", "Input waits are not withheld behind producer completion");
    console.log("Shared dispatch publication and runtime confirmation identity checks passed.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
