"use strict";

// Physical native adapter checks, not product UI acceptance. WebR has no
// socket fragmentation; shared request policy is tested separately for both.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createRRuntimeLaunchPlan } = require("../dist/src/runtime/providers/r/session/runtimeLaunchPlan");
const { readRuntimeControlMeta } = require("../dist/src/runtime/providers/r/protocol/runtimeControlClient");
const { encodeRuntimeControlRequest } = require("../dist/src/runtime/providers/r/protocol/runtimeControlRequestEncoding");
const { terminateProcessTree, registerEmergencyProcessTreeTermination } = require("../dist/src/runtime/session/processTree");

const root = path.resolve(process.env.DIALOGFORGE_TEST_NATIVE_ROOT || path.join(__dirname, ".."));
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const withDeadline = async function(promise, message, milliseconds = 5000) {
    let timer;
    try {
        return await Promise.race([promise, new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(Error(message)), milliseconds);
        })]);
    }
    finally {
        clearTimeout(timer);
    }
};

const connectReader = async function(meta) {
    const socket = net.createConnection({ host: meta.host, port: meta.port });
    socket.setNoDelay(true);
    const frames = [];
    let remainder = "";
    let notify = () => {};
    let error = null;
    let closed = false;
    const closure = new Promise(resolve => {
        socket.once("close", () => { closed = true; notify(); resolve(); });
    });
    socket.on("error", value => { error = value; notify(); });
    socket.setEncoding("utf8");
    socket.on("data", function(chunk) {
        remainder += chunk;
        let newline;
        while ((newline = remainder.indexOf("\n")) >= 0) {
            frames.push(JSON.parse(remainder.slice(0, newline)));
            remainder = remainder.slice(newline + 1);
        }
        notify();
    });
    await withDeadline(new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
    }), "Native fixture connection did not open");
    const waitForResponse = async function(id) {
        const find = async function() {
            for (;;) {
                const response = frames.find(value => value.id === id);
                if (response) {
                    return response;
                }
                if (closed || error) {
                    throw Error("Native socket closed before response " + id);
                }
                await new Promise(resolve => { notify = resolve; });
            }
        };
        return withDeadline(find(), "Native response did not arrive: " + id);
    };
    return { socket, frames, closure, waitForResponse };
};

