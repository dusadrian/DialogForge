"use strict";
const { runScriptCodeBatch } = require("../dist/src/script-editor/run/scriptCodeBatch");
const { createRuntimeCommandReceipt } = require("../dist/src/runtime/commands/runtimeCommandReceipt");
const { createHelpCommandActions } = require("../dist/src/runtime/help/helpCommandActions");
const { createHelpCommandUrl } = require("../dist/src/runtime/help/helpCommandUrl");
const { readAcceptedTranscriptRecords } = require("./runtime-transcript-acceptance");

exports.checkActualAuxiliaryCommandReceipts = async function(options) {
    let calls = 0;
    const boundaries = [];
    const commandResults = [];
    const run = chunks => runScriptCodeBatch({ chunks }, {
        ensureRuntimeReady: async () => true,
        executeVisibleCommand: async request => {
            calls++;
            const result = await options.execute(request.text, "answer", { inspectJournal: false });
            commandResults.push({ disposition: result.executionDisposition, outcome: result.outcome,
                returnedEventCount: result.returnedEvents.length,
                returnedMarker: result.returnedEvents.some(event => event.message === "actual-batch-after-error\n") });
            return createRuntimeCommandReceipt({
                executionDisposition: result.executionDisposition,
                evaluationOutcome: result.outcome, transcriptEvents: result.returnedEvents,
                workspaceUpdate: result.workspaceUpdate
            }, result.executionDisposition !== "session_lost");
        },
        publishCommandBoundary: code => boundaries.push(code)
    });
    const observations = [];
    try {
        const ordinary = await run([
            'actual_batch_error <- 1L; stop("actual batch ordinary error")',
            'actual_batch_after_error <- 2L; cat("actual-batch-after-error\\n")'
        ]);
        if (ordinary.status !== "submitted" || calls !== 2 || boundaries.length !== 2
            || commandResults[0].outcome !== "error" || commandResults[1].outcome !== "success") {
            throw Error(options.host + ": Ordinary R error changed existing subsequent chunk behavior: "
                + JSON.stringify({ status: ordinary.status, calls, boundaries: boundaries.length, commandResults }));
        }
        const verified = await options.execute(
            "stopifnot(actual_batch_error == 1L, actual_batch_after_error == 2L)", "answer");
        if (verified.outcome !== "success") {
            throw Error(options.host + ": Actual later-chunk R values were not retained after ordinary error");
        }
        observations.push({ scenario: "ordinary-error", actualRProducer: true,
            status: ordinary.status, calls, boundaries: boundaries.length,
            actualRValuesVerified: true });

        const helpCommands = [];
        const help = createHelpCommandActions({
            openHelpTopic: async () => {
                throw Error("The execution fixture must not substitute a help viewer");
            },
            executeVisibleCommand: async request => {
                helpCommands.push(request.text);
                const result = await options.execute(request.text, "answer", { inspectJournal: false });
                return createRuntimeCommandReceipt({
                    executionDisposition: result.executionDisposition,
                    evaluationOutcome: result.outcome,
                    transcriptEvents: result.returnedEvents,
                    workspaceUpdate: result.workspaceUpdate
                }, result.executionDisposition !== "session_lost");
            }
        });
        const helpCode = [
            'actual_help_percent <- "100% %20 %2B %zz"',
            'actual_help_unicode <- "a+b & Ω😀"',
            'actual_help_modulo <- 5 %% 2',
            'cat(actual_help_percent, actual_help_unicode, actual_help_modulo)'
        ].join("\n");
        const helpRun = await help.openCommandUrl(createHelpCommandUrl("run", helpCode));
        if (helpRun.status !== "ready" || helpCommands.length !== 1 || helpCommands[0] !== helpCode) {
            throw Error(options.host + ": Shared help URL changed or rejected the actual R payload");
        }
        const helpValues = await options.execute([
            'stopifnot(identical(actual_help_percent, "100% %20 %2B %zz"))',
            'stopifnot(identical(actual_help_unicode, "a+b & Ω😀"))',
            'stopifnot(identical(actual_help_modulo, 1))'
        ].join("; "), "answer");
        const helpError = await help.openCommandUrl(createHelpCommandUrl(
            "run", 'stop("actual help command error")'
        ));
        const helpExample = await help.runExample({ topic: "mean", package: "base" });
        if (helpValues.outcome !== "success" || helpError.status !== "error"
            || helpExample.status !== "ready" || helpCommands.length !== 3) {
            throw Error(options.host + ": Actual help error/example execution or recovery failed");
        }
        observations.push({ scenario: "help-command-payload-and-example", actualRProducer: true,
            multilinePayloadPreserved: true, percentUnicodeModuloValuesVerified: true,
            status: helpRun.status, errorStatus: helpError.status,
            exampleStatus: helpExample.status, calls: helpCommands.length,
            renderedHelpChecked: false });

        const pager = await options.execute([
            'local({',
            '    rt <- as.environment("DialogApp")',
            '    stopifnot(identical(getOption("pager"), rt$runtime_console_pager))',
            '    paths <- c(tempfile("actual-pager-first-"), tempfile("actual-pager-second-"))',
            '    on.exit(unlink(paths), add = TRUE)',
            '    writeLines(c("100% %20", "Ω😀"), paths[[1]])',
            '    writeLines("second file", paths[[2]])',
            '    base::file.show(paths, header = c("First", "Second"), delete.file = TRUE)',
            '    stopifnot(!any(file.exists(paths)))',
            '})'
        ].join("\n"), "answer", { inspectJournal: false });
        const pagerText = readAcceptedTranscriptRecords(pager.records)
            .filter(record => record.event.type === "output")
            .map(record => record.event.message || "").join("");
        if (pager.outcome !== "success"
            || pagerText.trimEnd() !== "First\n100% %20\nΩ😀\n\nSecond\nsecond file") {
            throw Error(options.host + ": Actual file.show did not use the shared pager: "
                + JSON.stringify({ outcome: pager.outcome, text: pagerText }));
        }
        const helpSearch = await options.execute([
            'local({',
            '    rt <- as.environment("DialogApp")',
            '    found <- rt$help_search_matches("Arithmetic Mean")',
            '    stopifnot(identical(found$kind, "search"))',
            '    stopifnot(length(found$matches) > 0L, length(found$matches) <= 40L)',
            '    paths <- vapply(found$matches, function(match) match$path, "")',
            '    stopifnot(any(grepl("/library/base/html/mean[.]html$", paths)))',
            '    empty <- rt$help_search_matches("")',
            '    stopifnot(identical(empty$kind, "search"), length(empty$matches) == 0L)',
            '})'
        ].join("\n"), "answer", { inspectJournal: false });
        if (helpSearch.outcome !== "success") {
            throw Error(options.host + ": Actual shared help search did not retain matching topic paths");
        }
        observations.push({ scenario: "pager-and-help-search", actualRProducer: true,
            fileShowOutputVerified: true, pagerFilesDeleted: true,
            boundedSearchAndEmptyVerified: true, renderedHelpChecked: false });

        const probe = options.captureProbe();
        probe.arm("late-success");
        calls = 0;
        boundaries.length = 0;
        const pending = run([
            "actual_batch_before_loss <- 41L",
            "actual_batch_after_loss <- 42L"
        ]);
        try {
            const producer = await probe.waitForReply();
            if (!producer.ok || producer.outcome !== "success") {
                throw Error(options.host + ": Batch gate did not follow actual completed R command");
            }
            const replacement = await options.restart("clean");
            if (replacement.status !== "ready") throw Error(options.host + ": Batch replacement failed");
            probe.release();
            const lost = await pending;
            if (lost.status !== "unavailable" || calls !== 1 || boundaries.length !== 0 || lost.events.length) {
                throw Error(options.host + ": Retired batch submitted later chunks/published stale events");
            }
            const fresh = await options.execute([
                'stopifnot(!exists("actual_batch_before_loss"), !exists("actual_batch_after_loss"))',
                'actual_batch_recovered <- 43L'
            ].join("; "), "answer");
            if (fresh.outcome !== "success" || !fresh.workspaceUpdate?.workspaceRevision) {
                throw Error(options.host + ": Retired batch replacement did not recover");
            }
            observations.push({ scenario: "retired-completed-command", actualRProducer: true,
                status: lost.status, calls, boundaries: 0, staleEvents: 0,
                laterChunkExecuted: false, recoveryOutcome: fresh.outcome });
        } finally {
            probe.release();
        }
        if (options.checkStartupQueries) {
            for (let cycle = 1; cycle <= 4; cycle++) {
                const seeded = await options.execute("actual_startup_old <- 41L", "answer", {
                    inspectJournal: false
                });
                if (seeded.outcome !== "success") {
                    throw Error(options.host + ": Startup cycle could not seed the old workspace");
                }
                const startedAt = performance.now();
                const replacement = await options.restart("clean");
                const readyAt = performance.now();
                if (replacement.status !== "ready") {
                    throw Error(options.host + ": Startup cycle replacement unavailable: "
                        + String(replacement.message || replacement.status));
                }
                const queries = await Promise.all([1, 2, 3].map(index => options.query({
                    query: 'local({ stopifnot(!exists("actual_startup_old", .GlobalEnv, inherits = FALSE)); '
                        + 'Sys.sleep(0.03); "startup-query-' + cycle + '-' + index + '" })',
                    source: "paired-startup-query"
                })));
                const queriedAt = performance.now();
                for (let index = 0; index < queries.length; index++) {
                    const result = queries[index];
                    if (result.status !== "ready" || result.value !== "startup-query-" + cycle + "-" + (index + 1)) {
                        throw Error(options.host + ": Startup query response mismatch: "
                            + JSON.stringify({ cycle, index, status: result.status,
                                value: result.value, message: result.message }));
                    }
                }
                const recovered = await options.execute("actual_startup_new <- 42L", "answer", {
                    inspectJournal: false
                });
                if (recovered.outcome !== "success" || !recovered.workspaceUpdate?.workspaceRevision) {
                    throw Error(options.host + ": Startup cycle following command did not reconcile");
                }
                observations.push({ scenario: "restart-concurrent-queries", cycle,
                    replacementMilliseconds: Math.round(readyAt - startedAt),
                    queriesMilliseconds: Math.round(queriedAt - readyAt),
                    distinctQueryResponses: 3, oldWorkspaceExcluded: true,
                    followingCommandOutcome: recovered.outcome,
                    firstSocketReadCheckedSeparately: true, renderedProductChecked: false });
            }
        }
        return { host: options.host, observations, sameBatchRunner: true,
            controlledReplyGate: true, renderedProductChecked: false };
    } finally {
        await options.restart("clean");
    }
};
