"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Native OS-child pipe mechanics, not a second R/WebR output implementation.
// WebR cannot spawn /bin/sh; the common journal/receipt scenarios remain paired.
exports.checkNativeProcessPipeOwnership = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) {
            throw Error("native: " + message);
        }
    };
    const checkUnowned = function(result, markers) {
        const events = result.records.map(record => record.event);
        for (const marker of markers) {
            const matching = events.filter(event => String(event.message || "").includes(marker));
            requireResult(matching.length > 0, "Actual child pipe output was absent: " + marker);
            requireResult(matching.every(event => event.commandKind === "runtime.process"
                && event.id === event.parentId && event.parentId !== result.activityId
                && event.id.startsWith("process-output:")),
                "Unidentified child bytes were assigned to the current R command: " + marker);
        }
    };
    const ordinary = await options.execute([
        'local({ cat("pipe-r-before\\n");',
        'system2("/bin/sh", c("-c", shQuote("printf \'pipe-child-out\\\\n\'; printf \'pipe-child-err\\\\n\' >&2")), stdout="", stderr="");',
        'cat("pipe-r-after\\n") })'
    ].join("\n"), "answer");
    requireResult(ordinary.outcome === "success", "Actual OS child command failed");
    checkUnowned(ordinary, ["pipe-child-out", "pipe-child-err"]);
    const unicodeScript = [
        "printf 'pipe-unicode-out:'",
        "printf '\\360'; sleep 0.03; printf '\\237'; sleep 0.03",
        "printf '\\230'; sleep 0.03; printf '\\200\\n'",
        "printf 'pipe-unicode-err:' >&2",
        "printf '\\303' >&2; sleep 0.03; printf '\\251\\n' >&2"
    ].join("; ");
    const unicode = await options.execute(
        'system2("/bin/sh",c("-c",shQuote(' + JSON.stringify(unicodeScript)
            + ')),stdout="",stderr=""); Sys.sleep(0.1)',
        "answer"
    );
    requireResult(unicode.outcome === "success", "Split-byte OS child command failed.");
    for (const [stream, expected] of [
        ["stdout", "pipe-unicode-out:😀\n"],
        ["stderr", "pipe-unicode-err:é\n"]
    ]) {
        const text = unicode.records.map(record => record.event)
            .filter(event => event.commandKind === "runtime.process"
                && event.streamName === stream)
            .map(event => String(event.message || "")).join("");
        requireResult(text.includes(expected),
            "Split UTF8 pipe bytes were corrupted on " + stream + ": " + JSON.stringify(text));
    }
    const saturationStartedAt = Date.now();
    const saturated = await options.execute([
        'local({ script <- "awk \'BEGIN { for (i=0;i<32768;i++) print \\\"0123456789012345678901234567890\\\"; print \\\"pipe-saturation-out-tail\\\" }\';',
        'awk \'BEGIN { for (i=0;i<32768;i++) print \\\"0123456789012345678901234567890\\\"; print \\\"pipe-saturation-err-tail\\\" }\' >&2";',
        'system2("/bin/sh",c("-c",shQuote(script)),stdout="",stderr="");',
        'cat("pipe-saturation-r-completed\\n") })'
    ].join(" "), "answer");
    requireResult(saturated.outcome === "success", "Actual bounded pipe saturation did not complete.");
    const saturationEvents = saturated.records.map(record => record.event)
        .filter(event => event.commandKind === "runtime.process");
    requireResult(saturationEvents.every(event => event.id === event.parentId
        && event.parentId !== saturated.activityId), "Saturated bytes acquired an R command owner.");
    const saturationBytes = {};
    for (const [stream, marker] of [["stdout", "pipe-saturation-out-tail"], ["stderr", "pipe-saturation-err-tail"]]) {
        const text = saturationEvents.filter(event => event.streamName === stream)
            .map(event => String(event.message || "")).join("");
        requireResult(text.includes(marker), "Bounded pipe saturation lost its final drain marker: " + stream);
        saturationBytes[stream] = Buffer.byteLength(text);
        requireResult(saturationBytes[stream] >= 1024 * 1024, "Pipe fixture did not exceed kernel buffering: " + stream);
    }
    const saturationMs = Date.now() - saturationStartedAt;
    const started = await options.execute([
        'system2("/bin/sh", c("-c", shQuote("sleep 0.2; printf \'pipe-child-late\\\\n\'")),',
        'stdout="", stderr="", wait=FALSE); cat("pipe-child-started\\n")'
    ].join("\n"), "answer");
    requireResult(started.outcome === "success", "Actual background child failed to launch");
    const next = await options.execute('cat("pipe-next-before\\n"); Sys.sleep(0.6); cat("pipe-next-after\\n")', "answer");
    requireResult(next.outcome === "success", "Next actual R command failed while child wrote");
    checkUnowned(next, ["pipe-child-late"]);
    const foreign = [...ordinary.records, ...next.records].map(record => record.event)
        .filter(event => event.commandKind === "runtime.process");
    const retirement = options.checkRetirement ? await checkNativeChildRetirement(options) : undefined;
    const childInterrupt = options.interrupt ? await checkNativeChildInterrupt(options) : undefined;
    const processExit = options.checkUnexpectedExit ? await checkNativePipeExit(options) : undefined;
    return { host: "native", ordinaryOutcome: ordinary.outcome, nextOutcome: next.outcome,
        splitUTF8: { actualOSChild: true, streams: ["stdout", "stderr"],
            delayedIndividualByteWrites: true, decodedExactly: true },
        saturation: { actualOSChild: true, bytes: saturationBytes, milliseconds: saturationMs,
            bothTailMarkersDrained: true, independentOwnership: true, relativeOrderClaimed: false },
        foreignOutputs: foreign.map(event => ({ source: event.source, stream: event.streamName,
            message: event.message, independentParent: event.id === event.parentId })),
        retirement, childInterrupt, processExit,
        actualOSChildren: true, relativeCrossTransportOrderClaimed: false,
        webROSCounterpartAvailable: false, renderedAppChecked: false };
};