const main = async function() {
    const groupedInput = process.env.DIALOGFORGE_TEST_GROUPED_INPUT === "1";
    const plan = createRRuntimeLaunchPlan({
        rootDir: root, sessionKind: "dedicated",
        env: { ...process.env, R_PROFILE_USER: "/dev/null", R_ENVIRON_USER: "/dev/null",
            DIALOGFORGE_BOUNDED_INPUT_PROTOTYPE: groupedInput ? "0" : "1", DIALOGFORGE_ORDERED_OUTPUT_PROTOTYPE: "0",
            DM_RUNTIME_CONTROL_COMPILATION_CACHE: path.join(root, "dist/src/runtime/providers/r/r-sources/runtime-control-cache.rds"),
            DIALOGFORGE_TRANSPORT_LIBRARY: process.env.DIALOGFORGE_TRANSPORT_LIBRARY
                || path.join(root, "dist/r-transport-prototype/native/aarch64-apple-darwin23-4.6.1") }
    });
    plan.env.DM_RUNTIME_CONTROL_MAX_PAYLOAD = "4096";
    const responseClose = process.env.DIALOGFORGE_TEST_R_RESPONSE_CLOSE === "1";
    const stalledResponse = process.env.DIALOGFORGE_TEST_R_RESPONSE_STALL === "1";
    const stalledRequest = process.env.DIALOGFORGE_TEST_R_REQUEST_STALL === "1";
    if (responseClose || stalledResponse || stalledRequest) {
        plan.env.DM_RUNTIME_CONTROL_TRACE_ENABLED = "1";
    }
    const child = spawn(plan.command, plan.args, {
        cwd: plan.cwd, env: plan.env, detached: true, stdio: "pipe"
    });
    const unregister = registerEmergencyProcessTreeTermination(child.pid);
    const sockets = [];
    let processOutput = "";
    child.stdout.on("data", chunk => { processOutput += chunk; });
    child.stderr.on("data", chunk => { processOutput += chunk; });
    const measurements = [];
    let requestDrip;
    let responseDrip;
    let responseDrainedChunks = 0;
    const responseDripMs = Number(process.env.DIALOGFORGE_TEST_R_RESPONSE_DRIP_MS || "200");
    try {
        const meta = await readRuntimeControlMeta(plan.metaPath, 7000);
        assert.equal(meta?.ok, true, processOutput);
        if (groupedInput) {
            assert.notEqual(meta.boundedInput, "native-v1");
        }
        else {
            assert.equal(meta.boundedInput, "native-v1");
            assert.equal(meta.maxRequestBytes, 4096);
        }
        assert.equal(meta.pid, child.pid, "Interrupt targets the exact fixture-owned main process.");
        const open = async function() {
            const reader = await connectReader(meta);
            sockets.push(reader.socket);
            return reader;
        };
        const request = function(id, code, token = meta.token) {
            return encodeRuntimeControlRequest({
                id, method: "evaluate_code", transportNonce: "socket-" + id, params: { code }
            }, token);
        };
        const assertReply = async function(reader, id, expected) {
            const reply = await reader.waitForResponse(id);
            assert.equal(reply.ok, true, JSON.stringify(reply));
            assert.equal(reply.result, expected);
        };
        if (stalledRequest) {
            const incompletePeer = await open();
            const recoveryStarted = Date.now();
            const frameKind = process.env.DIALOGFORGE_TEST_R_REQUEST_FRAME_KIND || "partial";
            assert.ok(["partial", "unterminated", "nul"].includes(frameKind));
            const complete = request("incomplete-frame", 'socket_incomplete_dispatched <- TRUE');
            const rejectedFrame = frameKind === "partial" ? complete.slice(0, 15)
                : frameKind === "nul" ? complete + "\0rejected-tail\n" : complete;
            incompletePeer.socket.write(rejectedFrame);
            const slowlyProgressing = process.env.DIALOGFORGE_TEST_R_REQUEST_DRIP === "1";
            if (slowlyProgressing) {
                assert.equal(frameKind, "partial", "Drip fixture requires a partial frame.");
                requestDrip = setInterval(() => {
                    if (!incompletePeer.socket.destroyed) {
                        incompletePeer.socket.write(" ");
                    }
                }, 200);
            }
            // Unlike an idle prompt, bytes of a new frame are already present.
            // Keep its peer connected, but never finish that request.
            await delay(150);
            const recovered = await open();
            recovered.socket.write(request("incomplete-frame-recovery",
                'if (exists("socket_incomplete_dispatched", .GlobalEnv, inherits=FALSE)) "wrong" else "safe"') + "\n");
            await assertReply(recovered, "incomplete-frame-recovery", "safe");
            const recoveryMs = Date.now() - recoveryStarted;
            assert.ok(recoveryMs < 5000, "Incomplete connected frame did not release R within five seconds");
            const traceInputReasons = [...fs.readFileSync(plan.tracePath, "utf8").matchAll(
                /client:input retired status=(failed|interrupted) frame=([a-z_]+)/g
            )].map(match => ({ status: match[1], frame: match[2] }));
            const expectedReason = frameKind === "nul" ? "invalid_nul"
                : slowlyProgressing ? "deadline" : "truncated";
            assert.ok(traceInputReasons.some(item => item.frame === expectedReason),
                "Physical retirement must retain its bounded reason without payload details.");
            measurements.push({ name: "incomplete-or-invalid-native-frame", frameKind, actualRReader: true,
                rejectedFrameBytes: Buffer.byteLength(rejectedFrame), connectedPeerStoppedSending: frameKind !== "nul",
                slowlyProgressingPeer: slowlyProgressing,
                traceInputReasons,
                dispatchedSideEffect: false, recovered: true, recoveryMs,
                inputMode: groupedInput ? "grouped-default" : "bounded-opt-in" });
            console.log("Actual native incomplete frame measurement: " + JSON.stringify(measurements));
            return;
        }
        if (responseClose || stalledResponse) {
            const marker = path.join(plan.tempDir, "response-producer-started");
            const closedPeer = await open();
            closedPeer.socket.write(request("closed-response", [
                'socket_completed_before_close <- FALSE;',
                'local({ base::writeLines("live", ' + JSON.stringify(marker) + ');',
                'Sys.sleep(0.5); socket_completed_before_close <<- TRUE;',
                'strrep("x", ' + (stalledResponse ? '12L' : '4L') + ' * 1024L * 1024L) })'
            ].join(" ")) + "\n" + request("queued-after-close",
                'socket_queued_after_close <- TRUE; "must-not-run"') + "\n");
            await withDeadline((async function() {
                while (!fs.existsSync(marker)) {
                    await delay(10);
                }
            })(), "Actual R response producer did not start");
            const recoveryStarted = Date.now();
            if (stalledResponse) {
                // Leave the real peer connected, but stop draining its receive
                // buffer before actual R starts writing the large response.
                closedPeer.socket.pause();
                if (process.env.DIALOGFORGE_TEST_R_RESPONSE_DRIP === "1") {
                    assert.ok(Number.isInteger(responseDripMs) && responseDripMs >= 20 && responseDripMs <= 500);
                    responseDrip = setInterval(() => {
                        if (!closedPeer.socket.destroyed && closedPeer.socket.isPaused()) {
                            closedPeer.socket.once("data", () => {
                                responseDrainedChunks++;
                                closedPeer.socket.pause();
                            });
                            closedPeer.socket.resume();
                        }
                    }, responseDripMs);
                }
            }
            else {
                closedPeer.socket.resetAndDestroy();
                await closedPeer.closure;
            }
            const recovered = await open();
            recovered.socket.write(request("response-close-recovery", [
                'paste(isTRUE(socket_completed_before_close),',
                'exists("socket_queued_after_close", .GlobalEnv, inherits=FALSE))'
            ].join(" ")) + "\n");
            await assertReply(recovered, "response-close-recovery", "TRUE FALSE");
            const recoveryMs = Date.now() - recoveryStarted;
            assert.ok(recoveryMs < 5000, "Physical write failure did not release R within five seconds");
            const responsiveStarted = Date.now();
            recovered.socket.write(request("responsive-large-response",
                'strrep("y", 12L * 1024L * 1024L)') + "\n");
            const healthyReply = await recovered.waitForResponse("responsive-large-response");
            assert.equal(healthyReply.ok, true);
            assert.equal(healthyReply.result.length, 12 * 1024 * 1024);
            assert.equal(healthyReply.result, "y".repeat(12 * 1024 * 1024));
            measurements.push({ name: stalledResponse ? "peer-stops-reading-r-response"
                : "peer-reset-during-r-response", actualRProducer: true,
                responseBytes: (stalledResponse ? 12 : 4) * 1024 * 1024,
                connectedPeerStoppedReading: stalledResponse && !responseDrip,
                slowlyProgressingPeer: Boolean(responseDrip),
                responseDripMs: responseDrip ? responseDripMs : null,
                responseDrainedChunks,
                responsiveLargeReplyBytes: healthyReply.result.length,
                recoveryMs, responsiveLargeReplyMs: Date.now() - responsiveStarted,
                queuedSideEffect: false, recovered: true,
                outputMode: groupedInput ? "grouped-default" : "bounded-opt-in" });
            console.log("Actual native response close measurement: " + JSON.stringify(measurements));
            return;
        }
        const reader = await open();
        const idleMs = Number(process.env.DIALOGFORGE_TEST_SOCKET_IDLE_MS || 1300);
        assert.ok(Number.isFinite(idleMs) && idleMs >= 0 && idleMs <= 15000);
        await delay(idleMs);
        reader.socket.write(request("idle", '"idle-ready"') + "\n");
        await assertReply(reader, "idle", "idle-ready");
        measurements.push({ name: "idle-connection-remains-readable", idleMs });
        const fragmented = request("fragmented", '"Ω😀é"') + "\n";
        let writes = 0;
        for (let offset = 0; offset < fragmented.length; offset += 7) {
            reader.socket.write(fragmented.slice(offset, offset + 7));
            writes++;
            await delay(1);
        }
        await assertReply(reader, "fragmented", "Ω😀é");
        measurements.push({ name: "fragmented-encoded-unicode", writes, bytes: fragmented.length });

        reader.socket.write(request("pipeline-a", '"first"') + "\r\n"
            + request("pipeline-b", '"second"') + "\n");
        await assertReply(reader, "pipeline-a", "first");
        await assertReply(reader, "pipeline-b", "second");
        measurements.push({ name: "pipelined-crlf-lf", responses: 2 });

        const exact = JSON.parse(request("exact-limit", '"limit"'));
        exact.padding = "";
        exact.padding = "x".repeat(meta.maxRequestBytes - Buffer.byteLength(JSON.stringify(exact)));
        const encoded = JSON.stringify(exact);
        assert.equal(Buffer.byteLength(encoded), meta.maxRequestBytes);
        reader.socket.write(encoded + "\r\n");
        await assertReply(reader, "exact-limit", "limit");
        measurements.push({ name: "exact-byte-limit-crlf", bytes: Buffer.byteLength(encoded) });

        reader.socket.write(request("unauthorized", 'socket_unauthorized <- TRUE', "wrong-fixture-token") + "\n");
        const unauthorized = await reader.waitForResponse("unauthorized");
        assert.equal(unauthorized.ok, false);
        assert.equal(unauthorized.error, "unauthorized");
        reader.socket.write(request("auth-recovery", 'if (exists("socket_unauthorized", .GlobalEnv, inherits=FALSE)) "wrong" else "safe"') + "\n");
        await assertReply(reader, "auth-recovery", "safe");
        reader.socket.destroy();
        await reader.closure;
        measurements.push({ name: "auth-rejection-recovery", sideEffect: false });

        for (const mode of ["truncated", "nul", "oversized", "partial-interrupt"]) {
            const current = await open();
            const marker = request(mode, 'socket_rejected <- TRUE');
            if (mode === "truncated") {
                current.socket.end(marker);
            }
            else if (mode === "nul") {
                current.socket.write(marker.slice(0, 15) + "\0" + marker + "\n");
            }
            else if (mode === "oversized") {
                current.socket.write("x".repeat(meta.maxRequestBytes + 1) + marker + "\n");
            }
            else {
                current.socket.write(marker.slice(0, 15));
                await delay(150);
                process.kill(meta.pid, "SIGINT");
            }
            await withDeadline(current.closure, "Native partial frame did not retire: " + mode);
            assert.equal(current.frames.filter(value => value.id === mode).length, 0,
                "An invalid or interrupted frame must not be dispatched.");
            const recovered = await open();
            recovered.socket.write(request("recovery-" + mode,
                'if (exists("socket_rejected", .GlobalEnv, inherits=FALSE)) "wrong" else "safe"') + "\n");
            await assertReply(recovered, "recovery-" + mode, "safe");
            recovered.socket.destroy();
            await recovered.closure;
            measurements.push({ name: mode, retired: true, sideEffect: false, recovered: true });
        }
        console.log("Actual native socket measurement: " + JSON.stringify(measurements));
        console.log("Physical native bounded socket cases passed; worker policy/rendered/platform acceptance is separate.");
    }
    catch (error) {
        console.error("Native physical failure diagnostics: " + JSON.stringify({
            exitCode: child.exitCode, signalCode: child.signalCode, processOutput,
            trace: fs.existsSync(plan.tracePath) ? fs.readFileSync(plan.tracePath, "utf8").slice(-20000) : ""
        }));
        throw error;
    }
    finally {
        clearInterval(requestDrip);
        clearInterval(responseDrip);
        for (const socket of sockets) {
            socket.destroy();
        }
        await terminateProcessTree({ pid: child.pid });
        unregister();
        fs.rmSync(plan.tempDir, { recursive: true, force: true });
    }
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
