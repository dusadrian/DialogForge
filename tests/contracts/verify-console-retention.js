"use strict";

const assert = require("assert");

const {
    createConsoleSessionState
} = require("../../shared/console/services/consoleSessionState");
const {
    createConsoleTranscriptService
} = require("../../shared/console/services/consoleTranscriptService");
const {
    ActivityItemInput,
    ActivityItemInputState
} = require("../../shared/console/services/consoleRuntimeItems");

const verifyTranscriptPrunesOldActivities = function() {
    const transcript = createConsoleTranscriptService({
        maxRuntimeActivities: 3
    });

    for (let index = 0; index < 5; index += 1) {
        transcript.recordRuntimeMessageStream({
            id: `stream_${index}`,
            parent_id: `activity_${index}`,
            text: `output ${index}`
        });
    }

    const items = transcript.getRuntimeItems();

    assert.strictEqual(items.length, 3);
    assert.deepStrictEqual(items.map((item) => item.id), [
        "activity_2",
        "activity_3",
        "activity_4"
    ]);
};

const verifyTranscriptKeepsActivePromptWhilePruning = function() {
    const transcript = createConsoleTranscriptService({
        maxRuntimeActivities: 2
    });

    transcript.recordRuntimeMessagePrompt({
        id: "prompt_0",
        parent_id: "activity_0",
        prompt: "Continue?"
    });

    for (let index = 1; index < 4; index += 1) {
        transcript.recordRuntimeMessageStream({
            id: `stream_${index}`,
            parent_id: `activity_${index}`,
            text: `output ${index}`
        });
    }

    const items = transcript.getRuntimeItems();

    assert.strictEqual(items.length, 2);
    assert.ok(items.some((item) => item.id === "activity_0"));
    assert.ok(items.some((item) => item.id === "activity_3"));
    assert.strictEqual(transcript.getActiveRequest().activityId, "activity_0");
};

const verifyTranscriptRecordsBlankPromptInput = function() {
    const transcript = createConsoleTranscriptService({
        maxRuntimeActivities: 3
    });

    transcript.recordBlankInput("");

    const items = transcript.getRuntimeItems();

    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].activityItems.length, 1);
    assert.ok(items[0].activityItems[0] instanceof ActivityItemInput);
    assert.strictEqual(items[0].activityItems[0].state, ActivityItemInputState.Completed);
    assert.strictEqual(items[0].activityItems[0].inputPrompt, "> ");
    assert.strictEqual(items[0].activityItems[0].code, "");
};

const verifySessionDedupeStateIsBounded = function() {
    const sessionState = createConsoleSessionState(() => "ready");

    for (let index = 0; index < 2001; index += 1) {
        sessionState.rememberTranscriptEvent(`event_${index}`);
    }

    assert.strictEqual(sessionState.hasTranscriptEvent("event_0"), false);
    assert.strictEqual(sessionState.hasTranscriptEvent("event_1"), true);
    assert.strictEqual(sessionState.hasTranscriptEvent("event_2000"), true);

    const firstActivityId = sessionState.getActivityId({
        commandKind: "command",
        source: "console",
        text: "first"
    });

    for (let index = 0; index < 2001; index += 1) {
        sessionState.getActivityId({
            commandKind: "command",
            source: "console",
            text: `command ${index}`
        });
    }

    assert.notStrictEqual(sessionState.getActivityId({
        commandKind: "command",
        source: "console",
        text: "first"
    }), firstActivityId);
};

verifyTranscriptPrunesOldActivities();
verifyTranscriptKeepsActivePromptWhilePruning();
verifyTranscriptRecordsBlankPromptInput();
verifySessionDedupeStateIsBounded();

console.log("Console retention bounds verified.");
