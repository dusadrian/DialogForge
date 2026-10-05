"use strict";

const assert = require("node:assert/strict");
const net = require("node:net");
const { EventEmitter } = require("node:events");
const { createRuntimeControlClient } = require("../dist/src/runtime/providers/r/protocol/runtimeControlClient");

const boundedWait = async function(work) {
    let timer;
    try {
        return await Promise.race([work, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Write fixture stalled")), 2000);
        })]);
    } finally {
        clearTimeout(timer);
    }
};

const withSocket = async function(check, writeTimeoutMs = 1000) {
    const original = net.createConnection;
    const socket = new EventEmitter();
    const writes = [];
    const callbacks = [];
    const waiters = new Map();
    socket.destroyed = false;
    socket.setNoDelay = () => {};
    socket.unref = () => {};
    socket.destroy = () => {
        if (!socket.destroyed) {
            socket.destroyed = true;
            queueMicrotask(() => socket.emit("close"));
        }
    };
    socket.write = (frame, callback) => {
        const encoded = JSON.parse(frame);
        const request = { id: decodeURIComponent(encoded.id), method: decodeURIComponent(encoded.method) };
        writes.push(request);
        callbacks.push(callback);
        waiters.get(writes.length)?.();
        return false; // Backpressure: acceptance is not write completion.
    };
    net.createConnection = (_options, connected) => {
        queueMicrotask(connected);
        return socket;
    };
    const client = createRuntimeControlClient({ host: "unused", port: 1 }, { writeTimeoutMs });
    const waitForWrites = async (count) => {
        if (writes.length < count) {
            await boundedWait(new Promise((resolve) => waiters.set(count, resolve)));
        }
    };
    const respond = (index) => socket.emit("data", Buffer.from(JSON.stringify({
        ...writes[index], ok: true
    }) + "\n"));
    try {
        await check({ client, socket, writes, callbacks, waitForWrites, respond });
    } finally {
        client.detach();
        net.createConnection = original;
    }
};

const main = async function() {
    await withSocket(async ({ client, writes, callbacks, waitForWrites, respond }) => {
        const first = client.execute({ id: "first", method: "execute_input" });
        let nextDispatched = false;
        const next = client.execute({ id: "next", method: "workspace.snapshot" }, {
            onDispatched: () => { nextDispatched = true; }
        });
        await waitForWrites(1);
        respond(0);
        assert.equal((await boundedWait(first)).ok, true);
        assert.equal(writes.length, 1, "Response alone cannot bypass a pending write");
        assert.equal(nextDispatched, false);
        callbacks[0]();
        await waitForWrites(2);
        callbacks[1]();
        respond(1);
        assert.equal((await boundedWait(next)).ok, true);
    });
    for (const failure of ["deadline", "callback", "detach", "end", "error", "close"]) {
        await withSocket(async ({ client, socket, writes, callbacks, waitForWrites }) => {
            const first = client.execute({ id: "first", method: "execute_input" });
            const queued = client.execute({ id: "queued", method: "workspace.snapshot" });
            await waitForWrites(1);
            if (failure === "callback") {
                callbacks[0](new Error("Synthetic write failure"));
            } else if (failure === "detach") {
                client.detach();
            } else if (failure === "end") {
                socket.emit("end");
            } else if (failure === "error") {
                socket.emit("error", new Error("Synthetic socket error"));
            } else if (failure === "close") {
                socket.destroy();
            }
            const [a, b] = await boundedWait(Promise.all([first, queued]));
            assert.equal(a.transportFailure, true);
            assert.equal(b.transportFailure, true);
            assert.equal(a.error, {
                deadline: "runtime-session-write-timeout",
                callback: "runtime-session-write-failed",
                detach: "runtime-session-detached",
                end: "runtime-session-socket-ended",
                error: "runtime-session-socket-error",
                close: "runtime-session-socket-closed"
            }[failure]);
            callbacks[0]();
            assert.equal(writes.length, 1, "Late write completion must not revive queued work");
            assert.equal((await client.execute({ id: "after", method: "evaluate_code" })).transportFailure, true);
        }, 30);
    }
    console.log("Native write gating/deadline cases passed; real socket and R producer acceptance remains separate.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