const checkNativePipeExit = async function(options) {
    const startIndex = options.readProcessEvents().length;
    const exited = await options.execute([
        'local({ script <- "awk \'BEGIN { for (i=0;i<32768;i++) print \\\"0123456789012345678901234567890\\\"; print \\\"pipe-exit-out-tail\\\" }\';',
        'awk \'BEGIN { for (i=0;i<32768;i++) print \\\"0123456789012345678901234567890\\\"; print \\\"pipe-exit-err-tail\\\" }\' >&2";',
        'system2("/bin/sh",c("-c",shQuote(script)),stdout="",stderr="");',
        'q(save="no",status=17L,runLast=FALSE) })'
    ].join(" "), "answer", { inspectJournal: false });
    if (exited.outcome === "success" || exited.executionDisposition !== "session_lost") {
        throw Error("Actual R process exit was falsely accepted as a completed command.");
    }
    const events = options.readProcessEvents().slice(startIndex).map(record => record.event);
    const bytes = {};
    for (const [stream, marker] of [
        ["stdout", "pipe-exit-out-tail"],
        ["stderr", "pipe-exit-err-tail"]
    ]) {
        const text = events.filter(event => event.streamName === stream)
            .map(event => String(event.message || "")).join("");
        bytes[stream] = Buffer.byteLength(text);
        if (!text.includes(marker) || bytes[stream] < 1024 * 1024) {
            throw Error("Actual exiting R process lost its raw pipe tail: " + stream);
        }
    }
    const replacement = await options.restart("clean");
    const recovered = await options.execute('cat("pipe-exit-recovered\\n")', "answer");
    if (replacement.status !== "ready" || recovered.outcome !== "success") {
        throw Error("Actual process-exit recovery did not produce a usable new owner.");
    }
    return { actualRProcessExit: true, disposition: exited.executionDisposition,
        bytes, bothTailMarkersObserved: true, recoveredOutcome: recovered.outcome,
        crossStreamOrderClaimed: false };
};

