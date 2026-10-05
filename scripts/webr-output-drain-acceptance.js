"use strict";

// Worker-channel mechanics only: the actual R evaluator completes, but its
// actual channel fence is held by a fixture gate. No second output semantics.
exports.checkActualWorkerDrainFailure = async function(options) {
    const probe = options.captureProbe();
    probe.arm();
    const startedAt = Date.now();
    const pending = options.execute(
        'drain_before <- 1L; cat("drain-before\\n"); drain_after <- 2L; cat("drain-after\\n")',
        "answer", { inspectJournal: false });
    let deadline;
    try {
        const fence = await Promise.race([
            probe.waitForFence(),
            new Promise((_, reject) => {
                deadline = setTimeout(() => reject(Error("Actual worker fence was not reached")), 10000);
            })
        ]);
        const result = await pending;
        const elapsedMs = Date.now() - startedAt;
        if (!result.failed || !result.terminal || result.workspaceUpdate
            || !result.returnedEvents.some(event => String(event.message || "").includes("runtime-session-channel-drain-timeout"))) {
            throw Error("Lost worker fence did not report the specific drain timeout: "
                + JSON.stringify({ outcome: result.outcome, effects: Boolean(result.workspaceUpdate), events: result.returnedEvents }));
        }
        if (elapsedMs < 4900 || elapsedMs > 9000) {
            throw Error("Actual worker drain timeout was not bounded after evaluation: " + elapsedMs);
        }
        const query = await options.getRuntime().executeInvisibleQuery({
            query: '"must-not-dispatch"', source: "paired-lost-fence"
        });
        if (query.status === "ready") {
            throw Error("Lost-fence attachment admitted a new query");
        }
        const replacement = await options.restart("clean");
        if (replacement.status !== "ready") {
            throw Error("Actual worker replacement failed after lost fence");
        }
        probe.release();
        const fresh = await options.execute(
            'stopifnot(!exists("drain_before"), !exists("drain_after")); cat("drain-recovered\\n")', "answer");
        if (fresh.outcome !== "success" || !fresh.workspaceUpdate?.workspaceRevision) {
            throw Error("Fresh worker did not recover after late old fence release");
        }
        return { host: "webr", actualWorkerFence: fence, elapsedMs, reportedFailure: "runtime-session-channel-drain-timeout",
            rejectedWorkspaceEffects: true, rejectedNextQuery: query.status, freshOutcome: fresh.outcome,
            controlledFenceHold: true, renderedAppChecked: false };
    } finally {
        clearTimeout(deadline);
        probe.release();
        // Observe the original promise even when an earlier fixture assertion fails.
        await pending.catch(() => {});
    }
};

exports.createWorkerDrainFailureProbe = function() {
    let armed = false;
    let ready;
    let notify;
    let gate;
    let release;
    return {
        arm() {
            armed = true;
            ready = new Promise(resolve => { notify = resolve; });
            gate = new Promise(resolve => { release = resolve; });
        },
        waitForFence() {
            return ready;
        },
        release() {
            release();
        },
        receive: async function(message) {
            if (armed && message?.type === "dialogforge-runtime-drain") {
                armed = false;
                notify({ type: message.type, actualResponsePath: message.data });
                await gate;
            }
            return message;
        }
    };
};

