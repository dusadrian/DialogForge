"use strict";

const assert = require("node:assert/strict");
const { createRuntimeSessionManager } = require("../dist/src/runtime/session/runtimeSessionManager");
const { createVisibleCommandRequest, createTranscriptEvent } = require("../dist/src/runtime/commands/commandProtocol");

const main = async function() {
    const started = [];
    const releases = new Map();
    const manager = createRuntimeSessionManager({
        manifest: { id: "queue", capabilities: ["commands.visible"] },
        createSession: () => ({ providerId: "queue", status: "not-started" }),
        commandController: {
            executeVisibleCommand: async function(request) {
                started.push(request.text);
                await new Promise((resolve) => releases.set(request.text, resolve));
                return {
                    transcriptEvents: [createTranscriptEvent("completed", request)],
                    evaluationOutcome: "success",
                    workspaceUpdate: null,
                    workspaceReconciliation: "unchanged"
                };
            }
        }
    });
    const execute = (text) => manager.executeVisibleCommandWithEffects(
        createVisibleCommandRequest({ text, source: "queue-fixture" })
    );
    const waitForStart = async function(text) {
        for (let attempt = 0; attempt < 30; attempt += 1) {
            if (started.includes(text)) {
                return;
            }
            await Promise.resolve();
        }
        assert.fail(`Command did not start: ${text}`);
    };

    await manager.start();
    const first = execute("first");
    const second = execute("second");
    assert.deepEqual(started, ["first"]);
    releases.get("first")();
    await first;
    await waitForStart("second");
    releases.get("second")();
    assert.equal((await second).executionDisposition, "completed");

    const retiredRunning = execute("retired running");
    await waitForStart("retired running");
    const retiredQueued = execute("retired queued");
    await manager.stop();
    assert.equal((await retiredQueued).executionDisposition, "not_started");
    assert.ok(!started.includes("retired queued"));
    await manager.start();
    const replacement = execute("replacement");
    await waitForStart("replacement");
    const replacementQueued = execute("replacement queued");
    releases.get("retired running")();
    const retiredResult = await retiredRunning;
    assert.equal(retiredResult.executionDisposition, "session_lost");
    assert.equal(retiredResult.workspaceUpdate, null);
    assert.ok(!started.includes("replacement queued"),
        "A retired completion cannot release the replacement's execution owner");
    releases.get("replacement")();
    await replacement;
    await waitForStart("replacement queued");
    releases.get("replacement queued")();
    await replacementQueued;
    await manager.stop();
    console.log("Visible queue: FIFO dispatch, queued retirement and replacement ownership.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