const checkNativeChildInterrupt = async function(options) {
    const startIndex = options.readProcessEvents().length;
    let deadline;
    const pending = options.execute([
        'local({ status <- system2("/bin/sh",c("-c",shQuote(',
        JSON.stringify("printf 'pipe-interrupt-child-ready\n'; sleep 20; printf 'pipe-interrupt-child-unreachable\n'"),
        ')),stdout="",stderr=""); cat(paste0("pipe-interrupt-child-status=",status,"\\n")); status })'
    ].join(" "), "answer");
    try {
        let announced = false;
        for (let attempt = 0; attempt < 100 && !announced; attempt++) {
            announced = options.readProcessEvents().slice(startIndex).some(record =>
                String(record.event.message || "").includes("pipe-interrupt-child-ready"));
            if (!announced) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        if (!announced) {
            throw Error("Actual foreground OS child did not announce before Interrupt.");
        }
        const started = Date.now();
        const reply = await options.interrupt();
        if (reply.status !== "ready") {
            throw Error("Native physical Interrupt request failed: " + reply.message);
        }
        const interrupted = await Promise.race([
            pending,
            new Promise((_, reject) => {
                deadline = setTimeout(() => reject(Error(
                    "Native Interrupt did not release the foreground OS-child wait within two seconds."
                )), 2000);
            })
        ]);
        const returnedText = interrupted.records.map(record =>
            String(record.event.message || "")).join("");
        const status = returnedText.match(/pipe-interrupt-child-status=(\d+)/);
        if (interrupted.outcome !== "success" || !status || Number(status[1]) === 0) {
            throw Error("Native child cancellation did not preserve R system2 exit-status semantics.");
        }
        if (options.readProcessEvents().slice(startIndex).some(record =>
            String(record.event.message || "").includes("pipe-interrupt-child-unreachable"))) {
            throw Error("Foreground OS child continued after the accepted group Interrupt.");
        }
        const elapsed = Date.now() - started;
        const recovered = await options.execute('cat("pipe-interrupt-recovered\\n")', "answer");
        if (recovered.outcome !== "success") {
            throw Error("Native command did not recover after foreground OS-child Interrupt.");
        }
        return { actualOSChild: true, interruptMilliseconds: elapsed,
            outcome: interrupted.outcome, childExitStatus: Number(status[1]),
            ordinaryRSystemStatusPreserved: true, recoveredOutcome: recovered.outcome };
    } finally {
        clearTimeout(deadline);
        await options.restart("clean");
        await pending;
    }
};

const checkNativeChildRetirement = async function(options) {
    const pidPath = path.join(options.privateDirectory, "foreign-child.pid");
    if (fs.existsSync(pidPath)) {
        throw Error("Native child fixture must not overwrite an existing PID record");
    }
    try {
        const started = await options.execute([
            "local({",
            '    script <- paste0("printf \'%s\' $$ > ", shQuote(' + JSON.stringify(pidPath) + '),',
            '        "; sleep 1; printf \'pipe-retired-child\\\\n\'")',
            '    system2("/bin/sh", c("-c", shQuote(script)), stdout="", stderr="", wait=FALSE)',
            '    cat("pipe-owned-child-started\\n")',
            "})"
        ].join("\n"), "answer");
        if (started.outcome !== "success") {
            throw Error("Task-owned child did not launch before replacement");
        }
        let pid = 0;
        for (let count = 0; count < 50 && pid < 2; count++) {
            if (fs.existsSync(pidPath)) {
                pid = Number(fs.readFileSync(pidPath, "utf8"));
            }
            if (pid < 2) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        if (!Number.isSafeInteger(pid) || pid < 2) {
            throw Error("Exact task-owned child PID was not established");
        }
        const before = spawnSync("/bin/ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" });
        if (before.error || before.status !== 0 || !before.stdout.trim() || before.stdout.trim().startsWith("Z")) {
            throw Error("Task-owned child was not live before actual replacement");
        }
        const eventCount = options.readProcessEvents().length;
        const replacement = await options.restart("clean");
        if (replacement.status !== "ready") {
            throw Error("Actual replacement with owned background child failed");
        }
        const fresh = await options.execute('Sys.sleep(1.2); cat("pipe-new-owner\\n")', "answer");
        if (fresh.outcome !== "success") {
            throw Error("New owner failed after background child retirement");
        }
        const after = spawnSync("/bin/ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" });
        if (after.error || (after.stdout.trim() && !after.stdout.trim().startsWith("Z"))) {
            throw Error("Task-owned retired child is still executing");
        }
        if (options.readProcessEvents().slice(eventCount).some(record =>
            String(record.event.message || "").includes("pipe-retired-child"))) {
            throw Error("Retired child pipe bytes entered the replacement transcript");
        }
        return { actualOwnedChildLiveBeforeRestart: true,
            retiredChildState: after.stdout.trim() ? "zombie-not-executing" : "exited",
            retiredPipeEvents: 0, freshOutcome: fresh.outcome };
    } finally {
        if (fs.existsSync(pidPath)) {
            fs.unlinkSync(pidPath);
        }
    }
};
