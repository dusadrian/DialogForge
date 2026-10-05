"use strict";

const assert = require("node:assert/strict");
const previousJournal = global.dialogForgeRuntimeDiagnostics;
const journal = {
    enabled: true, dropped: 0, entries: [],
    clear: function() { this.entries.length = 0; this.dropped = 0; }
};
global.dialogForgeRuntimeDiagnostics = journal;
const { createRuntimeControlDiagnostics } = require("../dist/src/runtime/providers/r/protocol/runtimeControlDiagnostics");
const { createWebRPromptTransport } = require("../dist/src/runtime/providers/webr/webRPromptTransport");
const { createROrderedOutputDelivery } = require("../dist/src/runtime/providers/r/controllers/rOrderedOutputDelivery");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");

const main = async function() {
    try {
        const phasesByHost = [];
        for (const host of ["native", "webr"]) {
            journal.clear();
            const diagnostics = createRuntimeControlDiagnostics(host);
            const request = diagnostics.prepare({
                id: "request", method: "execute_input",
                params: { parentId: "activity", code: "PRIVATE_COMMAND", reply: "PRIVATE_REPLY" }
            });
            const events = [
                { id: "stream", type: "stream", text: "PRIVATE_OUTPUT" },
                { id: "prompt", type: "prompt", prompt: "PRIVATE_PROMPT" },
                { id: "completion", type: "completion", workspaceReconciliation: "unchanged" }
            ];
            diagnostics.receiveResponse(request, {
                diagnostics: [
                    { phase: "request.finished", ms: 5, count: 0 },
                    { phase: "invalid phase PRIVATE", ms: 6, count: 1 },
                    { phase: "bad.number", ms: Infinity, count: 1 }
                ],
                events
            }, 123);
            diagnostics.receiveEvent(request, events[0]);
            assert.equal(journal.entries.find((entry) => entry.phase === "response.received").count, 123);
            assert.equal(journal.entries.filter((entry) => entry.phase === "output.received").length, 1);
            assert.ok(journal.entries.some((entry) => entry.phase === "event.duplicate_delivery"));
            assert.ok(journal.entries.some((entry) => entry.phase === "request.finished" && entry.clock === "r"));
            assert.ok(journal.entries.some((entry) => entry.phase === "workspace.unchanged"));
            assert.equal(JSON.stringify(journal.entries).includes("PRIVATE"), false);
            phasesByHost.push(journal.entries.map(({ phase, count, clock }) => ({ phase, count, clock })));
        }
        assert.deepEqual(phasesByHost[0], phasesByHost[1]);

        for (const host of ["native", "webr"]) {
            journal.clear();
            const diagnostics = createRuntimeControlDiagnostics(host);
            const request = { id: "bounded", method: "workspace.snapshot",
                params: { code: "PRIVATE_COMMAND", reply: "PRIVATE_REPLY",
                    token: "PRIVATE_TOKEN", path: "PRIVATE_PATH" } };
            for (let index = 0; index < 4109; index++) {
                diagnostics.record(request, "request.queued", index);
            }
            assert.equal(journal.entries.length, 4096);
            assert.equal(journal.dropped, 13);
            assert.equal(journal.entries[0].count, 13);
            assert.equal(journal.entries.at(-1).count, 4108);
            assert.ok(journal.entries.every((entry, index, entries) => index === 0
                || entry.sequence > entries[index - 1].sequence));
            assert.equal(JSON.stringify(journal.entries).includes("PRIVATE"), false);

            journal.clear();
            for (let index = 0; index < 4097; index++) {
                diagnostics.receiveEvent(request, { id: "event-" + index,
                    type: "stream", text: "PRIVATE_OUTPUT" });
            }
            journal.clear();
            diagnostics.receiveEvent(request, { id: "event-0", type: "stream" });
            diagnostics.receiveEvent(request, { id: "event-4096", type: "stream" });
            assert.equal(journal.entries.filter(entry => entry.phase === "output.received").length, 1,
                "Only the evicted oldest event identity becomes eligible again.");
            assert.equal(journal.entries.filter(entry => entry.phase === "event.duplicate_delivery").length, 1);

            journal.clear();
            journal.enabled = false;
            try {
                assert.equal(diagnostics.prepare(request), request,
                    "Disabled diagnostics must not decorate the request.");
                diagnostics.record(request, "request.queued");
                diagnostics.receiveResponse(request, { events: [
                    { id: "disabled", type: "stream", text: "PRIVATE_OUTPUT" }
                ] });
                assert.deepEqual(journal.entries, []);
                assert.equal(journal.dropped, 0);
            }
            finally {
                journal.enabled = true;
            }
        }

        for (const closeRejects of [false, true]) {
            journal.clear();
            let finishClose;
            let closeStarted;
            const closeBegan = new Promise(resolve => { closeStarted = resolve; });
            const close = new Promise(resolve => { finishClose = resolve; });
            const bytes = new Uint8Array(21);
            bytes.set(new TextEncoder().encode("DFOUT001"));
            new DataView(bytes.buffer).setBigUint64(9, 1n);
            const delivery = createROrderedOutputDelivery({
                sessionId: "capture-session", parentId: "activity",
                request: createVisibleCommandRequest({ text: "PRIVATE_COMMAND" }),
                isCurrent: () => true,
                transport: {
                    inspect: async () => ({ identity: "PRIVATE_PATH", size: bytes.length }),
                    read: async (offset, length) => bytes.slice(offset, offset + length),
                    close: async () => {
                        closeStarted();
                        await close;
                        if (closeRejects) {
                            throw Error("PRIVATE_CLOSE_DETAIL");
                        }
                    }
                }
            });
            const finishing = delivery.finish({
                id: "response", method: "execute_input", ok: true,
                result: { sessionId: "capture-session", parentId: "activity",
                    captureStatus: "sealed", outputSequence: 1 },
                events: [{ type: "completion", parent_id: "activity", state: "idle" }]
            });
            await closeBegan;
            assert.deepEqual(journal.entries.map(entry => entry.phase), ["output.delivery_started"],
                "A raw seal cannot log delivery acceptance before close finishes.");
            finishClose();
            await finishing;
            assert.deepEqual(journal.entries.map(entry => entry.phase), [
                "output.delivery_started", closeRejects ? "output.delivery_failed"
                    : "output.delivery_accepted", "output.delivery_finished"
            ]);
            assert.ok(journal.entries.every(entry => entry.activity === "activity"
                && entry.method === "runtime.output_delivery" && entry.clock === "javascript"));
            assert.equal(JSON.stringify(journal.entries).includes("PRIVATE"), false);
        }

        journal.clear();
        const diagnostics = createRuntimeControlDiagnostics("webr");
        let received = 0;
        let dispatched = 0;
        const prompt = createWebRPromptTransport({ writeConsole: () => {} }, (request, response) => {
            received += 1;
            diagnostics.receiveResponse(request, response);
        });
        const options = { onDispatched: () => { dispatched += 1; } };
        const rejected = await prompt.send({ id: "not-waiting", method: "reply_prompt" }, options);
        assert.equal(rejected.requestRejected, true);
        assert.equal(dispatched, 0, "A rejected reply must not start a dispatch deadline.");
        assert.equal(received, 0);
        prompt.receivePrompt("DIALOGFORGE_PROMPT1:" + JSON.stringify({
            type: "prompt", id: "prompt", parent_id: "activity", prompt: "Answer:", password: false
        }));
        const response = prompt.send({ id: "reply", method: "reply_prompt" }, options);
        assert.equal(dispatched, 1);
        prompt.receive({ id: "reply", method: "reply_prompt", ok: true,
            diagnostics: [{ phase: "request.finished", ms: 5, count: 0 }] });
        assert.equal((await response).ok, true);
        assert.equal(received, 1);
        assert.ok(journal.entries.some((entry) => entry.phase === "request.finished"));
        prompt.retire();
    } finally {
        global.dialogForgeRuntimeDiagnostics = previousJournal;
    }
    console.log("Shared response diagnostic cases passed; actual dual-host prompt tracing remains open.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
