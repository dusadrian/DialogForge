"use strict";

const assert = require("node:assert/strict");
const { createWebRPromptTransport, readWebRPromptEvent } = require("../dist/src/runtime/providers/webr/webRPromptTransport");
const { createTranscriptEventsFromRuntimeControl } = require("../dist/src/runtime/providers/r/protocol/runtimeControlEvents");

const event = {
    type: "prompt", id: "prompt_12", parent_id: "activity",
    prompt: "", password: false, when: "2026-09-30T00:00:00Z"
};
const envelope = "DIALOGFORGE_PROMPT1:" + JSON.stringify(event);
const request = (id, fields = {}) => ({
    id, method: "reply_prompt",
    params: { parentId: event.parent_id, promptId: event.id, reply: "", ...fields }
});

const main = async function() {
    assert.deepEqual(readWebRPromptEvent(envelope), event);
    assert.equal(readWebRPromptEvent("> "), null);
    assert.throws(() => readWebRPromptEvent("DIALOGFORGE_PROMPT1:{}"));
    for (const source of ["native.r", "browser.webr"]) {
        const projected = createTranscriptEventsFromRuntimeControl(
            [event], { text: "", source }, event.parent_id
        );
        assert.equal(projected[0].id, event.id);
        assert.equal(projected[0].parentId, event.parent_id);
        assert.equal(projected[0].prompt, "");
        assert.equal(projected[0].password, false);
    }

    const writes = [];
    const transport = createWebRPromptTransport({ writeConsole: (value) => { writes.push(value); } });
    assert.equal((await transport.send(request("unowned"))).ok, false);
    assert.equal(writes.length, 0, "No console input may be written outside a worker input wait");
    transport.receivePrompt(envelope);
    let resolved = false;
    const pending = transport.send(request("first")).then((value) => { resolved = true; return value; });
    await Promise.resolve();
    assert.equal(resolved, false, "A write is not R acceptance");
    const wire = JSON.parse(writes[0]);
    assert.equal(decodeURIComponent(wire.promptId), event.id);
    assert.equal(decodeURIComponent(wire.parentId), event.parent_id);
    assert.equal(decodeURIComponent(wire.reply), "");
    assert.equal((await transport.send(request("duplicate"))).ok, false);
    assert.equal(writes.length, 1);
    transport.receive({ id: "foreign", method: "reply_prompt", ok: true });
    await Promise.resolve();
    assert.equal(resolved, false);
    transport.receive({ id: "first", method: "reply_prompt", ok: true, result: true });
    assert.equal((await pending).ok, true);

    transport.receivePrompt(envelope);
    const rejected = transport.send(request("rejected", { promptId: "retired" }));
    transport.receive({ id: "rejected", method: "reply_prompt", ok: false, error: "prompt-instance-mismatch" });
    assert.equal((await rejected).ok, false, "R rejection is preserved");
    transport.receivePrompt(envelope);
    const retired = transport.send(request("retired"));
    transport.retire();
    assert.equal((await retired).transportFailure, true);
    transport.receive({ id: "retired", method: "reply_prompt", ok: true });
    assert.equal((await transport.send(request("after-stop"))).ok, false);

    const timeout = createWebRPromptTransport({ writeConsole() {} });
    timeout.receivePrompt(envelope);
    assert.equal((await timeout.send(request("timeout", { timeoutMs: 1 }))).transportFailure, true);
    timeout.retire();

    const stalled = createWebRPromptTransport({ writeConsole: () => new Promise(() => {}) });
    stalled.receivePrompt(envelope);
    assert.equal((await stalled.send(request("stalled", { timeoutMs: 1 }))).transportFailure, true);
    stalled.retire();

    const failed = createWebRPromptTransport({ writeConsole() { throw new Error("write failed"); } });
    failed.receivePrompt(envelope);
    assert.equal((await failed.send(request("write-failed"))).transportFailure, true);
    failed.retire();

    console.log("Worker prompt envelope and acknowledgment cases passed; shared R validation is checked separately.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
