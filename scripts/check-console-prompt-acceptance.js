"use strict";

const assert = require("node:assert/strict");
const { createConsoleTranscriptService } = require("../dist/src/console/services/consoleTranscriptService");
const { ActivityItemPromptState } = require("../dist/src/console/services/consoleRuntimeItems");

const main = async function() {
    const submissions = [];
    let accept;
    let reject;
    const transcript = createConsoleTranscriptService({
        submitRequestReply: (reply, request) => {
            submissions.push({ reply, request });
            return new Promise((resolve, fail) => { accept = resolve; reject = fail; });
        }
    });
    const prompt = (id, password = false) => {
        transcript.recordRuntimeMessagePrompt({ id, parent_id: "activity", prompt: "", password });
        return transcript.getRuntimeItems()[0].activityItems.at(-1);
    };
    const first = prompt("first");
    const pending = transcript.replyToPrompt("retry me");
    assert.equal(first.state, ActivityItemPromptState.Unanswered);
    assert.equal(transcript.getActiveRequest().promptId, "first");
    assert.equal(await transcript.replyToPrompt("duplicate"), false);
    assert.equal(submissions.length, 1);
    reject(new Error("secret provider failure"));
    assert.equal(await pending, false);
    assert.equal(first.state, ActivityItemPromptState.Unanswered);
    assert.equal(first.answer, "");
    assert.equal(transcript.getActiveRequest().promptId, "first");
    const stream = transcript.getRuntimeItems()[0].activityItems.at(-1);
    assert.ok(stream.outputLines.join("\n").includes("Prompt reply was not accepted"));
    assert.ok(!stream.outputLines.join("\n").includes("secret"));

    const retry = transcript.replyToPrompt("");
    assert.equal(submissions.at(-1).reply, "");
    accept();
    assert.equal(await retry, true);
    assert.equal(first.state, ActivityItemPromptState.Answered);
    assert.equal(transcript.getActiveRequest(), null);

    const protectedPrompt = prompt("password", true);
    const password = transcript.replyToPrompt("private answer");
    accept();
    assert.equal(await password, true);
    assert.equal(protectedPrompt.answer, "");

    const older = prompt("older");
    const olderReply = transcript.replyToPrompt("old answer");
    const newer = prompt("newer");
    accept();
    assert.equal(await olderReply, false);
    assert.equal(older.state, ActivityItemPromptState.Answered);
    assert.equal(newer.state, ActivityItemPromptState.Unanswered);
    assert.equal(transcript.getActiveRequest().promptId, "newer");

    const interrupted = transcript.replyToPrompt("late answer");
    transcript.recordRuntimeMessageState({ parent_id: "activity", state: "interrupted" });
    accept();
    assert.equal(await interrupted, false);
    assert.equal(newer.state, ActivityItemPromptState.Interrupted);
    assert.equal(newer.answer, "");

    const cleared = prompt("clear");
    const clearedReply = transcript.replyToPrompt("discard");
    transcript.clear();
    accept();
    assert.equal(await clearedReply, false);
    assert.equal(cleared.state, ActivityItemPromptState.Unanswered);
    assert.deepEqual(transcript.getRuntimeItems(), []);

    const missingSender = createConsoleTranscriptService();
    missingSender.recordRuntimeMessagePrompt({ id: "missing", parent_id: "activity" });
    assert.equal(await missingSender.replyToPrompt("test"), false);
    assert.equal(missingSender.getActiveRequest().promptId, "missing");
    console.log("Console prompt acceptance: pending, rejection/retry, blank/password and retired responses.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
