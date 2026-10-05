"use strict";

// ONE retained-response overflow scenario; adapters supply the same small test
// budget. Normal grouped/batched mode, not a claim about streaming backpressure.
exports.checkActualOutputBudget = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) {
            throw Error(options.host + ": " + message);
        }
    };
    const overloaded = await options.execute(
        'retention_before <- 1L; cat(strrep("x", 131072L)); retention_after <- 2L',
        "answer", { inspectJournal: false });
    requireResult(overloaded.outcome !== "success", "Over-budget response reported success");
    requireResult(overloaded.failed && overloaded.terminal,
        "Over-budget response did not produce a terminal failure");
    requireResult(overloaded.returnedEvents.some(event =>
        String(event.message || "").includes("runtime-session-event-retention-limit")),
        "Expected retention failure was not reported");
    requireResult(!overloaded.workspaceUpdate, "Rejected over-budget response applied workspace effects");
    const query = await options.getRuntime().executeInvisibleQuery({
        query: '"must-not-dispatch"', source: "paired-retention-after-failure"
    });
    requireResult(query.status !== "ready", "Retired control attachment accepted another query");
    const restarted = await options.restart("clean");
    requireResult(restarted.status === "ready", "Actual over-budget replacement failed");
    const recovered = await options.execute(
        'stopifnot(!exists("retention_before"), !exists("retention_after")); cat("retention-recovered\\n")', "answer");
    requireResult(recovered.outcome === "success" && recovered.workspaceUpdate?.workspaceRevision,
        "Fresh owner did not recover after rejected response");
    return { host: options.host, retentionBytes: options.retentionBytes, outputBytes: 131072,
        rejectedOutcome: overloaded.outcome ?? "unavailable-after-transport-failure",
        reportedFailure: "runtime-session-event-retention-limit",
        rejectedWorkspaceEffects: !overloaded.workspaceUpdate,
        rejectedNextQuery: query.status, recovery: recovered.outcome,
        renderedConsoleChecked: false, streamingBackpressureChecked: false };
};
