"use strict";
const { readAcceptedTranscriptRecords } = require("./runtime-transcript-acceptance");

// ONE set of actual R connection/sink producers, executed by both adapters.
exports.checkActualConnectionOutput = async function(options) {
    const scenarios = [
        {
            name: "direct-connections",
            code: 'writeLines("connection-stdout", stdout()); writeLines("connection-stderr", stderr()); flush(stdout()); flush(stderr())',
            included: ["connection-stdout", "connection-stderr"], outcome: "success"
        },
        {
            name: "balanced-nested-output-sinks",
            code: [
                'local({',
                '    paths <- c(tempfile("df-output-outer-"), tempfile("df-output-inner-"))',
                '    on.exit(unlink(paths))',
                '    cat("nested-before\\n")',
                '    sink(paths[[1L]])',
                '    cat("hidden-outer-a\\n")',
                '    sink(paths[[2L]])',
                '    cat("hidden-inner\\n")',
                '    sink()',
                '    cat("hidden-outer-b\\n")',
                '    sink()',
                '    stopifnot(identical(readLines(paths[[1L]]), c("hidden-outer-a", "hidden-outer-b")))',
                '    stopifnot(identical(readLines(paths[[2L]]), "hidden-inner"))',
                '    cat("nested-after\\n")',
                '})'
            ].join("\n"),
            included: ["nested-before", "nested-after"], excluded: ["hidden-outer", "hidden-inner"], outcome: "success"
        },
        {
            name: "balanced-message-redirection",
            code: [
                'local({',
                '    path <- tempfile("df-message-")',
                '    on.exit(unlink(path))',
                '    previous <- getConnection(sink.number(type = "message"))',
                '    connection <- file(path, "wt")',
                '    sink(connection, type = "message")',
                '    cat("hidden-message\\n", file = stderr())',
                '    sink(previous, type = "message")',
                '    close(connection)',
                '    stopifnot(identical(readLines(path), "hidden-message"))',
                '    cat("message-recovered\\n", file = stderr())',
                '})'
            ].join("\n"),
            included: ["message-recovered"], excluded: ["hidden-message"], outcome: "success"
        },
        {
            name: "split-output-sink",
            code: [
                'local({',
                '    path <- tempfile("df-split-")',
                '    on.exit(unlink(path))',
                '    sink(path, split = TRUE)',
                '    cat("split-visible\\n")',
                '    sink()',
                '    stopifnot(identical(readLines(path), "split-visible"))',
                '})'
            ].join("\n"),
            included: ["split-visible"], outcome: "success"
        },
        {
            name: "nested-sink-error-cleanup",
            code: [
                'local({',
                '    path <- tempfile("df-sink-error-")',
                '    cat("before-sink-error\\n")',
                '    sink(path)',
                '    on.exit({ sink(); unlink(path) })',
                '    cat("hidden-error-content\\n")',
                '    stop("nested-sink-failure")',
                '})'
            ].join("\n"),
            included: ["before-sink-error", "nested-sink-failure"], excluded: ["hidden-error-content"], outcome: "error"
        },
        {
            name: "unbalanced-output-sink",
            code: [
                '.df_sink_expected_depth <- sink.number(type = "output")',
                '.df_sink_path <- tempfile("df-unbalanced-")',
                '.df_sink_connection <- file(.df_sink_path, "wt")',
                'sink(.df_sink_connection)',
                'cat("hidden-unbalanced\\n")',
                'invisible(NULL)'
            ].join("\n"),
            included: [], excluded: ["hidden-unbalanced"], outcome: "success"
        },
        {
            name: "unbalanced-sink-recovery",
            code: [
                'stopifnot(sink.number(type = "output") == .df_sink_expected_depth)',
                'close(.df_sink_connection)',
                'stopifnot(identical(readLines(.df_sink_path), "hidden-unbalanced"))',
                'unlink(.df_sink_path)',
                'rm(.df_sink_path, .df_sink_connection, .df_sink_expected_depth)',
                'cat("unbalanced-recovered\\n")'
            ].join("\n"),
            included: ["unbalanced-recovered"], outcome: "success"
        }
    ];
    const observations = [];
    let failure;
    try {
        for (const scenario of scenarios) {
            const result = await options.execute(scenario.code, "answer");
            const text = readAcceptedTranscriptRecords(result.records).filter(record => record.event.type === "output")
                .map(record => record.event.message || "").join("");
            if (result.outcome !== scenario.outcome || !result.terminal
                || result.failed !== (scenario.outcome === "error")) {
                throw Error(options.host + ": " + scenario.name + " outcome/delivery changed: "
                    + JSON.stringify({ outcome: result.outcome, terminal: result.terminal, failed: result.failed, text,
                        failures: result.records.filter(record => record.event.type === "failed")
                            .map(record => record.event.message) }));
            }
            for (const marker of scenario.included) {
                if (text.split(marker).length !== 2) {
                    throw Error(options.host + ": " + scenario.name + " must deliver marker exactly once: " + marker);
                }
            }
            if (scenario.excluded?.some(marker => text.includes(marker))) {
                throw Error(options.host + ": " + scenario.name + " leaked redirected content");
            }
            if (result.journalCount !== 0) {
                throw Error(options.host + ": " + scenario.name + " retained a completed journal");
            }
            observations.push({ scenario: scenario.name, outcome: result.outcome,
                terminalAccepted: true, contentAndCleanupAccepted: true, completedJournals: 0 });
        }
    } catch (error) {
        failure = String(error);
    } finally {
        // Exact test-owned connections/files/workspace only. A failed sink
        // fixture cannot contaminate later acceptance on this disposable host.
        const replacement = await options.restart("clean");
        if (replacement.status !== "ready") throw Error(options.host + ": Sink fixture cleanup failed");
    }
    if (failure) throw Error(failure);
    return { host: options.host, actualRConnections: true, observations,
        renderedProductChecked: false, crossPipeOrderClaimed: false };
};
