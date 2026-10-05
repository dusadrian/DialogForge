"use strict";

// Actual loopback TCP backpressure; no mocked net/socket.write callbacks and
// no application UI. The peer deliberately does not consume a negotiated
// 12-MiB request. This is not a production-default 256-KiB request or R fixture.
const assert = require("node:assert/strict");
const net = require("node:net");
const { createRuntimeControlClient } =
    require("../dist/src/runtime/providers/r/protocol/runtimeControlClient");

const main = async function() {
    const peers = new Set();
    const server = net.createServer(socket => {
        peers.add(socket);
        socket.pause();
        socket.on("error", () => {});
        socket.on("close", () => peers.delete(socket));
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const client = createRuntimeControlClient({
        host: "127.0.0.1", port: server.address().port, maxRequestBytes: 16 * 1024 * 1024
    }, { writeTimeoutMs: 500 });
    const dispatched = [];
    let deadline;
    try {
        const started = Date.now();
        const first = client.execute({
            id: "physical-stall", method: "execute_input",
            params: { code: "x".repeat(12 * 1024 * 1024), parentId: "physical-stall" }
        }, { onDispatched: () => dispatched.push("first") });
        const queued = client.execute({ id: "queued-after-stall", method: "workspace.snapshot" }, {
            onDispatched: () => dispatched.push("queued")
        });
        const results = await Promise.race([
            Promise.all([first, queued]),
            new Promise((_, reject) => {
                deadline = setTimeout(() => reject(Error("Actual TCP write did not settle within five seconds")), 5000);
            })
        ]);
        for (const result of results) {
            assert.equal(result.transportFailure, true);
            assert.equal(result.error, "runtime-session-write-timeout");
        }
        assert.deepEqual(dispatched, ["first"], "Queued work cannot bypass the uncompleted physical write.");
        assert.equal((await client.execute({ id: "after-stall", method: "workspace.snapshot" })).error,
            "runtime-session-detached");
        console.log(JSON.stringify({ status: "passed", requestBytes: 12 * 1024 * 1024,
            negotiatedLimit: 16 * 1024 * 1024, writeTimeoutMs: 500, elapsedMs: Date.now() - started,
            dispatched, rejectedQueuedAndFutureRequests: true, actualLoopbackSocket: true,
            actualRProducerChecked: false, renderedAppChecked: false }));
    } finally {
        clearTimeout(deadline);
        client.detach();
        for (const socket of peers) {
            socket.destroy();
        }
        await new Promise(resolve => server.close(resolve));
    }
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
