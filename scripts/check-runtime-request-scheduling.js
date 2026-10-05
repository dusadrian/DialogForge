"use strict";

const assert = require("node:assert/strict");
const net = require("node:net");
const { createRuntimeControlClient } = require("../dist/src/runtime/providers/r/protocol/runtimeControlClient");

const main = async function() {
    const received = [];
    const dispatched = [];
    const waiters = new Map();
    const sockets = new Set();
    let client;
    let peer;
    let receiveStream;
    const server = net.createServer((socket) => {
        sockets.add(socket);
        peer = socket;
        let buffer = "";
        socket.setEncoding("utf8");
        socket.on("data", (chunk) => {
            buffer += chunk;
            let boundary;
            while ((boundary = buffer.indexOf("\n")) >= 0) {
                const request = JSON.parse(buffer.slice(0, boundary));
                buffer = buffer.slice(boundary + 1);
                request.id = decodeURIComponent(request.id);
                received.push(request.id);
                waiters.get(request.id)?.();
            }
        });
    });
    const waitForRequest = async function(id) {
        if (received.includes(id)) {
            return;
        }
        let deadline;
        try {
            await Promise.race([
                new Promise((resolve) => waiters.set(id, resolve)),
                new Promise((_resolve, reject) => {
                    deadline = setTimeout(() => reject(new Error(`No request: ${id}`)), 2000);
                })
            ]);
        }
        finally {
            clearTimeout(deadline);
            waiters.delete(id);
        }
    };
    const respond = (id, method) => peer.write(JSON.stringify({ id, method, ok: true }) + "\n");

    try {
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        client = createRuntimeControlClient({ host: "127.0.0.1", port: server.address().port }, {
            onEvent: (event) => {
                if (event.type === "stream") {
                    receiveStream?.();
                }
            }
        });
        const slow = client.execute({ id: "slow", method: "evaluate_code", params: { timeoutMs: 250 } });
        const metadata = client.execute({ id: "metadata", method: "workspace.snapshot" }, {
            onDispatched: () => dispatched.push("metadata")
        });
        await waitForRequest("slow");
        const reply = client.execute({ id: "reply", method: "reply_prompt", params: { parentId: "probe", reply: "yes" } });
        await waitForRequest("reply");
        respond("reply", "reply_prompt");
        assert.equal((await reply).ok, true);
        assert.equal((await slow).error, "runtime-session-timeout");
        assert.ok(!received.includes("metadata"), "Deadline cannot release the R execution slot");
        assert.ok(!dispatched.includes("metadata"), "Queued work cannot acquire activity ownership");
        respond("slow", "evaluate_code");
        await waitForRequest("metadata");
        assert.deepEqual(dispatched, ["metadata"]);
        respond("metadata", "workspace.snapshot");
        assert.equal((await metadata).ok, true);

        const running = client.execute({
            id: "running", method: "execute_input", params: { parentId: "running-activity" }
        });
        const queued = client.execute({ id: "queued mutation", method: "workspace.remove" }, {
            onDispatched: () => dispatched.push("queued mutation")
        });
        await waitForRequest("running");
        let streamDeadline;
        try {
            const streamReceived = new Promise((resolve) => { receiveStream = resolve; });
            peer.write(JSON.stringify({
                type: "stream", parent_id: "running-activity", text: "before disconnect"
            }) + "\n");
            await Promise.race([
                streamReceived,
                new Promise((_resolve, reject) => {
                    streamDeadline = setTimeout(() => reject(new Error("No stream event")), 2000);
                })
            ]);
        }
        finally {
            clearTimeout(streamDeadline);
        }
        client.detach();
        const runningFailure = await running;
        const queuedFailure = await queued;
        assert.equal(runningFailure.ok, false);
        assert.equal(runningFailure.transportFailure, true);
        assert.equal(runningFailure.events[0].text, "before disconnect");
        assert.equal(queuedFailure.ok, false);
        assert.equal(queuedFailure.transportFailure, true);
        assert.ok(!received.includes("queued mutation"));
        assert.ok(!dispatched.includes("queued mutation"));
        assert.equal((await client.execute({ id: "after detach", method: "execute_input" })).error,
            "runtime-session-detached");
    }
    finally {
        client?.detach();
        for (const socket of sockets) {
            socket.destroy();
        }
        await new Promise((resolve) => server.close(resolve));
    }
    console.log("R request scheduling: control bypass, deadline ownership and detach cancellation.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
