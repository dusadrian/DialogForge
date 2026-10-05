"use strict";

const assert = require("node:assert/strict");
const net = require("node:net");
const { createRuntimeControlFrameReader } = require("../dist/src/runtime/providers/r/protocol/runtimeControlFrameReader");
const { createRuntimeControlClient } = require("../dist/src/runtime/providers/r/protocol/runtimeControlClient");

const main = async function() {
    const lines = [];
    const reader = createRuntimeControlFrameReader((line) => lines.push(line), 512);
    for (const byte of Buffer.from('{"text":"é😀"}\r\n\n{"ok":true}\n')) {
        reader.push(Buffer.from([byte]));
    }
    assert.deepEqual(lines, ['{"text":"é😀"}', '{"ok":true}']);
    reader.end();
    const bounded = createRuntimeControlFrameReader(() => {}, 512);
    bounded.push(Buffer.alloc(512, 120));
    assert.throws(() => bounded.push(Buffer.from("x")), /too-large/);
    assert.throws(() => bounded.push(Buffer.from("\n")), /failed/);
    const truncated = createRuntimeControlFrameReader(() => {}, 512);
    truncated.push(Buffer.from('{"unfinished":'));
    assert.throws(() => truncated.end(), /truncated/);
    const unicode = createRuntimeControlFrameReader(() => {}, 512);
    assert.throws(() => unicode.push(Buffer.from([0xff, 10])));
    const many = [];
    createRuntimeControlFrameReader((line) => many.push(line), 512)
        .push(Buffer.from("{}\n".repeat(1000)));
    assert.equal(many.length, 1000, "Limit applies to one frame, not total socket chunk");

    const scenario = async function(write, expected, dispatchOptions, expectedEvents) {
        let peer;
        const server = net.createServer((socket) => {
            peer = socket;
            let sent = false;
            socket.on("data", () => {
                if (!sent) {
                    sent = true;
                    write(socket);
                }
            });
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const client = createRuntimeControlClient({ host: "127.0.0.1", port: server.address().port }, { maxFrameBytes: 512 });
        let deadline;
        try {
            const first = client.execute({ id: "first", method: "evaluate_code" }, dispatchOptions);
            const queued = client.execute({ id: "queued", method: "workspace.snapshot" });
            const [a, b] = await Promise.race([
                Promise.all([first, queued]),
                new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("Framing case stalled")), 2000); })
            ]);
            assert.equal(a.transportFailure, true);
            assert.match(a.error, expected);
            if (expectedEvents) {
                assert.deepEqual(a.events, expectedEvents,
                    "A validated response survives failure in its delivery observer.");
            }
            assert.equal(b.transportFailure, true);
            assert.equal((await client.execute({ id: "after", method: "evaluate_code" })).error, "runtime-session-detached");
        } finally {
            clearTimeout(deadline);
            client.detach();
            peer?.destroy();
            await new Promise((resolve) => server.close(resolve));
        }
    };
    await scenario((socket) => socket.write("x".repeat(513)), /too-large/);
    await scenario((socket) => socket.write("not-json\n"), /frame-delivery-failed/);
    await scenario((socket) => socket.write(Buffer.from([0xff, 10])), /frame-encoding-invalid/);
    await scenario((socket) => socket.write("null\n"), /invalid-frame/);
    await scenario((socket) => socket.write('{"id":123,"method":"evaluate_code","ok":true}\n'), /invalid-frame-identity/);
    await scenario((socket) => socket.write('{"id":"first","method":"evaluate_code","ok":true,"events":{}}\n'), /invalid-response-events/);
    await scenario((socket) => socket.write('{"id":"first","method":"wrong","ok":true}\n'), /mismatch/);
    await scenario((socket) => socket.end('{"id":"first"'), /truncated/);
    await scenario((socket) => socket.end(), /socket-ended/);
    await scenario((socket) => socket.write('{"id":"foreign","method":"evaluate_code","ok":true}\n'), /unmatched/);
    const receivedEvents = [{ type: "stream", text: "validated response fact" }];
    let responseNotifications = 0;
    await scenario(socket => socket.write(JSON.stringify({
        id: "first", method: "evaluate_code", ok: true, events: receivedEvents
    }) + "\n"), /frame-delivery-failed/, {
        onResponseReceived: response => {
            responseNotifications++;
            assert.deepEqual(response.events, receivedEvents);
            throw new Error("Fixture response observer failed");
        }
    }, receivedEvents);
    assert.equal(responseNotifications, 1,
        "The native decoder notifies only after accepting the response envelope.");

    let peer;
    let incoming = "";
    const receivedRequestIds = [];
    const responseThenEofServer = net.createServer(socket => {
        peer = socket;
        socket.on("data", bytes => {
            incoming += bytes.toString("utf8");
            let newline;
            while ((newline = incoming.indexOf("\n")) >= 0) {
                const line = incoming.slice(0, newline);
                incoming = incoming.slice(newline + 1);
                if (!line.trim()) {
                    continue;
                }
                const request = JSON.parse(line);
                receivedRequestIds.push(decodeURIComponent(request.id));
                socket.end(JSON.stringify({
                    id: "accepted-before-eof", method: "evaluate_code", ok: true,
                    events: receivedEvents
                }) + "\n");
            }
        });
    });
    await new Promise(resolve => responseThenEofServer.listen(0, "127.0.0.1", resolve));
    const responseThenEofClient = createRuntimeControlClient({
        host: "127.0.0.1", port: responseThenEofServer.address().port
    });
    let finishDelivery;
    const heldDelivery = new Promise(resolve => { finishDelivery = resolve; });
    let eofDeadline;
    try {
        const accepted = responseThenEofClient.execute({
            id: "accepted-before-eof", method: "evaluate_code"
        }, { waitForResponseDelivery: () => heldDelivery });
        const queued = responseThenEofClient.execute({
            id: "queued-after-receipt", method: "workspace.snapshot"
        });
        const [first, next] = await Promise.race([
            Promise.all([accepted, queued]),
            new Promise((_, reject) => {
                eofDeadline = setTimeout(() => reject(Error("Response/EOF ordering stalled")), 2000);
            })
        ]);
        assert.equal(first.ok, true, "EOF does not erase an already accepted response.");
        assert.deepEqual(first.events, receivedEvents);
        assert.equal(next.ok, false);
        assert.equal(next.transportFailure, true);
        assert.equal(next.error, "runtime-session-socket-ended");
        assert.deepEqual(receivedRequestIds, ["accepted-before-eof"],
            "Queued work is not dispatched through a retired socket, even with delivery held.");
        finishDelivery();
        assert.equal((await responseThenEofClient.execute({
            id: "after-late-delivery", method: "workspace.snapshot"
        })).error, "runtime-session-detached");
    } finally {
        clearTimeout(eofDeadline);
        finishDelivery();
        responseThenEofClient.detach();
        peer?.destroy();
        await new Promise(resolve => responseThenEofServer.close(resolve));
    }
    console.log("Native control framing cases passed; output drain/rendered acceptance remains separate.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