exports.checkActualWorkerResponseReadFailure = async function(options) {
    const observations = [];
    for (const scenario of ["response-read", "response-encoding", "response-size", "response-pre-read-size",
        "sdk-evaluation-error", "sdk-evaluation-null", "response-cleanup"]) {
        const physical = options.getPhysicalRuntime();
        const readFile = physical.FS.readFile.bind(physical.FS);
        const unlink = physical.FS.unlink.bind(physical.FS);
        const read = physical.read.bind(physical);
        const evaluate = physical.evalRVoid.bind(physical);
        const leftoverPaths = new Set();
        let actualResponse;
        let responseReads = 0;
        let cleanupAttempts = 0;
        let actualFenceBytes;
        let actualREvaluationCompletedBeforeSDKFailure = false;
        let failedSDKEvaluations = 0;
        const sdkEvaluationFault = scenario === "sdk-evaluation-error" || scenario === "sdk-evaluation-null";
        physical.read = async function() {
            const message = await read();
            if (message?.type === "dialogforge-runtime-drain") actualFenceBytes = message.responseBytes;
            return message;
        };
        if (scenario === "response-pre-read-size") {
            physical.evalRVoid = async function(command, settings) {
                const path = command.match(/writeChar\(\.payload, ("[^"]+")/);
                if (path) {
                    const truncate = 'globalThis.Module.FS.truncate(' + path[1]
                        + ', 16 * 1024 * 1024 + 1); null';
                    command = command.replace("    invisible(NULL)",
                        "    webr::eval_js(" + JSON.stringify(truncate) + ")\n    invisible(NULL)");
                }
                return evaluate(command, settings);
            };
        }
        if (sdkEvaluationFault) {
            physical.evalRVoid = async function(command, settings) {
                await evaluate(command, settings);
                if (command.includes('writeChar(.payload, "/tmp/dialogforge-runtime-')) {
                    actualREvaluationCompletedBeforeSDKFailure = true;
                    failedSDKEvaluations++;
                    throw scenario === "sdk-evaluation-null" ? null : Error("private-sdk-evaluation-fixture");
                }
            };
        }
        physical.FS.readFile = async function(path) {
            const bytes = await readFile(path);
            if (path.startsWith("/tmp/dialogforge-runtime-")) {
                responseReads++;
                actualResponse = JSON.parse(new TextDecoder().decode(bytes));
                if (scenario === "response-read") {
                    throw Error("private-response-fixture-path-and-secret");
                }
                if (scenario === "response-encoding") {
                    const text = new TextDecoder().decode(bytes);
                    const index = text.indexOf("response-fault-evaluated");
                    if (index < 0) throw Error("Encoding fixture did not find actual R output payload text.");
                    const corrupt = new Uint8Array(bytes);
                    const byteOffset = new TextEncoder().encode(text.slice(0, index)).byteLength;
                    corrupt[byteOffset] = 0xff;
                    return corrupt;
                }
                if (scenario === "response-size") {
                    const large = new Uint8Array(16 * 1024 * 1024 + 1).fill(32);
                    large.set(bytes);
                    return large;
                }
            }
            return bytes;
        };
        physical.FS.unlink = async function(path) {
            if (path.startsWith("/tmp/dialogforge-runtime-")) {
                cleanupAttempts++;
                if (scenario === "response-cleanup") {
                    leftoverPaths.add(path);
                    throw Error("private-cleanup-fixture-path");
                }
            }
            return unlink(path);
        };
        try {
            const result = await options.execute(
                'response_fault_once <- 1L; cat("response-fault-evaluated\\n")',
                "answer", { inspectJournal: false }
            );
            const oversizedFile = scenario === "response-pre-read-size";
            const rejectedBeforeRead = oversizedFile || sdkEvaluationFault;
            if (cleanupAttempts !== 1 || (oversizedFile
                ? actualFenceBytes !== 16 * 1024 * 1024 + 1 || responseReads !== 0
                : sdkEvaluationFault
                ? !actualREvaluationCompletedBeforeSDKFailure || failedSDKEvaluations !== 1
                    || responseReads !== 0 || !Number.isSafeInteger(actualFenceBytes)
                : !actualResponse?.ok || responseReads !== 1 || !Number.isSafeInteger(actualFenceBytes))) {
                throw Error("Physical response-file fixture did not reach a real checked reply and scoped cleanup.");
            }
            if (scenario !== "response-cleanup") {
                const diagnostic = scenario === "response-read" ? "runtime-session-response-read-failed"
                    : scenario === "response-encoding" ? "runtime-session-frame-encoding-invalid"
                    : sdkEvaluationFault ? "runtime-session-evaluation-delivery-failed"
                    : "runtime-session-frame-too-large";
                if (!result.failed || result.executionDisposition !== "session_lost" || result.workspaceUpdate
                    || !result.returnedEvents.some(event => event.message === diagnostic)) {
                    throw Error("Lost actual worker response was not reported as uncertain transport loss: "
                        + JSON.stringify(result.returnedEvents));
                }
                const rejected = await options.getRuntime().executeInvisibleQuery({
                    query: '"must-not-dispatch"', source: "paired-response-read-failure"
                });
                if (rejected.status === "ready" || responseReads !== (rejectedBeforeRead ? 0 : 1)
                    || (sdkEvaluationFault && failedSDKEvaluations !== 1)) {
                    throw Error("Unreadable worker response attachment admitted another command.");
                }
                physical.FS.readFile = readFile;
                physical.FS.unlink = unlink;
                physical.read = read;
                physical.evalRVoid = evaluate;
                const replacement = await options.restart("clean");
                if (replacement.status !== "ready") throw Error("Worker replacement did not recover from unreadable reply.");
                const fresh = await options.execute(
                    'stopifnot(!exists("response_fault_once")); cat("response-read-recovered\\n")',
                    "answer", { inspectJournal: false }
                );
                if (fresh.outcome !== "success" || !fresh.workspaceUpdate?.workspaceRevision) {
                    throw Error("Fresh worker failed after lost/corrupt-response retirement.");
                }
            }
            else {
                if (result.failed || result.outcome !== "success" || !result.workspaceUpdate?.workspaceRevision) {
                    throw Error("Optional physical cleanup failure replaced the accepted command result.");
                }
                const next = await options.execute('stopifnot(response_fault_once == 1L); cat("cleanup-recovered\\n")',
                    "answer", { inspectJournal: false });
                if (next.outcome !== "success" || responseReads !== 2) {
                    throw Error("Cleanup-only failure retired a still-usable worker attachment.");
                }
            }
            observations.push({ scenario, actualRResponse: actualResponse?.ok,
                actualCompletedWorkerFence: Number.isSafeInteger(actualFenceBytes), actualFenceBytes,
                actualWorkerFSRead: !rejectedBeforeRead,
                actualREvaluationCompletedBeforeSDKFailure,
                controlledSDKEvaluationRejection: sdkEvaluationFault,
                failedSDKEvaluationRejectedBeforeRead: sdkEvaluationFault && responseReads === 0,
                failedSDKEvaluations,
                controlledFilesystemException: scenario === "response-read" || scenario === "response-cleanup",
                controlledInvalidEncoding: scenario === "response-encoding",
                controlledOversizedResponse: scenario === "response-size", cleanupAttempts,
                controlledActualFileTruncation: oversizedFile,
                oversizedFileRejectedBeforeSDKRead: oversizedFile && responseReads === 0,
                responseReads, executionDisposition: result.executionDisposition,
                mutationReplayed: false, recoveryAccepted: true });
        }
        finally {
            physical.FS.readFile = readFile;
            physical.FS.unlink = unlink;
            physical.read = read;
            physical.evalRVoid = evaluate;
            for (const path of leftoverPaths) await unlink(path);
        }
    }
    return { host: "webr", observations, renderedAppChecked: false };
};
