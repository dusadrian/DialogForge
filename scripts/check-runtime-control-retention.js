"use strict";

const assert = require("node:assert/strict");
const net = require("node:net");
const { createRuntimeControlClient } = require("../dist/src/runtime/providers/r/protocol/runtimeControlClient");

const withinDeadline = async function(work, label = "response") {
    let deadline;
    try {
        return await Promise.race([
            work,
            new Promise((_, reject) => {
                deadline = setTimeout(() => reject(new Error(`Retention case stalled: ${label}`)), 2000);
            })
        ]);
    } finally {
        clearTimeout(deadline);
    }
};

const withClient = async function(options, check, meta = {}) {
    const requests = new Map();
    const waiters = new Map();
    const sockets = new Set();
    let peer;
    const server = net.createServer((socket) => {
        peer = socket;
        sockets.add(socket);
        let buffer = "";
        socket.setEncoding("utf8");
        socket.on("data", (chunk) => {
            buffer += chunk;
            let boundary;
            while ((boundary = buffer.indexOf("\n")) >= 0) {
                const request = JSON.parse(buffer.slice(0, boundary));
                buffer = buffer.slice(boundary + 1);
                const id = decodeURIComponent(request.id);
                requests.set(id, request);
                waiters.get(id)?.(request);
            }
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const connectionMeta = {
        host: "127.0.0.1", port: server.address().port, ...meta
    };
    const client = createRuntimeControlClient(connectionMeta, options);
    const waitFor = async function(id) {
        if (requests.has(id)) {
            return requests.get(id);
        }
        try {
            return await withinDeadline(new Promise((resolve) => waiters.set(id, resolve)), `dispatch ${id}`);
        } finally {
            waiters.delete(id);
        }
    };
    const write = (message) => peer.write(JSON.stringify(message) + "\n");
    const respond = (id, events) => write({
        id, method: decodeURIComponent(requests.get(id).method), ok: true, events,
        ...(requests.get(id).transportNonce ? {
            transportNonce: decodeURIComponent(requests.get(id).transportNonce)
        } : {})
    });
    try {
        await check({ client, requests, waitFor, write, respond, connectionMeta });
    } finally {
        client.detach();
        for (const socket of sockets) {
            socket.destroy();
        }
        await new Promise((resolve) => server.close(resolve));
    }
};

const main = async function() {
    await withClient({}, async ({ client, waitFor, respond }) => {
        const oversized = await client.execute({
            id: "over-limit", method: "execute_input", params: { code: "x".repeat(4096) }
        });
        assert.equal(oversized.error, "runtime-session-request-too-large");
        const accepted = client.execute({ id: "small", method: "evaluate_code" });
        await waitFor("small");
        respond("small");
        assert.equal((await withinDeadline(accepted)).ok, true);
    }, { boundedInput: "native-v1", maxRequestBytes: 2048 });
    await withClient({}, async ({ client, waitFor, respond, connectionMeta }) => {
        connectionMeta.port = 0;
        connectionMeta.token = "mutated";
        connectionMeta.responseIdentity = "";
        const execution = client.execute({
            id: "snapshot", method: "evaluate_code", transportNonce: "caller-supplied"
        });
        const wire = await waitFor("snapshot");
        assert.equal(decodeURIComponent(wire.auth), "original-token", "Metadata mutation cannot switch wire authentication");
        assert.match(decodeURIComponent(wire.transportNonce), /^[0-9a-f-]{36}:1$/,
            "Caller-supplied nonce cannot replace negotiated ownership");
        respond("snapshot");
        assert.equal((await withinDeadline(execution)).ok, true);
    }, { token: "original-token", responseIdentity: "attachment-request-v1" });
    const attachmentNonces = [];
    for (const failure of ["missing", "foreign", "reused-id"]) {
        await withClient({}, async ({ client, requests, waitFor, write, respond }) => {
            const first = client.execute({ id: "reused", method: "evaluate_code" });
            const original = await waitFor("reused");
            const originalNonce = decodeURIComponent(original.transportNonce);
            assert.match(originalNonce, /^[0-9a-f-]{36}:1$/);
            attachmentNonces.push(originalNonce);
            respond("reused");
            assert.equal((await withinDeadline(first)).ok, true);
            requests.delete("reused");
            const second = client.execute({ id: "reused", method: "evaluate_code" });
            const queued = client.execute({ id: "queued", method: "workspace.snapshot" });
            const next = await waitFor("reused");
            const nextNonce = decodeURIComponent(next.transportNonce);
            assert.notEqual(nextNonce, originalNonce, "Command IDs may be reused without reusing wire ownership");
            write({
                id: "reused", method: "evaluate_code", ok: true,
                ...(failure === "missing" ? {} : {
                    transportNonce: failure === "reused-id" ? originalNonce : "another-attachment:1"
                })
            });
            const [a, b] = await withinDeadline(Promise.all([second, queued]));
            assert.equal(a.error, "runtime-session-response-identity-mismatch");
            assert.equal(a.transportFailure, true);
            assert.equal(b.transportFailure, true);
            assert.equal(requests.has("queued"), false, "Identity rejection cannot dispatch queued work");
        }, { responseIdentity: "attachment-request-v1" });
    }
    assert.equal(new Set(attachmentNonces).size, 3, "Separate clients require distinct attachment identities");

    const identityMeta = {
        responseIdentity: "attachment-request-v1", eventIdentity: "request-nonce-v1"
    };
    const forwarded = [];
    await withClient({ onEvent: (event) => forwarded.push(event) }, async ({ client, waitFor, write, respond }) => {
        const command = client.execute({
            id: "command", method: "execute_input", params: { parentId: "activity" }
        });
        const wire = await waitFor("command");
        const nonce = decodeURIComponent(wire.transportNonce);
        const reply = client.execute({
            id: "reply", method: "reply_prompt", params: { parentId: "activity" }
        });
        await waitFor("reply");
        const prompt = { type: "prompt", id: "prompt-event", parent_id: "activity",
            prompt: "Answer:", password: false, transportNonce: nonce };
        write(prompt);
        respond("reply", [prompt]);
        assert.equal((await withinDeadline(reply)).ok, true, "Nested reply tails may retain the waiting command owner");
        respond("command", [{ type: "completion", parent_id: "activity", transportNonce: nonce }]);
        const result = await withinDeadline(command);
        assert.equal(result.events.length, 2);
        assert.equal(forwarded.length, 1);
        assert.equal(forwarded[0].transportNonce, nonce);
    }, identityMeta);

    for (const failure of ["missing", "foreign", "parent", "numeric-parent", "response-tail", "request-mode"]) {
        const delivered = [];
        await withClient({ onEvent: (event) => delivered.push(event) }, async ({ client, waitFor, write, respond }) => {
            const first = client.execute({
                id: "first", method: failure === "request-mode" ? "evaluate_code" : "execute_input",
                params: { parentId: "activity" }
            });
            const queued = client.execute({ id: "queued", method: "workspace.snapshot" });
            const wire = await waitFor("first");
            const nonce = decodeURIComponent(wire.transportNonce);
            const event = {
                type: "stream", id: "event", parent_id: failure === "parent" ? "other-activity"
                    : failure === "numeric-parent" ? 123 : "activity",
                ...(failure === "missing" ? {} : {
                    transportNonce: failure === "foreign" || failure === "response-tail" ? "foreign:1" : nonce
                }),
                text: "must not reach consumer"
            };
            if (failure === "response-tail") {
                respond("first", [event]);
            } else {
                write(event);
            }
            const [a, b] = await withinDeadline(Promise.all([first, queued]));
            assert.equal(a.transportFailure, true);
            assert.match(a.error, /invalid-event-envelope|event-identity-mismatch|event-request-mode-mismatch/);
            assert.equal(b.transportFailure, true);
            assert.equal(delivered.length, 0, "Validation must precede live delivery");
            assert.equal(a.events.length, 0, "Validation must precede retained event effects");
        }, identityMeta);
    }

    await withClient({ maxOutstandingRequests: 2 }, async ({ client, requests, waitFor, respond }) => {
        const oversize = await client.execute({
            id: "oversize", method: "execute_input", params: { code: "x".repeat(262144) }
        });
        assert.equal(oversize.error, "runtime-session-request-too-large");
        assert.equal(oversize.requestRejected, true);
        assert.equal(oversize.transportFailure, undefined);
        assert.equal(client.getWorkspaceEpoch(), 0, "Rejected admission cannot invalidate workspace");

        const active = client.execute({ id: "active", method: "execute_input" });
        const params = { code: "before" };
        const queued = client.execute({ id: "queued", method: "evaluate_code", params });
        params.code = "after";
        const duplicate = await client.execute({ id: "active", method: "evaluate_code" });
        assert.match(duplicate.error, /duplicate/);
        const overflow = await client.execute({ id: "overflow", method: "evaluate_code" });
        assert.equal(overflow.error, "runtime-session-request-capacity");
        await waitFor("active");
        assert.equal(requests.has("queued"), false);

        const reply = client.execute({ id: "reply", method: "reply_prompt" });
        await waitFor("reply");
        const extraReply = await client.execute({ id: "extra-reply", method: "reply_prompt" });
        assert.equal(extraReply.error, "runtime-session-request-capacity");
        respond("reply");
        assert.equal((await withinDeadline(reply)).ok, true);
        respond("active");
        assert.equal((await withinDeadline(active)).ok, true);
        const wire = await waitFor("queued");
        assert.equal(decodeURIComponent(wire.code), "before", "Admission freezes the wire payload");
        respond("queued");
        assert.equal((await withinDeadline(queued)).ok, true);
        assert.equal(requests.has("oversize"), false);
        assert.equal(requests.has("overflow"), false);
        assert.equal(requests.has("extra-reply"), false);
    });

    await withClient({ maxOutstandingRequests: 1 }, async ({ client, waitFor, respond }) => {
        const timed = client.execute({
            id: "timed", method: "evaluate_code", params: { timeoutMs: 250 }
        });
        await waitFor("timed");
        assert.equal((await withinDeadline(timed)).error, "runtime-session-timeout");
        assert.match((await client.execute({ id: "timed", method: "evaluate_code" })).error, /duplicate/);
        assert.equal((await client.execute({ id: "later", method: "evaluate_code" })).error,
            "runtime-session-request-capacity", "Timeout must retain admission until the late response");
        respond("timed");
        // TCP response processing is observed through a subsequent bounded prompt reply.
        const barrier = client.execute({ id: "barrier", method: "reply_prompt" });
        await waitFor("barrier");
        respond("barrier");
        await withinDeadline(barrier);
        const later = client.execute({ id: "later", method: "evaluate_code" });
        await waitFor("later");
        respond("later");
        assert.equal((await withinDeadline(later)).ok, true);
    });

    await withClient({ maxOutstandingRequests: 2 }, async ({ client, requests, waitFor, respond }) => {
        let deliver;
        const delivery = new Promise((resolve) => { deliver = resolve; });
        const first = client.execute({ id: "first", method: "execute_input" }, {
            waitForResponseDelivery: () => delivery
        });
        const queued = client.execute({ id: "queued", method: "workspace.snapshot" });
        await waitFor("first");
        respond("first");
        assert.equal((await withinDeadline(first)).ok, true, "Wire receipt reaches the output consumer");
        assert.match((await client.execute({ id: "first", method: "execute_input" })).error, /duplicate/,
            "Wire response alone cannot release admission ownership");
        const reply = client.execute({ id: "reply", method: "reply_prompt" });
        await waitFor("reply");
        respond("reply");
        await withinDeadline(reply);
        assert.equal(requests.has("queued"), false, "Queued work waits for explicit response delivery");
        deliver();
        await waitFor("queued");
        respond("queued");
        assert.equal((await withinDeadline(queued)).ok, true);
    });

    await withClient({ maxOutstandingRequests: 2 }, async ({ client, requests, waitFor, respond }) => {
        const timed = client.execute({ id: "timed", method: "evaluate_code", params: { timeoutMs: 250 } });
        const queued = client.execute({ id: "queued", method: "workspace.snapshot" });
        await waitFor("timed");
        assert.equal((await withinDeadline(timed)).error, "runtime-session-timeout");
        const reply = client.execute({ id: "reply", method: "reply_prompt" });
        await waitFor("reply");
        respond("reply");
        await withinDeadline(reply);
        assert.equal(requests.has("queued"), false, "Timeout does not cancel R or release its queue owner.");
        respond("timed");
        await waitFor("queued");
        respond("queued");
        assert.equal((await withinDeadline(queued)).ok, true);
    });

    for (const retirement of ["failed", "detached"]) {
        await withClient({}, async ({ client, requests, waitFor, respond }) => {
            let release;
            let rejectDelivery;
            const delivery = new Promise((resolve, reject) => {
                release = resolve;
                rejectDelivery = reject;
            });
            const first = client.execute({ id: "first", method: "execute_input" }, {
                waitForResponseDelivery: () => delivery
            });
            const queued = client.execute({ id: "queued", method: "workspace.snapshot" });
            await waitFor("first");
            respond("first");
            await withinDeadline(first);
            if (retirement === "failed") {
                rejectDelivery(new Error("Synthetic consumer failure"));
            } else {
                client.detach();
                release();
            }
            const result = await withinDeadline(queued);
            assert.equal(result.transportFailure, true);
            assert.equal(result.error, retirement === "failed"
                ? "runtime-session-response-delivery-failed" : "runtime-session-detached");
            assert.equal(requests.has("queued"), false, "Failed/retired delivery cannot dispatch queued work");
        });
    }

    for (const overflow of ["count", "bytes", "response", "combined"]) {
        await withClient({
            maxRetainedEvents: 2,
            maxRetainedEventBytes: overflow === "bytes" ? 120 : 4096
        }, async ({ client, waitFor, write, respond }) => {
            const first = client.execute({
                id: "first", method: "execute_input", params: { parentId: "activity" }
            });
            const queued = client.execute({ id: "queued", method: "workspace.snapshot" });
            await waitFor("first");
            const event = { type: "stream", parent_id: "activity", text: "partial" };
            if (overflow === "response") {
                respond("first", [event, event, event]);
            } else if (overflow === "combined") {
                write(event);
                respond("first", [event, event]);
            } else {
                write(event);
                write({ ...event, text: overflow === "bytes" ? "x".repeat(121) : "second" });
                if (overflow === "count") {
                    write(event);
                }
            }
            const [a, b] = await withinDeadline(Promise.all([first, queued]));
            assert.equal(a.error, "runtime-session-event-retention-limit");
            assert.equal(a.transportFailure, true);
            assert.equal(a.events.length, overflow === "response" ? 0 : overflow === "count" ? 2 : 1);
            assert.equal(b.transportFailure, true);
            assert.equal((await client.execute({ id: "after", method: "evaluate_code" })).error,
                "runtime-session-detached", "Retention overflow must not replay commands");
        });
    }
    console.log("Native request admission and retained-event bounds passed; rendered acceptance remains separate.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
