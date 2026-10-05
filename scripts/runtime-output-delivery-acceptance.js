"use strict";

// ONE failure probe and scenario for both actual output adapters. This is
// synchronous consumer rejection, not a renderer-paint or network-stall test.
exports.createOutputDeliveryFailureProbe = function() {
    let armed = false;
    let rejected = 0;
    return {
        arm() {
            armed = true;
            rejected = 0;
        },
        receive(events) {
            if (armed && events.some(event => event.type === "output"
                && String(event.message || "").includes("delivery-probe"))) {
                armed = false;
                rejected++;
                throw Error("Scoped transcript consumer rejected delivery-probe");
            }
        },
        rejectedCount() {
            return rejected;
        }
    };
};

exports.checkActualOutputDeliveryFailure = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) {
            throw Error(options.host + ": " + message);
        }
    };
    await options.arm();
    const rejected = await options.execute(
        'delivery_before <- 1L; cat("delivery-probe\\n"); delivery_after <- 2L', "answer");
    requireResult(await options.rejectedCount() === 1, "Actual output receiver was not rejected once");
    requireResult(rejected.failed && rejected.terminal,
        "Rejected transcript delivery did not produce terminal failure");
    // R evaluation and output acceptance are separate facts: a consumer fault
    // must not pretend the already executed assignments were rolled back.
    requireResult(rejected.outcome === "success" && rejected.workspaceUpdate?.workspaceRevision,
        "Successful R evaluation and its workspace receipt were incorrectly discarded");
    requireResult(rejected.returnedEvents.some(event =>
        String(event.message || "").includes("Scoped transcript consumer rejected delivery-probe")),
        "Rejected transcript cause was not reported");
    const recovered = await options.execute(
        'stopifnot(delivery_before == 1L, delivery_after == 2L); cat("delivery-recovered\\n")', "answer");
    requireResult(recovered.outcome === "success", "Same attachment failed after consumer rejection");
    const restarted = await options.restart("clean");
    requireResult(restarted.status === "ready", "Actual replacement after consumer rejection failed");
    const cleaned = await options.execute(
        'stopifnot(!exists("delivery_before"), !exists("delivery_after")); cat("delivery-clean\\n")', "answer");
    requireResult(cleaned.outcome === "success" && cleaned.journalCount === 0,
        "Replacement did not dispose failed output resources");
    const encoding = options.checkEncoding ? await checkActualOutputEncodingFailures(options) : undefined;
    return { host: options.host, rejectedReceivers: 1, rejectedCompletion: "failed",
        rEvaluationOutcome: rejected.outcome,
        committedWorkspaceReceipt: Boolean(rejected.workspaceUpdate?.workspaceRevision),
        sameAttachmentRecovery: recovered.outcome, failedJournalCount: rejected.journalCount,
        cleanReplacement: cleaned.outcome, replacementJournalCount: cleaned.journalCount,
        encoding, renderedConsoleChecked: false, physicalWriteStallChecked: false };
};

const checkActualOutputEncodingFailures = async function(options) {
    const results = [];
    for (const scenario of [
        { name: "invalid-utf8", code: 'cat(rawToChar(as.raw(c(195L, 40L))))', detail: "encoded data was not valid" },
        { name: "incomplete-utf8", code: 'cat(rawToChar(as.raw(195L)))', detail: "incomplete text" },
        { name: "cross-channel-utf8", code: 'cat(rawToChar(as.raw(195L))); cat(rawToChar(as.raw(169L)), file=stderr())',
            detail: "crosses output channels" }
    ]) {
        const result = await options.execute(scenario.code, "answer");
        if (result.outcome !== "success" || !result.failed || !result.terminal
            || !result.returnedEvents.some(event => String(event.message || "").includes(scenario.detail))) {
            throw Error(options.host + ": " + scenario.name + " did not reject actual malformed bytes: "
                + JSON.stringify({ outcome: result.outcome, failed: result.failed, events: result.returnedEvents }));
        }
        const recovered = await options.execute('cat("encoding-recovered\\n")', "answer");
        if (recovered.outcome !== "success") {
            throw Error(options.host + ": " + scenario.name + " did not recover on the same attachment");
        }
        results.push({ name: scenario.name, rEvaluationOutcome: result.outcome,
            completion: "failed", sameAttachmentRecovery: recovered.outcome });
    }
    const replacement = await options.restart("clean");
    if (replacement.status !== "ready") {
        throw Error(options.host + ": encoding failure replacement did not start");
    }
    const clean = await options.execute('cat("encoding-clean\\n")', "answer");
    if (clean.outcome !== "success" || clean.journalCount !== 0) {
        throw Error(options.host + ": failed encoding journals survived replacement");
    }
    return { cases: results, replacementJournalCount: clean.journalCount };
};
