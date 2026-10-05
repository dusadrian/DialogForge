"use strict";

const assert = require("node:assert/strict");
const { createConsoleTranscriptService } = require(
    "../dist/src/console/services/consoleTranscriptService"
);
const { createConsoleVisibleCommandController } = require(
    "../dist/src/console/renderer/consoleVisibleCommandController"
);
const { createConsoleEditorSubmissionController } = require(
    "../dist/src/console/terminal/consoleEditorSubmissionController"
);

const main = async function() {
    let acceptReply;
    const transcript = createConsoleTranscriptService({
        submitRequestReply: () => new Promise((resolve) => {
            acceptReply = resolve;
        })
    });
    transcript.recordRuntimeMessageInput({
        parent_id: "old", id: "input", code: "readline()"
    });
    transcript.recordRuntimeMessagePrompt({
        parent_id: "old", id: "prompt", prompt: "Old: "
    });
    const reply = transcript.replyToPrompt("old reply");
    transcript.retireRuntimeActivities();
    assert.equal(transcript.getActiveRequest(), null);
    assert.equal(transcript.getRuntimeItems().length, 1, "History is retained");
    transcript.recordRuntimeMessagePrompt({
        parent_id: "new", id: "new-prompt", prompt: "New: "
    });
    acceptReply();
    assert.equal(await reply, false);
    assert.equal(transcript.getActiveRequest().promptId, "new-prompt");
    assert.equal(transcript.getRuntimeItems()[0].activityItems[0].state, "cancelled");

    const completions = [];
    const busyStates = [];
    const visible = createConsoleVisibleCommandController({
        getSession: () => ({ status: "ready" }),
        startSession: async () => ({ status: "ready" }),
        renderStatus: () => {},
        recordHistory: () => {},
        registerCompletionInput: () => {},
        setRuntimeBusy: (busy) => busyStates.push(busy),
        executeCommand: () => new Promise((resolve) => completions.push(resolve))
    });
    const oldCommand = visible.executeText("old()", "fixture");
    visible.retire();
    const newCommand = visible.executeText("new()", "fixture");
    completions[0]();
    assert.equal(await oldCommand, undefined);
    assert.deepEqual(busyStates, [true, true], "Retired completion cannot clear replacement busy state");
    completions[1]();
    assert.equal(await newCommand, "ok");
    assert.deepEqual(busyStates, [true, true, false]);

    const acceptedReceipt = visible.executeWithReceipt("receipt()", "fixture");
    const commandResult = [{ type: "failed", message: "Caller must inspect this result" }];
    completions[2](commandResult);
    assert.deepEqual(await acceptedReceipt, { accepted: true, result: commandResult });
    const retiredReceipt = visible.executeWithReceipt("retired_receipt()", "fixture");
    visible.retire();
    completions[3](commandResult);
    assert.deepEqual(await retiredReceipt, { accepted: false },
        "Retired execution must not expose its result to package workflows.");
    assert.deepEqual(await visible.executeWithReceipt(" ", "fixture"), { accepted: false });

    let finishSubmission;
    let input = "old()";
    const editor = createConsoleEditorSubmissionController({
        hasModel: () => true,
        isInteractive: () => true,
        getSessionPhase: () => "ready",
        getInputValue: () => input,
        setInputValue: (value) => { input = value; },
        clearInput: () => { input = ""; },
        requestFocus: () => {},
        requestPromptFocus: () => {},
        refreshInteractivity: () => {},
        refreshPrompt: () => {},
        checkFragment: async () => "complete",
        executeCode: () => new Promise((resolve) => { finishSubmission = resolve; })
    });
    const submission = editor.submit();
    await Promise.resolve();
    assert.equal(editor.isBusy(), true);
    editor.retire();
    input = "replacement input";
    finishSubmission("incomplete");
    await submission;
    assert.equal(input, "replacement input", "Retired incomplete result cannot restore old code");
    assert.equal(editor.isBusy(), false);
    assert.equal(editor.isSubmitting(), false);
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
