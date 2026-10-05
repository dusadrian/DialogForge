"use strict";

const assert = require("node:assert/strict");
const { installWebRSharedRuntimeControl } = require("../dist/src/runtime/providers/webr/webRSharedRuntimeControl");
const { createRuntimeOperationQueue } = require("../dist/src/runtime/session/runtimeOperationQueue");

const main = async function() {
    const queue = createRuntimeOperationQueue();
    const messages = [];
    const files = new Map();
    let reader = null;
    let finishEvaluation;
    const writes = [];
    const push = function(message) {
        if (reader) {
            const resolve = reader;
            reader = null;
            resolve(message);
        }
        else {
            messages.push(message);
        }
    };
    const prompt = {
        type: "prompt", id: "prompt_1", parent_id: "hidden-function",
        when: "2026-09-30T00:00:00Z", prompt: "Answer:", password: false
    };
    const runtime = {
        evalRString: async function(command) {
            if (command.includes('runtime_control_source_names("dispatch")')) {
                return "core:runtimePrelude.R\ndispatch:runtimeDispatchCore.R\ndispatch:runtimeConsoleBindings.R";
            }
            return command === "as.character(getRversion())" ? "4.6.0" : "/fixture";
        },
        evalRVoid: async function(command) {
            const path = command.match(/writeChar\(\.payload, ("[^"]+")/);
            if (!path) {
                return;
            }
            const responsePath = JSON.parse(path[1]);
            files.set(responsePath, new TextEncoder().encode(JSON.stringify({
                id: "hidden-function", method: "execute_input", ok: true, events: []
            })));
            push({ type: "dialogforge-runtime-event", data: {
                type: "stream", id: "menu-choices", parent_id: "hidden-function",
                text: "1: One\n2: Two\n", name: "stdout"
            } });
            push({ type: "dialogforge-runtime-event", data: prompt });
            push({ type: "prompt", data: "DIALOGFORGE_PROMPT1:" + JSON.stringify(prompt) });
            await new Promise((resolve) => {
                finishEvaluation = function() {
                    push({ type: "dialogforge-runtime-drain", data: responsePath,
                        responseBytes: files.get(responsePath).byteLength });
                    resolve();
                };
            });
        },
        read: function() {
            if (messages.length) {
                return Promise.resolve(messages.shift());
            }
            assert.equal(reader, null, "Only one worker reader may be outstanding");
            return new Promise((resolve) => { reader = resolve; });
        },
        writeConsole: function(value) {
            writes.push(value);
            const packet = JSON.parse(value);
            push({ type: "dialogforge-prompt-reply", data: {
                id: decodeURIComponent(packet.id), method: "reply_prompt", ok: true, result: true
            } });
            finishEvaluation();
        },
        FS: {
            writeFile: async () => {}, unlink: async () => {},
            readFile: async (path) => files.get(path)
        }
    };
    let reply;
    const liveEvents = [];
    const client = await installWebRSharedRuntimeControl({
        runtime, fetchSource: async () => "", fetchHelperArchive: async () => new Uint8Array(),
        runRuntimeOperation: (action, waitBeforeNext) => queue.run(action, waitBeforeNext),
        runtimeEventReceived: function(event, request, orderedOutput) {
            assert.equal(request.id, "hidden-function");
            assert.equal(orderedOutput, false);
            liveEvents.push(event);
        },
        promptReceived: function(event) {
            assert.deepEqual(liveEvents.map((item) => item.id), ["menu-choices"],
                "Deliver choices before the physical input wait, not the premature R prompt event");
            assert.equal(event.id, prompt.id, "Keep the R identity, not a synthetic manager id");
            reply = client.execute({ id: "reply", method: "reply_prompt", params: {
                parentId: event.parent_id, promptId: event.id, reply: ""
            } });
        }
    });
    let deadline;
    try {
        const result = await Promise.race([
            client.execute({ id: "hidden-function", method: "execute_input", params: {
                code: "ask_user()", parentId: "hidden-function"
            } }),
            new Promise((_, reject) => {
                deadline = setTimeout(() => reject(new Error("Reply joined the blocked worker evaluation queue")), 2000);
            })
        ]);
        assert.equal(result.ok, true);
        assert.equal((await reply).ok, true);
        assert.equal(writes.length, 1);
        assert.equal(decodeURIComponent(JSON.parse(writes[0]).promptId), prompt.id);
    }
    finally {
        clearTimeout(deadline);
        client.detach();
    }
    console.log("Worker channel prompt/acknowledgment handoff passed without command-text guessing or a second reader.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
