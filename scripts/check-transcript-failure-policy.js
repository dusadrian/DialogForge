"use strict";

const assert = require("node:assert/strict");
const {
    isTranscriptFailureEvent,
    transcriptHasFailure,
    commandExecutionDidNotSucceed
} = require("../dist/src/runtime/commands/commandProtocol");

const event = function(type, state) {
    return {
        type,
        state,
        commandKind: "commands.visible",
        source: "failure-policy.fixture",
        text: "probe()",
        createdAt: "2026-09-29T00:00:00.000Z"
    };
};

for (const failed of [
    event("failed"),
    event("rejected"),
    event("error"),
    event("completed", "error")
]) {
    assert.equal(isTranscriptFailureEvent(failed), true);
    assert.equal(transcriptHasFailure([failed]), true);
    assert.equal(transcriptHasFailure([
        event("submitted"), failed, event("completed", "idle")
    ]), true, "Later success must not hide an earlier failure.");
}

assert.equal(transcriptHasFailure([]), false);
assert.equal(transcriptHasFailure([
    event("submitted"),
    { ...event("stream"), streamName: "stderr", text: "Diagnostic output" },
    event("warning"),
    event("completed", "idle")
]), false, "Diagnostic streams and warnings are not execution failures.");
assert.equal(isTranscriptFailureEvent(event("completed", "interrupted")), false,
    "Interruption remains a distinct execution outcome.");
for (const type of ["state", "completed"]) {
    const interrupted = event(type, "interrupted");
    assert.equal(transcriptHasFailure([interrupted]), false,
        "An interrupted state does not fabricate a transcript error.");
    for (const hasTranscriptFailure of [undefined, () => false]) {
        assert.equal(commandExecutionDidNotSucceed({
            transcriptEvents: [interrupted, event("completed", "idle")]
        }, hasTranscriptFailure), true,
        "Without evaluation metadata, interruption still prevents success; later idle cannot hide it.");
    }
}

const { createRuntimeStartupTaskExecutionController } = require(
    "../dist/src/runtime/startup/runtimeStartupTaskExecutionController"
);
const checkStartupOutcomes = async function() {
    for (const state of ["idle", "error", "interrupted"]) {
        const controller = createRuntimeStartupTaskExecutionController({
            checkDependencies: async () => { throw Error("Unexpected dependency check"); },
            listWorkspaceObjects: async () => { throw Error("Unexpected workspace refresh"); },
            executeVisibleCommand: async () => [event("completed", state)],
            executeInvisibleQuery: async () => { throw Error("Unexpected hidden command"); },
            recordRuntimeEvent() {}
        });
        const result = await controller.execute("r", {
            id: "outcome-fixture", commands: [{ text: "probe()", visibility: "visible" }]
        }, { taskId: "outcome-fixture", source: "startup-outcome.fixture" });
        assert.equal(result.status, state === "idle" ? "ready" : "failed",
            "A shared startup consumer must not report interrupted work as ready.");
        if (state === "interrupted") {
            assert.ok(result.message.includes("did not complete successfully"));
            assert.ok(!result.message.includes("Executed startup command"));
        }
    }
};
checkStartupOutcomes().then(() => {
    console.log("Shared transcript failure, interruption and startup outcome policy checks passed.");
}).catch(error => { console.error(error); process.exitCode = 1; });
