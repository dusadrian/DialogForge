"use strict";

// Real disposable R processes/workers. This does not launch or control either
// product UI and does not change the default grouped/batched output policy.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const { build } = require("esbuild");
const chromium = process.env.DIALOGFORGE_TEST_NATIVE_ONLY === "1"
    ? null : require("playwright").chromium;
const { createBrowserNodeFallbackPlugin } = require("./browser-node-fallbacks");
const { readRegressionPackageLibrary, regressionPackageLibrarySource,
    serveRegressionPackageLibrary } = require("./webr-regression-package-library");
const { createRuntimeProvider } = require("../dist/src/runtime/providers/r/runtimeProvider");
const { createRuntimeSessionManager } = require("../dist/src/runtime/session/runtimeSessionManager");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");
const { readAcceptedTranscriptRecords } = require("./runtime-transcript-acceptance");
const { createConsoleCommandHistory } = require("../dist/src/console/services/consoleCommandHistory");
const { createConsoleHistorySettingsStore } = require("../dist/src/console/services/consoleHistorySettingsStore");
const { readEffectiveSettings, writeUserSettings } = require("../dist/src/shell-electron/settings/settingsStorage");
const { checkActualHistoryStorage } = require("./runtime-history-storage-acceptance");
const { createRuntimeRestartController } = require("../dist/src/runtime/session/runtimeRestartController");
const { createDatasetEditorWarmCache } = require("../dist/src/dataset-editor/datasetEditorWarmCache");
const { createRuntimeDialogDatasetResolverOwner } =
    require("../dist/src/dialog-runtime/custom-js/runtimeDatasetResolver");
const { measureRuntimeDatasetWarming } = require("./runtime-dataset-warm-acceptance");
const { createWorkspaceDatasetCacheEffects, applyWorkspaceDatasetCacheEffects,
    prepareWorkspaceDatasetCacheEffects } = require("../dist/src/runtime/workspace/workspaceUpdateEffects");
const { createWorkspaceSnapshotDelivery } = require("../dist/src/runtime/workspace/workspaceSnapshotDelivery");
const { checkActualRuntimeGraphics } = require("./runtime-graphics-acceptance");
const { checkActualRuntimeHelp, checkActualHelpRetirement,
    checkExecutingHelpRetirement } = require("./runtime-help-acceptance");
const { createPartialHelpTransfer } = require("./native-help-transfer-fixture");
const { checkWebRHelpServiceWorker } = require("./webr-help-service-worker-acceptance");
const { checkActualRuntimeCompletions, checkActualCompletionRetirement,
    checkExecutingCompletionRetirement, checkActualCompletionWorkspaceFreshness } = require("./runtime-completion-acceptance");
const { checkActualRuntimePackages } = require("./runtime-package-acceptance");
const { checkActualPackageDatasetCache } = require("./runtime-package-dataset-cache-acceptance");
const { checkActualPackageInstallation } = require("./runtime-package-install-acceptance");
const { checkActualPackageDependencies } = require("./runtime-package-dependency-acceptance");
const { checkActualOutputBudget } = require("./runtime-output-budget-acceptance");
const { createOutputDeliveryFailureProbe, checkActualOutputDeliveryFailure } =
    require("./runtime-output-delivery-acceptance");
const { createOutputDeliveryRetirementProbe, checkActualOutputDeliveryRetirement } =
    require("./runtime-output-retirement-acceptance");
const { checkNativeProcessPipeOwnership } = require("./native-process-pipe-acceptance");
const { checkActualCommandEventLog, createCommandEventRetirementProbe,
    checkActualCommandEventRetirement } = require("./runtime-command-event-acceptance");
const { checkActualPromptRetirement } = require("./runtime-prompt-retirement-acceptance");
const { checkActualConnectionOutput } = require("./runtime-connection-output-acceptance");
const { checkActualVisibleOperationDisposition } = require("./runtime-visible-operation-acceptance");
const { checkActualAuxiliaryCommandReceipts } = require("./runtime-auxiliary-command-acceptance");
const { createRPackagePreparationController, prepareRequiredRPackages } = require("../dist/src/runtime/providers/r/dependencies/rPackageRequirementReadiness");
const { loadRequiredRPackages, attachRequiredRPackages, requireSuccessfulRPackageAttachment } = require("../dist/src/runtime/providers/r/dependencies/rPackageAttachment");
const { captureRPackageRuntime } = require("../dist/src/runtime/providers/r/dependencies/rPackageRuntimeGuard");
const { createRPackageInstallWorkflow } = require("../dist/src/runtime/providers/r/dependencies/packageInstallWorkflow");
const { createRequiredInstallCommand } = require("../dist/src/runtime/providers/r/dependencies/packageInstallPlan");
const { createRConsoleCompletionReader } = require("../dist/src/runtime/providers/r/completions/rConsoleRuntimeCompletion");
const { createRHelpServer } = require("../dist/src/runtime/providers/r/help/rHelpServer");
const { createRHelpPageProxy } = require("../dist/src/runtime/providers/r/help/rHelpPageProxy");
const { createNodeResourceClient } = require("../dist/src/core/host/nodeResourceClient");
const { readPlotExportResource } = require("../dist/src/base-app/features/plot-viewer/plotExportOperations");
const { PNG } = require("pngjs");

const root = path.resolve(__dirname, "..");
const sourceDirectory = path.join(root, "src/runtime/providers/r/r-sources");
const groupedInput = process.env.DIALOGFORGE_TEST_GROUPED_INPUT === "1";
const retentionBytes = process.env.DIALOGFORGE_TEST_OUTPUT_BUDGET === "1" ? 32768 : undefined;
assert.ok(!retentionBytes || groupedInput,
    "OUTPUT_BUDGET tests grouped control-response retention; set GROUPED_INPUT=1. "
        + "Ordered journal delivery/backpressure requires its separate acceptance cases.");
let emptyPackageRepository;
let validPackageRepository;
let upgradePackageRepository;
let stalePackageRepository;
let corruptPackageRepository;
let partialPackageRepository;
let dependencyPackageRepository;
let seedDependencyRepository;
const graphicsStateQuery = 'local({rt <- as.environment("DialogApp"); jsonlite::toJSON(list(count=as.integer(rt$plot_last_count), upid=rt$plot_last_upid, generation=as.integer(rt$plot_last_device_generation), url=rt$plot_last_url, registered=length(rt$runtime_graphics_devices)), auto_unbox=TRUE)})';
const cases = [
    {
        name: "interleaved-incremental-unicode",
        code: 'cat("alpha\\n"); Sys.sleep(1); cat("beta\\n", file=stderr()); cat("\\nΩ😀\\n\\n")',
        exact: "alpha\nbeta\n\nΩ😀\n\n", early: true, outcome: "success",
        grouped: { exact: "beta\nalpha\n\nΩ😀" }
    },
    {
        name: "deferred-warning",
        code: 'local({ old <- options(warn=0); on.exit(options(old)); cat("before\\n"); warning("deferred marker", call.=FALSE); cat("after\\n") })',
        prefix: "before\nafter\n", includes: "deferred marker", outcome: "success"
    },
    {
        name: "message-between-streams",
        code: 'cat("first\\n"); message("middle"); cat("last\\n")',
        exact: "first\nmiddle\nlast\n", outcome: "success",
        grouped: { exact: "first\nlastmiddle\n" }
    },
    {
        name: "utf8-across-native-frame-boundary",
        code: 'cat(paste0(strrep("x", 65535L), "Ω😀\\n"))',
        exact: "x".repeat(65535) + "Ω😀\n", outcome: "success"
    },
    {
        name: "immediate-warning",
        code: 'local({ old <- options(warn=1); on.exit(options(old)); cat("before\\n"); warning("immediate marker", call.=FALSE); cat("after\\n") })',
        prefix: "before\n", includes: "immediate marker", suffix: "after\n", outcome: "success",
        grouped: { exact: "before\nafterWarning message:\nimmediate marker", suffix: "immediate marker" }
    },
    {
        name: "suppressed-warning",
        code: 'local({ old <- options(warn=-1); on.exit(options(old)); warning("hidden marker", call.=FALSE); cat("kept\\n") })',
        exact: "kept\n", outcome: "success"
    },
    {
        name: "warning-converted-to-error",
        code: 'local({ old <- options(warn=2); on.exit(options(old)); cat("before\\n"); warning("fatal marker", call.=FALSE); cat("unreachable\\n") })',
        prefix: "before\n", includes: "fatal marker", excludes: "unreachable", outcome: "error"
    },
    {
        name: "evaluation-error-and-tail",
        code: 'cat("partial\\n"); stop("paired error marker")',
        prefix: "partial\n", includes: "paired error marker", outcome: "error"
    },
    { name: "visible-value", code: "42L", includes: "42", outcome: "success" },
    { name: "empty-output-seal", code: "invisible(NULL)", exact: "", outcome: "success" },
    {
        name: "compiled-rprintf-inspection",
        code: 'cat("before-compiled\\n"); .Internal(inspect(1L)); cat("after-compiled\\n")',
        prefix: "before-compiled\n", includes: " INTSXP ", suffix: "after-compiled\n", outcome: "success"
    },
    {
        name: "compiled-gc-diagnostic",
        code: 'cat("before-gc\\n"); invisible(gc(verbose=TRUE)); cat("after-gc\\n")',
        prefix: "before-gc\n", includes: "Garbage collection", suffix: "after-gc\n", outcome: "success",
        grouped: { prefix: "Garbage collection" }
    },
    {
        name: "output-around-real-input-reply",
        code: 'local({ cat("before-input\\n"); value <- readline("paired question: "); cat("answer=", value, "\\n", sep="") })',
        exact: "before-input\nanswer=answer\n", outcome: "success", prompt: true
    },
    {
        name: "blank-real-input-reply",
        code: 'local({ cat("before-blank\\n"); value <- readline(""); cat("answer=", value, "\\n", sep="") })',
        exact: "before-blank\nanswer=\n", outcome: "success", prompt: true, reply: ""
    },
    {
        name: "unicode-real-input-reply",
        code: 'local({ value <- readline("unicode input: "); cat("unicode=", value, "\\n", sep="") })',
        exact: "unicode=Ω😀é\n", outcome: "success", prompt: true, reply: "Ω😀é"
    },
    {
        name: "interactivity-restored-after-input",
        code: 'local({ readline("scoped input: "); cat("interactive=", base::interactive(), "\\n", sep="") })',
        exact: "interactive=FALSE\n", outcome: "success", prompt: true
    },
    {
        name: "menu-output-around-real-reply",
        code: 'local({ cat("before-menu\\n"); selected <- utils::menu(c("first", "second")); cat("after-menu=", selected, "\\n", sep="") })',
        prefix: "before-menu\n1: first\n2: second", suffix: "after-menu=2\n",
        grouped: { prefix: "1: first\n2: secondbefore-menu" },
        outcome: "success", prompt: true, reply: "2"
    },
    {
        name: "menu-invalid-reply-then-valid",
        code: 'local({ cat("before-retry\\n"); selected <- utils::menu(c("first", "second"), title="Choose"); cat("after-retry=", selected, "\\n", sep="") })',
        prefix: "before-retry\nChoose\n1: first\n2: second", suffix: "after-retry=2\n",
        grouped: {
            prefix: "Choose\n1: first\n2: second"
                + "Enter a number between 1 and 2, or enter 0 to exit.before-retry"
        },
        outcome: "success", promptCount: 2, reply: ["invalid", "2"]
    },
    {
        name: "password-mode-real-reply",
        code: 'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code); value <- rt$wait_for_prompt_reply("secret fixture: ", TRUE); cat("password-length=", nchar(value), "\\n", sep="") })',
        exact: "password-length=14\n", outcome: "success", prompt: true,
        reply: "fixture-secret", password: true
    },
    {
        name: "ordinary-preview-before-method-override",
        code: 'inspection_hits <- 0L; inspection_data <- data.frame(date=as.Date("2026-10-02"), value=c(11,22)); cat("ordinary-preview\\n")',
        exact: "ordinary-preview\n", outcome: "success",
        workspaceObject: { name: "inspection_data", hasViewer: true }
    },
    {
        name: "automatic-reconciliation-with-hostile-method",
        code: 'length.Date <- function(x) { inspection_hits <<- inspection_hits + 1L; stop("hostile method ran") }; cat("method-installed\\n")',
        exact: "method-installed\n", outcome: "success",
        workspaceObject: { name: "inspection_data", hasViewer: false }
    },
    {
        name: "hostile-method-unused-and-preview-recovery",
        code: 'stopifnot(inspection_hits == 0L); rm(length.Date); cat("method-recovered\\n")',
        exact: "method-recovered\n", outcome: "success",
        workspaceObject: { name: "inspection_data", hasViewer: true }
    },
    {
        name: "delayed-binding-not-forced-by-reconciliation",
        code: 'delayedAssign("inspection_delayed", { inspection_hits <<- inspection_hits + 1L; stop("delayed binding forced") }, assign.env=.GlobalEnv); cat("binding-installed\\n")',
        exact: "binding-installed\n", outcome: "success",
        workspaceObject: { name: "inspection_delayed", hasViewer: false }
    },
    {
        name: "delayed-binding-unused-and-cleanup",
        code: 'stopifnot(inspection_hits == 0L); rm(inspection_delayed, inspection_data, inspection_hits); cat("binding-cleaned\\n")',
        exact: "binding-cleaned\n", outcome: "success"
    },
    {
        name: "partial-mutation-before-evaluation-error",
        code: 'partial_data <- data.frame(value=c(11,22)); partial_data$value[1] <- 13; stop("partial mutation error")',
        includes: "partial mutation error", outcome: "error",
        workspaceObject: { name: "partial_data", hasViewer: true }
    },
    {
        name: "partial-mutation-retained-after-error",
        code: 'stopifnot(identical(partial_data$value, c(13,22))); rm(partial_data); cat("partial-recovered\\n")',
        exact: "partial-recovered\n", outcome: "success"
    },
    {
        name: "removed-capture-routing-rejects-completion",
        code: "sink(); invisible(NULL)", includes: "producer receipt failed", outcome: "success", deliveryFailure: true,
        grouped: { exact: "", includes: null, deliveryFailure: false }
    },
    { name: "following-command", code: 'cat("recovered\\n")', exact: "recovered\n", outcome: "success" }
];

const checkCases = async function(host, execute) {
    const measurements = [];
    let retainedJournals = 0;
    for (const scenario of cases) {
        // Grouped capture intentionally collapses trailing blank lines and
        // publishes channel groups after evaluation; ordered capture does not.
        const one = groupedInput ? {
            ...scenario,
            exact: scenario.exact?.replace(/\n+$/u, ""),
            prefix: scenario.prefix?.replace(/\n+$/u, ""),
            suffix: scenario.suffix?.replace(/\n+$/u, ""),
            ...scenario.grouped
        } : scenario;
        const result = await execute(one.code, one.reply === undefined ? "answer" : one.reply);
        const output = readAcceptedTranscriptRecords(result.records)
            .filter(record => record.event.type === "output");
        const text = output.map(record => record.event.message || "").join("");
        if (one.exact !== undefined) assert.equal(text, one.exact, `${host}: ${one.name}`);
        if (one.prefix) assert.ok(text.startsWith(one.prefix), `${host}: ${one.name} prefix: ${text}`);
        if (one.suffix) assert.ok(text.endsWith(one.suffix), `${host}: ${one.name} suffix: ${text}`);
        if (one.includes) assert.ok(text.includes(one.includes), `${host}: ${one.name} text: ${text}`);
        if (one.excludes) assert.ok(!text.includes(one.excludes), `${host}: ${one.name} forbidden text`);
        assert.equal(result.outcome, one.outcome, `${host}: ${one.name} outcome`);
        assert.ok(result.terminal, `${host}: ${one.name} has a terminal result`);
        assert.equal(result.failed, Boolean(one.deliveryFailure || one.outcome === "error"),
            `${host}: ${one.name} rejects failed evaluation/delivery without conflating them`);
        assert.equal(result.promptCount, one.promptCount ?? (one.prompt ? 1 : 0), `${host}: ${one.name} actual prompt count`);
        assert.ok(result.repliesAccepted, `${host}: ${one.name} actual reply acknowledgment`);
        if (one.password) {
            assert.deepEqual(result.promptPasswords, [true], `${host}: password metadata reaches the host`);
            assert.ok(!text.includes(one.reply), `${host}: reply is not echoed into output`);
        }
        if (one.workspaceObject) {
            const update = result.workspaceUpdate;
            assert.ok(update?.workspaceRevision, `${host}: reconciliation has a committed receipt`);
            const object = [...update.added, ...update.updated].find(object => object.name === one.workspaceObject.name);
            assert.ok(object, `${host}: expected reconciled object ${one.workspaceObject.name}`);
            assert.equal(object.hasViewer, one.workspaceObject.hasViewer,
                `${host}: ordinary, restricted and recovered preview capability`);
        }
        if (!one.deliveryFailure) {
            assert.equal(result.journalCount, retainedJournals,
                `${host}: completed accepted journals must not accumulate`);
        }
        retainedJournals = result.journalCount;
        assert.ok(output.every(record => record.event.parentId === result.activityId),
            `${host}: ${one.name} output belongs to this activity`);
        if (one.early) {
            assert.ok(output.length > 0, `${host}: expected output is present`);
            if (groupedInput) {
                assert.ok(result.finishedAt - output[0].time < 500,
                    `${host}: grouped output is published after evaluation, not incrementally`);
            } else {
                assert.ok(result.finishedAt - output[0].time >= 500,
                    `${host}: output must arrive during R's one-second wait`);
            }
        }
        measurements.push({ name: one.name, durationMs: result.finishedAt - result.startedAt,
            earlyLeadMs: one.early ? result.finishedAt - output[0].time : null,
            retainedJournals });
        console.log(`${host}: ${one.name} passed`);
    }
    return measurements;
};

const checkRawConsoleInput = async function(host, execute) {
    const scenarios = [
        { name: "raw-helper", read: 'loadNamespace("dialogforgeruntime")$read_runtime_console_line("raw C input: ")',
            answer: "Ω😀é", expected: "before-raw\nraw=Ω😀é\n" },
        { name: "scan", read: 'base::scan(file="", what=character(), nmax=1L, quiet=TRUE)',
            answer: "Ω😀é", expected: "before-raw\nraw=Ω😀é\n" },
        { name: "read-lines", read: 'base::readLines(stdin(), n=1L)',
            answer: "Ω😀é", expected: "before-raw\nraw=Ω😀é\n" },
        { name: "blank-read-lines", read: 'base::readLines(stdin(), n=1L)',
            answer: "", expected: "before-raw\nraw=\n" },
        { name: "oversized-raw-reply", read: 'loadNamespace("dialogforgeruntime")$read_runtime_console_line("bounded raw input: ", 512L)',
            answer: "x".repeat(513), error: "this R reader's byte limit" },
        { name: "raw-after-error", read: 'base::readLines(stdin(), n=1L)',
            answer: "recovered", expected: "before-raw\nraw=recovered\n" },
        { name: "ordinary-readline-after-raw", read: 'base::readline("ordinary after raw: ")',
            answer: "ordinary", expected: "before-raw\nraw=ordinary\n" }
    ];
    const observations = [];
    for (const scenario of scenarios) {
        let timer;
        const code = 'local({ cat("before-raw\\n"); value <- ' + scenario.read
            + '; cat("raw=", value, "\\n", sep=""); stopifnot(!base::interactive()) })';
        try {
            const result = await Promise.race([
                execute(code, scenario.answer),
                new Promise((resolve, reject) => {
                    timer = setTimeout(() => reject(Error("raw-input-did-not-complete")), 4000);
                })
            ]);
            const accepted = readAcceptedTranscriptRecords(result.records);
            const output = accepted.filter(record => record.event.type === "output")
                .map(record => record.event.message || "").join("");
            if (scenario.error) {
                assert.ok(output.includes(scenario.error), output);
                assert.equal(result.outcome, "error");
            }
            else {
                assert.equal(groupedInput ? output.trimEnd() : output,
                    groupedInput ? scenario.expected.trimEnd() : scenario.expected);
                assert.equal(result.outcome, "success");
            }
            assert.equal(result.promptCount, 1);
            assert.equal(result.repliesAccepted, true);
            assert.equal(result.terminal, true);
            observations.push({ name: scenario.name, output, promptCount: result.promptCount,
                repliesAccepted: result.repliesAccepted, outcome: result.outcome, terminal: result.terminal });
        }
        catch (error) {
            return { name: "actual-raw-console-input", host, observations,
                failedScenario: scenario.name, failure: String(error), renderedAppChecked: false };
        }
        finally {
            clearTimeout(timer);
        }
    }
    return { name: "actual-raw-console-input", host, observations, failure: "", renderedAppChecked: false };
};

const liveExecutionSignal = function(marker) {
    if (!groupedInput) {
        return 'cat("' + marker + '\\n"); ';
    }

    // Grouped cat output is buffered until evaluation returns. Observe a real
    // R-side event instead; do not invent an early record in the host adapter.
    return 'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code); '
        + 'rt$emit_stream_event("' + marker + '\\n", "stdout") }); ';
};

const checkLiveRetirement = async function(host, adapter) {
    const pending = adapter.begin(liveExecutionSignal("retire-before")
        + 'Sys.sleep(1); cat("retire-after\\n")');
    // Keep a failed pending request observed while teardown is still running.
    void pending.catch(() => {});
    let timer;
    try {
        await Promise.race([
            adapter.waitForEarlyOutput(),
            new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(new Error(host + ": missing early retirement output")), 7000);
            })
        ]);
        await adapter.retire();
        const retired = await pending;
        assert.ok(retired.records.some(record => record.event.message === "retire-before\n"),
            host + ": producer was actually live before retirement");
        assert.ok(!retired.records.some(record => String(record.event.message || "").includes("retire-after")),
            host + ": late producer output cannot publish after retirement");
        assert.equal(retired.returnedEvents.length, 0, host + ": retired evaluation cannot complete a replacement activity");
        assert.equal(retired.workspaceUpdate, null, host + ": retired evaluation cannot apply workspace effects");
        await adapter.restart();
        const recovered = await adapter.execute('cat("replacement-ready\\n")', "answer");
        assert.equal(readAcceptedTranscriptRecords(recovered.records)
            .filter(record => record.event.type === "output")
            .map(record => record.event.message || "").join(""),
            groupedInput ? "replacement-ready" : "replacement-ready\n");
        assert.equal(recovered.terminal, true);
        assert.equal(recovered.failed, false);
        assert.equal(recovered.journalCount, 0, host + ": replacement has no retired journal resources");
        console.log(host + ": actual live retirement and fresh-session output passed");
    } finally {
        clearTimeout(timer);
    }
};

const checkMixedCellBatch = async function(host, adapter) {
    await adapter.execute('mixed_data <- data.frame(value=c(11,22)); cat("batch-ready\\n")', "answer");
    const result = await adapter.writeCells([
        { objectName: "mixed_data", rowIndex: 0, columnName: "value", value: 33 },
        { objectName: "mixed_data", rowIndex: 999, columnName: "value", value: 99 },
        { objectName: "mixed_data", rowIndex: 1, columnName: "value", value: 44 }
    ]);
    assert.equal(result.updated, 2, host + ": mixed batch preserves both valid edits");
    assert.equal(result.failed, 1, host + ": invalid cell is a failure, not success");
    assert.deepEqual(result.results.map(result => result.status), ["updated", "invalid-cell", "updated"]);
    const verified = await adapter.execute(
        'stopifnot(identical(mixed_data$value,c(33,44)), nrow(mixed_data)==2L); rm(mixed_data); cat("batch-verified\\n")', "answer"
    );
    assert.equal(verified.outcome, "success");
    console.log(host + ": actual mixed cell batch preserves partial successes and rejects invalid cells");
    const setup = await adapter.execute([
        'mixed_data <- data.frame(value=c(11,22)); mixed_attempts <- 0L',
        'local({',
        'rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code)',
        'original <- rt$workspace_dataset_update_cell',
        'rt$workspace_dataset_update_cell <- function(name,row,column,value="") {',
        'mixed_attempts <<- mixed_attempts + 1L',
        'result <- original(name,row,column,value)',
        'if (row==1L) stop("synthetic post-cell exception")',
        'result',
        '}',
        'rt$restore_mixed_cell_fixture <- function() { rt$workspace_dataset_update_cell <- original }',
        '})',
        'cat("exception-batch-ready\\n")'
    ].join("\n"), "answer");
    assert.equal(setup.outcome, "success");
    const partial = await adapter.writeCells([
        { objectName: "mixed_data", rowIndex: 0, columnName: "value", value: 55 },
        { objectName: "mixed_data", rowIndex: 1, columnName: "value", value: 66 }
    ]);
    assert.equal(partial.updated, 1, host + ": one acknowledged success after the thrown mutation");
    assert.equal(partial.failed, 1, host + ": mutation exception cannot report success");
    const checked = await adapter.execute([
        'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code);',
        'rt$restore_mixed_cell_fixture(); rm("restore_mixed_cell_fixture",envir=rt) })',
        'stopifnot(mixed_attempts==2L, identical(mixed_data$value,c(55,66)))',
        'rm(mixed_data,mixed_attempts); cat("exception-batch-verified\\n")'
    ].join("\n"), "answer");
    assert.equal(checked.outcome, "success", host + ": partial changes survive without replaying the failed mutation");
    console.log(host + ": actual mutation exception batch retains partial writes without retry");
};

const checkPhysicalInterrupt = async function(host, adapter) {
    const pending = adapter.begin('interrupted_value <- 13L; '
        + liveExecutionSignal("interrupt-before")
        + 'Sys.sleep(30); cat("interrupt-unreachable\\n")');
    void pending.catch(() => {});
    let timer;
    try {
        await Promise.race([
            adapter.waitForEarlyOutput(),
            new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(new Error(host + ": missing early interrupt output")), 7000);
            })
        ]);
        await adapter.interrupt();
        const result = await pending;
        assert.equal(result.outcome, "interrupted", host + ": actual interruption is not an evaluation error");
        assert.equal(result.terminal, true, host + ": interrupt has a terminal result");
        assert.ok(result.workspaceUpdate?.workspaceRevision, host + ": interrupted mutation reconciles with a receipt");
        assert.ok(result.workspaceUpdate.added.some(object => object.name === "interrupted_value"),
            host + ": completed partial mutation is published after interruption");
        assert.ok(!result.records.some(record => String(record.event.message || "").includes("interrupt-unreachable")));
        const recovered = await adapter.execute(
            'stopifnot(interrupted_value==13L); rm(interrupted_value); local({ value <- readline("after interrupt: "); cat("after=", value, "\\n", sep="") })', "answer"
        );
        assert.equal(recovered.promptCount, 1);
        assert.equal(recovered.repliesAccepted, true);
        assert.equal(recovered.outcome, "success");
        assert.equal(recovered.failed, false);
        assert.equal(readAcceptedTranscriptRecords(recovered.records)
            .filter(record => record.event.type === "output")
            .map(record => record.event.message || "").join(""),
            groupedInput ? "after=answer" : "after=answer\n");
        console.log(host + ": physical Interrupt and following prompt reply passed");
    } finally {
        clearTimeout(timer);
    }
};

const checkRestoreRestart = async function(host, adapter) {
    const setup = await adapter.execute(
        'restored_data <- data.frame(value=c(13,22)); cat("restore-ready\\n")', "answer"
    );
    assert.equal(setup.outcome, "success");
    const before = setup.workspaceUpdate.workspaceRevision.session;
    const restored = await adapter.restart("restore");
    assert.equal(restored.status, "ready", host + ": real replacement starts");
    assert.equal(restored.workspaceRestored, true, host + ": actual workspace bytes restore");
    const verified = await adapter.execute(
        'stopifnot(identical(restored_data$value,c(13,22))); restored_data$value[1] <- 55; cat("restore-verified\\n")', "answer"
    );
    assert.equal(verified.outcome, "success");
    assert.notEqual(verified.workspaceUpdate.workspaceRevision.session, before,
        host + ": replacement workspace receipt belongs to the new R runtime");
    const cleaned = await adapter.restart("clean");
    assert.equal(cleaned.status, "ready");
    const empty = await adapter.execute(
        'stopifnot(!exists("restored_data",envir=.GlobalEnv,inherits=FALSE)); cat("clean-verified\\n")', "answer"
    );
    assert.equal(empty.outcome, "success", host + ": clean restart does not restore old objects");
    assert.equal(empty.journalCount, 0, host + ": both replacement paths release old journals");
    console.log(host + ": SAME controller actual save/restore and clean restart passed");
};


const checkRepeatedRestoreRestart = async function(host, adapter) {
    const cycles = Number(process.env.DIALOGFORGE_TEST_RESTART_CYCLES || "1");
    assert.ok(Number.isInteger(cycles) && cycles >= 1 && cycles <= 10,
        "Use one to ten explicitly requested physical restart cycles.");
    for (let cycle = 1; cycle <= cycles; cycle++) {
        await checkRestoreRestart(host, adapter);
        console.log(host + ": physical Restore/Clean pair " + cycle + "/" + cycles + " passed");
    }
};

const checkPendingInputInterrupt = async function(host, adapter, code) {
    const pending = adapter.begin(code || 'local({ tryCatch(readline("interrupt pending input: "), interrupt=function(condition) { stopifnot(!base::interactive()); stop(condition) }); cat("input-unreachable\\n") })');
    void pending.catch(() => {});
    let promptTimer;
    let finishTimer;
    try {
        await Promise.race([
            adapter.waitForPrompt(),
            new Promise((resolve, reject) => {
                promptTimer = setTimeout(() => reject(new Error(host + ": missing real pending input")), 7000);
            })
        ]);
        await adapter.interrupt();
        const result = await Promise.race([
            pending,
            new Promise((resolve, reject) => {
                finishTimer = setTimeout(() => reject(new Error(host + ": pending input did not interrupt")), 5000);
            })
        ]);
        assert.equal(result.outcome, "interrupted", host + ": pending-input output " + JSON.stringify(
            result.records.map(record => ({ type: record.event.type, message: record.event.message }))
        ));
        assert.equal(result.terminal, true);
        assert.ok(!result.records.some(record => String(record.event.message || "").includes("input-unreachable")));
        const recovered = await adapter.execute(
            'local({ value <- readline("new input after interrupt: "); cat("new=", value, "\\n", sep="") })', "answer"
        );
        assert.equal(recovered.promptCount, 1);
        assert.equal(recovered.repliesAccepted, true);
        assert.equal(recovered.outcome, "success");
        const output = readAcceptedTranscriptRecords(recovered.records)
            .filter(record => record.event.type === "output")
            .map(record => record.event.message || "").join("");
        assert.equal(groupedInput ? output.trimEnd() : output,
            groupedInput ? "new=answer" : "new=answer\n");
        console.log(host + ": actual pending-input Interrupt and new prompt reply passed");
    } finally {
        clearTimeout(promptTimer);
        clearTimeout(finishTimer);
    }
};

const runNative = async function() {
    const nativeRoot = process.env.DIALOGFORGE_TEST_NATIVE_ROOT || root;
    const deliveryModule = require("../dist/src/runtime/providers/r/controllers/rOrderedOutputDelivery");
    const originalDeliveryFactory = deliveryModule.createROrderedOutputDelivery;
    const deliveryRetirementProbe = createOutputDeliveryRetirementProbe();
    if (process.env.DIALOGFORGE_TEST_OUTPUT_RETIREMENT === "1") {
        deliveryModule.createROrderedOutputDelivery = options =>
            deliveryRetirementProbe.decorate(originalDeliveryFactory(options));
    }
    const clientModule = require("../dist/src/runtime/providers/r/protocol/runtimeControlClient");
    const originalClientFactory = clientModule.createRuntimeControlClient;
    const commandEventRetirementProbe = createCommandEventRetirementProbe();
    const checkCommandEventRetirement = process.env.DIALOGFORGE_TEST_COMMAND_EVENT_RETIREMENT === "1";
    const checkVisibleOperationDisposition = process.env.DIALOGFORGE_TEST_VISIBLE_OPERATION_DISPOSITION === "1";
    const checkAuxiliaryCommandReceipts = process.env.DIALOGFORGE_TEST_AUXILIARY_COMMAND_RECEIPTS === "1";
    const checkCompletionWorkspaceFreshness = process.env.DIALOGFORGE_TEST_COMPLETION_WORKSPACE_FRESHNESS === "1";
    const diagnoseNativeResponses = process.env.DIALOGFORGE_TEST_NATIVE_RESPONSE_DIAGNOSTICS === "1";
    if (retentionBytes || diagnoseNativeResponses || checkCommandEventRetirement
        || checkVisibleOperationDisposition || checkAuxiliaryCommandReceipts || checkCompletionWorkspaceFreshness) {
        clientModule.createRuntimeControlClient = (meta, options) => {
            const client = originalClientFactory(meta, retentionBytes
                ? { ...options, maxRetainedEventBytes: retentionBytes } : options);
            if (diagnoseNativeResponses) {
                const execute = client.execute.bind(client);
                client.execute = async (request, dispatchOptions) => {
                    const response = await execute(request, dispatchOptions);
                    if (!response.ok) {
                        // No request code, payload, token or workspace values.
                        console.error("Native control rejection diagnostics: " + JSON.stringify({
                            id: response.id, method: response.method, error: response.error,
                            requestRejected: response.requestRejected,
                            transportFailure: response.transportFailure,
                            completionFailure: response.completionFailure
                        }));
                    }
                    return response;
                };
            }
            return checkCommandEventRetirement || checkVisibleOperationDisposition || checkAuxiliaryCommandReceipts
                || checkCompletionWorkspaceFreshness
                ? commandEventRetirementProbe.decorate(client) : client;
        };
    }
    let records = [];
    const processRecords = [];
    let reply = "answer";
    let promptReplies = [];
    let manager;
    let earlyOutput;
    let promptSeen;
    let actualPrompts = 0;
    let promptPasswords = [];
    let promptIdentities = [];
    const overrides = {
        R_PROFILE_USER: "/dev/null",
        R_ENVIRON_USER: "/dev/null",
        DM_RUNTIME_CONTROL_COMPILATION_CACHE: process.env.DIALOGFORGE_TEST_CONTROL_CACHE === "1"
            ? path.join(nativeRoot, "dist/src/runtime/providers/r/r-sources/runtime-control-cache.rds") : "",
        DIALOGFORGE_ORDERED_OUTPUT_PROTOTYPE: groupedInput ? "0" : "1",
        DIALOGFORGE_BOUNDED_INPUT_PROTOTYPE: groupedInput ? "0" : "1",
        DIALOGFORGE_OUTPUT_LIBRARY: groupedInput ? ""
            : process.env.DIALOGFORGE_TEST_NATIVE_OUTPUT_LIBRARY
                || path.join(root, "dist/r-runtime/native/aarch64-apple-darwin23-4.6.1"),
        DIALOGFORGE_TRANSPORT_LIBRARY: groupedInput ? ""
            : process.env.DIALOGFORGE_TEST_NATIVE_TRANSPORT_LIBRARY
                || path.join(root, "dist/r-runtime/native/aarch64-apple-darwin23-4.6.1")
    };
    const previous = Object.fromEntries(Object.keys(overrides).map(name => [name, process.env[name]]));
    Object.assign(process.env, overrides);
    const deliveryProbe = createOutputDeliveryFailureProbe();
    const provider = createRuntimeProvider({
        rootDir: nativeRoot, processLifecycle: true,
        onTranscriptEvents: events => {
            deliveryProbe.receive(events);
            records.push(...events.map(event => ({ event, time: Date.now() })));
            processRecords.push(...events.filter(event => event.commandKind === "runtime.process")
                .map(event => ({ event, time: Date.now() })));
            if (events.some(event => event.message === "retire-before\n" || event.message === "interrupt-before\n")) earlyOutput?.();
            for (const event of events.filter(event => event.type === "prompt")) {
                actualPrompts++;
                promptIdentities.push({ parentId: event.parentId, promptId: event.id });
                promptPasswords.push(Boolean(event.password));
                promptSeen?.({ parentId: event.parentId, promptId: event.id });
                if (reply === null) continue;
                const answer = Array.isArray(reply) ? reply[actualPrompts - 1] : reply;
                assert.notEqual(answer, undefined, "Every actual prompt needs a fixture reply");
                promptReplies.push(manager.executeRuntimeMethod({
                    method: "reply_prompt",
                    params: { parentId: event.parentId, promptId: event.id, reply: answer }
                }).then(result => result.status === "ready"));
            }
        }
    });
    manager = createRuntimeSessionManager(provider, { rootDir: nativeRoot });
    const restoreDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-restore-"));
    const restorePath = path.join(restoreDirectory, "workspace.RData");
    const restarter = createRuntimeRestartController({
        runtimeSessionManager: manager,
        createWorkspacePath: () => restorePath,
        removeWorkspaceFile: file => {
            assert.equal(file, restorePath);
            if (fs.existsSync(file)) fs.unlinkSync(file);
        },
        invalidateDatasetPreview() {}, setRuntimeSession() {}, sendRuntimeSession() {},
        refreshWorkspace: async () => {
            try {
                return await manager.listWorkspaceObjects();
            }
            catch (error) {
                console.error("Native restart refresh diagnostics: " + JSON.stringify({
                    snapshot: manager.getSnapshot(),
                    readFailureCause: error.cause,
                    processEvents: processRecords.slice(-20).map(record => record.event)
                }));
                throw error;
            }
        },
        captureWorkspaceBaseline: async () => { await manager.listWorkspaceObjects(); }
    });
    let deadline;
    try {
        const started = await manager.start();
        assert.equal(started.status, "ready", started.message);
        const nativeScenarioStarted = Date.now();
        deadline = setTimeout(() => {
            console.error("Native acceptance fixture deadline expired: " + JSON.stringify({
                elapsedMs: Date.now() - nativeScenarioStarted
            }));
            void manager.stop();
        }, 60000);
        const directory = await manager.executeInvisibleQuery({
            query: 'Sys.getenv("DM_ORDERED_OUTPUT_DIR")', source: "paired-output-resource-inspection"
        });
        assert.equal(directory.status, "ready", directory.message);
        const execute = async (code, answer, inspection = {}) => {
            records = [];
            reply = answer;
            promptReplies = [];
            actualPrompts = 0;
            promptPasswords = [];
            promptIdentities = [];
            const startedAt = Date.now();
            const result = await manager.executeVisibleCommandWithEffects(
                createVisibleCommandRequest({ text: code, source: "paired-ordered-test" })
            );
            const finishedAt = Date.now();
            const returned = result.transcriptEvents.map(event => ({ event, time: finishedAt }));
            const repliesAccepted = (await Promise.all(promptReplies)).every(Boolean);
            const journals = inspection.inspectJournal !== false && result.transcriptEvents.length > 0
                && manager.getSnapshot().status === "ready"
                ? await manager.executeInvisibleQuery({
                query: 'as.character(length(list.files(Sys.getenv("DM_ORDERED_OUTPUT_DIR"), pattern="[.]bin$")))',
                source: "paired-output-resource-inspection"
            }) : { status: "ready", value: null };
            assert.equal(journals.status, "ready", journals.message);
            return { records: [...records, ...returned], startedAt, finishedAt,
                journalCount: Number(journals.value),
                returnedEvents: result.transcriptEvents, workspaceUpdate: result.workspaceUpdate,
                workspaceReconciliation: result.workspaceReconciliation,
                promptCount: actualPrompts, promptPasswords, promptIdentities, repliesAccepted,
                outcome: result.evaluationOutcome, activityId: result.activityId,
                executionDisposition: result.executionDisposition,
                failed: result.transcriptEvents.some(event => event.type === "failed" || event.state === "error"),
                terminal: result.transcriptEvents.some(event => event.type === "completed" || event.type === "failed") };
        };
        let measurements = [];
        if (process.env.DIALOGFORGE_TEST_PROMPT_RETIREMENT === "1") {
            let pendingPrompt;
            const measurement = await checkActualPromptRetirement({
                host: "native",
                preparePrompt: () => { pendingPrompt = new Promise(resolve => { promptSeen = resolve; }); },
                waitForPrompt: () => pendingPrompt,
                begin: code => execute(code, null, { inspectJournal: false }),
                reply: params => manager.executeRuntimeMethod({ method: "reply_prompt", params }),
                restart: action => restarter.restart(action, "paired-prompt-retirement")
            });
            measurements.push({ name: "actual-prompt-retirement", ...measurement });
            console.log("Actual prompt retirement measurement: " + JSON.stringify(measurement));
        }
        if (process.env.DIALOGFORGE_TEST_NATIVE_PROCESS_PIPES === "1") {
            console.log("Actual native pipe measurement: " + JSON.stringify(await checkNativeProcessPipeOwnership({
                execute, checkRetirement: true, privateDirectory: restoreDirectory,
                readProcessEvents: () => processRecords,
                interrupt: () => manager.executeRuntimeMethod({ method: "runtime.interrupt", params: {} }),
                checkUnexpectedExit: process.env.DIALOGFORGE_TEST_NATIVE_PIPE_EXIT === "1",
                restart: action => restarter.restart(action, "paired-native-pipe-retirement")
            })));
        }
        if (process.env.DIALOGFORGE_TEST_RAW_CONSOLE_INPUT === "1") {
            const raw = await checkRawConsoleInput("native", execute);
            measurements.push(raw);
            console.log("Actual raw console input measurement: " + JSON.stringify(raw));
            if (!raw.failure) {
                const pendingPrompt = new Promise(resolve => { promptSeen = resolve; });
                await checkPendingInputInterrupt("native", {
                    begin: code => execute(code, null), waitForPrompt: () => pendingPrompt,
                    interrupt: async () => {
                        const result = await manager.executeRuntimeMethod({ method: "runtime.interrupt", params: {} });
                        assert.equal(result.status, "ready", result.message);
                    }, execute
                }, 'local({ loadNamespace("dialogforgeruntime")$read_runtime_console_line("interrupt raw input: "); cat("input-unreachable\\n") })');
                const scope = await manager.executeInvisibleQuery({
                    query: fs.readFileSync(path.join(root, "scripts/check-runtime-console-scope.R"), "utf8"),
                    source: "paired-console-scope-regression"
                });
                assert.equal(scope.status, "ready", scope.message);
                assert.equal(scope.value, "console-scope-passed");
            }
        }
        if (process.env.DIALOGFORGE_TEST_FOCUSED_ONLY !== "1") {
            measurements = await checkCases("native", execute);
            await checkMixedCellBatch("native", { execute, writeCells: requests => manager.writeCells(requests) });
            const early = new Promise(resolve => { earlyOutput = resolve; });
            await checkLiveRetirement("native", {
                begin: code => execute(code, "answer"), waitForEarlyOutput: () => early,
                retire: async () => {
                    await manager.stop();
                    assert.equal(fs.existsSync(String(directory.value)), false,
                        "The exact task-owned session directory, including failed capture, is removed on shutdown");
                },
                restart: async () => { assert.equal((await manager.start()).status, "ready"); },
                execute
            });
            const interruptOutput = new Promise(resolve => { earlyOutput = resolve; });
            await checkPhysicalInterrupt("native", {
                begin: code => execute(code, "answer"), waitForEarlyOutput: () => interruptOutput,
                interrupt: async () => {
                    const result = await manager.executeRuntimeMethod({ method: "runtime.interrupt", params: {} });
                    assert.equal(result.status, "ready", result.message);
                },
                execute
            });
            const pendingPrompt = new Promise(resolve => { promptSeen = resolve; });
            await checkPendingInputInterrupt("native", {
                begin: code => execute(code, null), waitForPrompt: () => pendingPrompt,
                interrupt: async () => {
                    const result = await manager.executeRuntimeMethod({ method: "runtime.interrupt", params: {} });
                    assert.equal(result.status, "ready", result.message);
                },
                execute
            });
            await checkRepeatedRestoreRestart("native", {
                execute, restart: action => restarter.restart(action, "paired-restore-test")
            });
        }
        if (process.env.DIALOGFORGE_TEST_DATASET_WARMING === "1") {
            console.log("Dataset warming measurement: " + JSON.stringify(await measureRuntimeDatasetWarming({
                host: "native", execute, runtime: manager, createCache: createDatasetEditorWarmCache,
                checkInvalidation: process.env.DIALOGFORGE_TEST_DATASET_CACHE_INVALIDATION === "1",
                checkMetadataRace: process.env.DIALOGFORGE_TEST_DATASET_METADATA_RACE === "1",
                createEffects: createWorkspaceDatasetCacheEffects, applyEffects: applyWorkspaceDatasetCacheEffects
            })));
        }
        if (process.env.DIALOGFORGE_TEST_CONNECTION_OUTPUT === "1") {
            const connectionOutput = await checkActualConnectionOutput({
                host: "native", execute,
                restart: action => restarter.restart(action, "paired-connection-output")
            });
            measurements.push({ name: "actual-connection-output", ...connectionOutput });
            console.log("Actual connection output measurement: " + JSON.stringify(connectionOutput));
        }
        if (process.env.DIALOGFORGE_TEST_COMMAND_EVENT_PARITY === "1") {
            measurements.push({ name: "actual-command-event-log", ...await checkActualCommandEventLog({
                host: "native", execute, readEvents: () => manager.listRuntimeEvents()
            }) });
        }
        if (checkAuxiliaryCommandReceipts) {
            const auxiliary = await checkActualAuxiliaryCommandReceipts({
                host: "native", execute, captureProbe: () => commandEventRetirementProbe,
                query: request => manager.executeInvisibleQuery(request),
                checkStartupQueries: process.env.DIALOGFORGE_TEST_STARTUP_QUERIES === "1",
                restart: action => restarter.restart(action, "paired-auxiliary-command")
            });
            measurements.push({ name: "actual-auxiliary-command-receipts", ...auxiliary });
            console.log("Actual auxiliary command receipt measurement: " + JSON.stringify(auxiliary));
        }
        if (checkVisibleOperationDisposition) {
            const disposition = await checkActualVisibleOperationDisposition({
                host: "native", execute, captureProbe: () => commandEventRetirementProbe,
                restart: action => restarter.restart(action, "paired-visible-operation")
            });
            measurements.push({ name: "actual-visible-operation-disposition", ...disposition });
            console.log("Actual visible operation disposition measurement: " + JSON.stringify(disposition));
        }
        if (checkCommandEventRetirement) {
            const retired = await checkActualCommandEventRetirement({
                host: "native", execute, readEvents: () => manager.listRuntimeEvents(),
                captureProbe: () => commandEventRetirementProbe,
                restart: action => restarter.restart(action, "paired-command-event-retirement")
            });
            measurements.push({ name: "actual-command-event-retirement", ...retired });
            console.log("Actual command event retirement measurement: " + JSON.stringify(retired));
        }
        if (process.env.DIALOGFORGE_TEST_PACKAGE_DATASET_CACHE === "1") {
            const result = await checkActualPackageDatasetCache({
                host: "native", execute, runtime: manager, createCache: createDatasetEditorWarmCache,
                createResolverOwner: createRuntimeDialogDatasetResolverOwner,
                prepareEffects: prepareWorkspaceDatasetCacheEffects,
                createWorkspaceDelivery: createWorkspaceSnapshotDelivery,
                createEffects: createWorkspaceDatasetCacheEffects, applyEffects: applyWorkspaceDatasetCacheEffects,
                installFixture: library => {
                    require("node:child_process").execFileSync(process.env.DIALOGFORGE_BUILD_R || "R", [
                        "CMD", "INSTALL", "--no-test-load", "--library=" + library,
                        path.join(root, "dist/package-install-fixture/DialogForgeCacheFixture_0.0.1.tar.gz")
                    ], { stdio: "pipe" });
                }
            });
            measurements.push({ name: "actual-package-dataset-cache", ...result });
            console.log("Package dataset cache measurement: " + JSON.stringify(result));
        }
        if (process.env.DIALOGFORGE_TEST_HISTORY_STORAGE === "1") {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-history-storage-"));
            const paths = { systemSettingsPath: path.join(directory, "system.json"),
                userSettingsPath: path.join(directory, "user.json") };
            const store = createConsoleHistorySettingsStore({
                defaultProductId: "physical-history-acceptance", defaultRuntimeId: "r",
                readSettings: () => readEffectiveSettings(paths),
                writeSettings: value => writeUserSettings(paths, value)
            });
            console.log("Physical history storage measurement: " + JSON.stringify(await checkActualHistoryStorage({
                host: "native", runtimeId: "r", execute, createHistory: createConsoleCommandHistory,
                storage: {
                    prepare: value => {
                        fs.writeFileSync(paths.systemSettingsPath, "{}");
                        writeUserSettings(paths, value);
                    },
                    readHistory: async scope => store.read(scope),
                    writeHistory: value => store.write(value),
                    readSettings: () => readEffectiveSettings(paths),
                    failWrites: async () => {
                        fs.chmodSync(paths.userSettingsPath, 0o444);
                        return { kind: "readonly-file", mode: fs.statSync(paths.userSettingsPath).mode & 0o777 };
                    },
                    recoverWrites: async () => fs.chmodSync(paths.userSettingsPath, 0o600),
                    cleanup: async () => {
                        fs.unlinkSync(paths.userSettingsPath);
                        fs.unlinkSync(paths.systemSettingsPath);
                        fs.rmdirSync(directory);
                    }
                }
            })));
        }
        if (retentionBytes) {
            console.log("Actual output budget measurement: " + JSON.stringify(await checkActualOutputBudget({
                host: "native", execute, getRuntime: () => manager, retentionBytes,
                restart: action => restarter.restart(action, "paired-retention-budget")
            })));
        }
        if (process.env.DIALOGFORGE_TEST_OUTPUT_DELIVERY === "1") {
            console.log("Actual output delivery measurement: " + JSON.stringify(await checkActualOutputDeliveryFailure({
                host: "native", execute, arm: () => deliveryProbe.arm(),
                checkEncoding: process.env.DIALOGFORGE_TEST_OUTPUT_ENCODING === "1",
                rejectedCount: () => deliveryProbe.rejectedCount(),
                restart: action => restarter.restart(action, "paired-delivery-rejection")
            })));
        }
        if (process.env.DIALOGFORGE_TEST_OUTPUT_RETIREMENT === "1") {
            console.log("Actual output retirement measurement: " + JSON.stringify(await checkActualOutputDeliveryRetirement({
                host: "native", execute, captureProbe: () => deliveryRetirementProbe,
                restart: action => restarter.restart(action, "paired-output-retirement")
            })));
        }
        if (process.env.DIALOGFORGE_TEST_ACTUAL_PACKAGES === "1") {
            const packages = await checkActualRuntimePackages({
                host: "native", execute, runtime: manager,
                emptyRepository: emptyPackageRepository,
                checkLoadedNamespaces: process.env.DIALOGFORGE_TEST_PACKAGE_LOADED_NAMESPACE === "1",
                owners: {
                    createPreparation: createRPackagePreparationController,
                    preparePackages: prepareRequiredRPackages,
                    loadPackages: loadRequiredRPackages, attachPackages: attachRequiredRPackages,
                    requireReceipt: requireSuccessfulRPackageAttachment,
                    captureRuntime: captureRPackageRuntime,
                    createInstall: createRPackageInstallWorkflow
                }
            });
            measurements.push({ name: "actual-package-safety", ...packages });
            console.log("Actual package measurement: " + JSON.stringify(packages));
            if (validPackageRepository) {
                const installed = await checkActualPackageInstallation({
                    host: "native", getRuntime: () => manager, execute,
                    createInstall: createRPackageInstallWorkflow, repository: validPackageRepository,
                    upgradeRepository: upgradePackageRepository,
                    staleRepository: stalePackageRepository, emptyRepository: emptyPackageRepository,
                    corruptRepository: corruptPackageRepository,
                    partialRepository: partialPackageRepository,
                    restoreInstallation: process.env.DIALOGFORGE_TEST_PACKAGE_RESTORE === "1",
                    prepareReadonlyLibrary: process.env.DIALOGFORGE_TEST_PACKAGE_READONLY === "1"
                        ? async library => {
                            const result = await execute('Sys.chmod(' + JSON.stringify(library)
                                + ', mode="0555"); cat("readonly-native-ready\\n")', "answer");
                            assert.equal(result.outcome, "success");
                            return library;
                        } : undefined,
                    createInstallCommand: createRequiredInstallCommand,
                    restart: action => restarter.restart(action, "paired-physical-installation")
                });
                measurements.push({ name: "actual-package-installation", ...installed });
                console.log("Actual physical installation measurement: " + JSON.stringify(installed));
            }
            if (dependencyPackageRepository) {
                const dependencies = await checkActualPackageDependencies({
                    host: "native", getRuntime: () => manager, execute,
                    createInstall: createRPackageInstallWorkflow, createInstallCommand: createRequiredInstallCommand,
                    repository: dependencyPackageRepository, seedRepository: seedDependencyRepository,
                    checkPublicationRollback: process.env.DIALOGFORGE_TEST_PACKAGE_ROLLBACK === "1",
                    restart: action => restarter.restart(action, "paired-package-dependency")
                });
                measurements.push({ name: "actual-package-dependencies", ...dependencies });
                console.log("Actual package dependency measurement: " + JSON.stringify(dependencies));
            }
        }
        if (process.env.DIALOGFORGE_TEST_ACTUAL_COMPLETIONS === "1") {
            const completion = await checkActualRuntimeCompletions({
                host: "native", runtime: manager, execute, createReader: createRConsoleCompletionReader,
                checkMembers: process.env.DIALOGFORGE_TEST_COMPLETION_MEMBERS === "1"
            });
            measurements.push({ name: "actual-completion-safety", ...completion });
            console.log("Actual completion measurement: " + JSON.stringify(completion));
            if (process.env.DIALOGFORGE_TEST_COMPLETION_RETIREMENT === "1") {
                console.log("Actual completion retirement measurement: " + JSON.stringify(
                    await checkActualCompletionRetirement({
                        host: "native", getRuntime: () => manager, execute,
                        restart: action => restarter.restart(action, "paired-completion-retirement"),
                        createReader: createRConsoleCompletionReader
                    })
                ));
            }
            if (process.env.DIALOGFORGE_TEST_COMPLETION_EXECUTING === "1") {
                const retired = await checkExecutingCompletionRetirement({
                    host: "native", getRuntime: () => manager, execute,
                    restart: action => restarter.restart(action, "paired-executing-completion"),
                    createReader: createRConsoleCompletionReader,
                    createProgress: async () => {
                        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-completion-progress-"));
                        const marker = path.join(directory, "started");
                        let disposed = false;
                        return {
                            code: `base::writeLines("started", ${JSON.stringify(marker)})`,
                            wait: async () => {
                                while (!disposed && !fs.existsSync(marker)) {
                                    await new Promise(resolve => setTimeout(resolve, 20));
                                }
                                assert.ok(!disposed, "Native completion progress was canceled");
                            },
                            dispose: async () => {
                                disposed = true;
                                if (fs.existsSync(marker)) fs.unlinkSync(marker);
                                fs.rmdirSync(directory);
                            }
                        };
                    }
                });
                console.log("Executing completion retirement measurement: " + JSON.stringify(retired));
            }
        }
        if (checkCompletionWorkspaceFreshness) {
            const freshness = await checkActualCompletionWorkspaceFreshness({
                host: "native", getRuntime: () => manager, execute,
                captureProbe: () => commandEventRetirementProbe
            });
            measurements.push({ name: "actual-completion-workspace-freshness", ...freshness });
            console.log("Actual completion freshness measurement: " + JSON.stringify(freshness));
        }
        if (process.env.DIALOGFORGE_TEST_ACTUAL_GRAPHICS === "1") {
            console.log("Actual graphics measurement: " + JSON.stringify(await checkActualRuntimeGraphics({
                host: "native", execute,
                checkLowLevelClose: process.env.DIALOGFORGE_TEST_GRAPHICS_LOW_LEVEL === "1",
                foreignDriverPath: process.env.DIALOGFORGE_TEST_GRAPHICS_CALLBACKS === "1"
                    ? path.join(root, "dist/r-runtime/probe/native/graphicsdeviceprobe.so") : undefined,
                openForeignDeviceCode: 'httpgd::hgd(silent=TRUE)',
                readFailureDetails: async () => {
                    const result = await manager.executeInvisibleQuery({
                        query: [
                            'local({ rt <- as.environment("DialogApp");',
                            'token <- rt$runtime_graphics_devices[[as.character(dev.cur())]]$observation;',
                            'jsonlite::toJSON(list(',
                            'backend=rt$plot_backend, device=as.integer(dev.cur()), deviceName=names(dev.cur()),',
                            'signature=rt$plot_signature(),',
                            'record=tryCatch({ grDevices::recordPlot(); "ok" }, error=function(e) conditionMessage(e)),',
                            'transport=rt$runtime_read_plot_transport(),',
                            'formatStock=identical(getS3method("format","data.frame"),base::format.data.frame),',
                            'observer=rt$runtime_graphics_device_is_current(token,as.integer(dev.cur())),',
                            'transportType=typeof(rt$runtime_graphics_transport),',
                            'functionOwner=identical(environment(rt$sync_runtime_plot),rt$app_env),',
                            'lastGeneration=rt$plot_last_device_generation, lastSignature=rt$plot_last_signature',
                            '), auto_unbox=TRUE) })'
                        ].join(" "),
                        source: "paired-graphics-failure-details"
                    });
                    return result.status === "ready" ? JSON.parse(String(result.value)) : result;
                },
                readState: async () => {
                    const result = await manager.executeInvisibleQuery({ query: graphicsStateQuery, source: "paired-graphics-test" });
                    assert.equal(result.status, "ready", result.message);
                    return JSON.parse(String(result.value));
                },
                readImage: async state => {
                    const url = new URL(state.url);
                    assert.equal(url.hostname, "127.0.0.1", "Read only this disposable R server");
                    url.pathname = url.pathname.replace(/\/live$/, "/plot");
                    for (const key of ["websockets", "sidebar", "history", "dm_upid"]) url.searchParams.delete(key);
                    for (const [key, value] of Object.entries({ renderer: "png", index: state.count - 1, width: 720, height: 576 })) {
                        url.searchParams.set(key, String(value));
                    }
                    const resource = await readPlotExportResource(createNodeResourceClient(), url.toString());
                    const image = PNG.sync.read(Buffer.from(resource.body));
                    let red = 0;
                    let blue = 0;
                    for (let offset = 0; offset < image.data.length; offset += 4) {
                        if (image.data[offset] > 200 && image.data[offset + 1] < 50 && image.data[offset + 2] < 50) red++;
                        if (image.data[offset + 2] > 200 && image.data[offset] < 50 && image.data[offset + 1] < 50) blue++;
                    }
                    return { width: image.width, height: image.height, red, blue };
                }
            })));
        }
        if (process.env.DIALOGFORGE_TEST_ACTUAL_HELP === "1") {
            const server = createRHelpServer({
                findRScriptBinary: async () => process.env.DIALOGFORGE_RSCRIPT_BINARY || "Rscript"
            });
            try {
                const helpPort = await server.start();
                if (process.env.DIALOGFORGE_TEST_HELP_EXECUTING === "1") {
                    const result = await checkExecutingHelpRetirement({
                        host: "native",
                        createOperation: (started, kind) => createPartialHelpTransfer(server, started, kind),
                        createFreshReader: () => createRHelpPageProxy({
                            rewriteUrl: value => server.rewriteUrl(new URL(value, "http://127.0.0.1").href),
                            captureOwner: server.captureOwner, resourceClient: createNodeResourceClient()
                        }),
                        restart: async () => { await server.stop(); assert.ok(await server.start()); }
                    });
                    measurements.push({ name: "executing-help-retirement", ...result });
                    console.log("Executing help retirement measurement: " + JSON.stringify(result));
                }
                if (process.env.DIALOGFORGE_TEST_HELP_RETIREMENT === "1") {
                    const resources = createNodeResourceClient();
                    const result = await checkActualHelpRetirement({
                        host: "native",
                        createReader: hold => createRHelpPageProxy({
                            rewriteUrl: value => server.rewriteUrl(new URL(value, "http://127.0.0.1:" + helpPort).href),
                            captureOwner: server.captureOwner,
                            resourceClient: {
                                loadText: async (value, options) => hold(await resources.loadText(value, options)),
                                loadBuffer: async (value, options) => hold(await resources.loadBuffer(value, options))
                            }
                        }),
                        restart: async () => { await server.stop(); assert.ok(await server.start()); }
                    });
                    measurements.push({ name: "actual-help-retirement", ...result });
                    console.log("Actual help retirement measurement: " + JSON.stringify(result));
                }
                const reader = createRHelpPageProxy({
                    rewriteUrl: value => server.rewriteUrl(new URL(value, "http://127.0.0.1:" + helpPort).href),
                    resourceClient: createNodeResourceClient(),
                    isCurrent: server.captureOwner(), captureOwner: () => server.captureOwner()
                });
                console.log("Actual help measurement: " + JSON.stringify(await checkActualRuntimeHelp({
                    host: "native", fetchPage: value => reader.fetchPage(value),
                    fetchResource: value => reader.fetchResource(value), retireOwner: () => server.stop()
                })));
            } finally {
                await server.stop();
            }
        }
        return measurements;
    }
    finally {
        clientModule.createRuntimeControlClient = originalClientFactory;
        deliveryModule.createROrderedOutputDelivery = originalDeliveryFactory;
        clearTimeout(deadline);
        await manager.stop();
        if (fs.readdirSync(restoreDirectory).length === 0) fs.rmdirSync(restoreDirectory);
        for (const [name, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
    }
};

const runWebR = async function() {
    const library = readRegressionPackageLibrary(root, true);
    const bundle = await build({
        stdin: { resolveDir: root, contents: `
            ${regressionPackageLibrarySource(library)}
            import { createBrowserWebRRuntime } from "./src/runtime/providers/webr/webRBrowserRuntime";
            import { installWebRPackageInstallShim } from "./src/runtime/providers/webr/webRBootstrap";
            import { installWebRSharedRuntimeControl, createWebROutputJournalReader }
                from "./src/runtime/providers/webr/webRSharedRuntimeControl";
            import { createBrowserWebRSession } from "./src/runtime/providers/webr/webRBrowserSession";
            import { createWebRRuntimeRestartAdapter } from "./src/runtime/providers/webr/webRRuntimeRestartAdapter";
            import { createDatasetEditorWarmCache } from "./src/dataset-editor/datasetEditorWarmCache";
            import { createBrowserPlotViewerHost } from "./src/shell-web/browserPlotAdapter";
            import { createBrowserResourceClient } from "./src/core/host/browserResourceClient";
            import { readPlotExportResource } from "./src/base-app/features/plot-viewer/plotExportOperations";
            import { checkWebRPlotResourceRetirement } from "./scripts/webr-plot-resource-retirement-acceptance";
            import { measureRuntimeDatasetWarming } from "./scripts/runtime-dataset-warm-acceptance";
            import { checkActualHistoryStorage } from "./scripts/runtime-history-storage-acceptance";
            import { createConsoleCommandHistory } from "./src/console/services/consoleCommandHistory";
            import { createConsoleHistorySettingsStore } from "./src/console/services/consoleHistorySettingsStore";
            import { createBrowserStorageAdapter } from "./src/shell-web/browserStorageAdapter";
            import { checkActualOutputBudget } from "./scripts/runtime-output-budget-acceptance";
            import { createOutputDeliveryFailureProbe, checkActualOutputDeliveryFailure }
                from "./scripts/runtime-output-delivery-acceptance";
            import { createOutputDeliveryRetirementProbe, checkActualOutputDeliveryRetirement }
                from "./scripts/runtime-output-retirement-acceptance";
            import { createCommandEventRetirementProbe, checkActualCommandEventRetirement }
                from "./scripts/runtime-command-event-acceptance";
            import { checkActualConnectionOutput } from "./scripts/runtime-connection-output-acceptance";
            import { checkActualVisibleOperationDisposition } from "./scripts/runtime-visible-operation-acceptance";
            import { checkActualAuxiliaryCommandReceipts } from "./scripts/runtime-auxiliary-command-acceptance";
            import { createWorkerDrainFailureProbe, checkActualWorkerDrainFailure,
                checkActualWorkerResponseReadFailure }
                from "./scripts/webr-output-drain-acceptance";
            import { createWorkspaceDatasetCacheEffects, applyWorkspaceDatasetCacheEffects,
                prepareWorkspaceDatasetCacheEffects } from "./src/runtime/workspace/workspaceUpdateEffects";
            import { createWorkspaceSnapshotDelivery } from "./src/runtime/workspace/workspaceSnapshotDelivery";
            import { checkActualRuntimeCompletions, checkActualCompletionRetirement,
                checkExecutingCompletionRetirement, checkActualCompletionWorkspaceFreshness }
                from "./scripts/runtime-completion-acceptance";
            import { checkActualRuntimePackages } from "./scripts/runtime-package-acceptance";
            import { checkActualPackageDatasetCache } from "./scripts/runtime-package-dataset-cache-acceptance";
            import { createRuntimeDialogDatasetResolverOwner } from "./src/dialog-runtime/custom-js/runtimeDatasetResolver";
            import { checkActualHelpRetirement, checkExecutingHelpRetirement } from "./scripts/runtime-help-acceptance";
            import { checkActualPackageInstallation } from "./scripts/runtime-package-install-acceptance";
            import { checkActualPackageDependencies } from "./scripts/runtime-package-dependency-acceptance";
            import { createRPackagePreparationController, prepareRequiredRPackages } from "./src/runtime/providers/r/dependencies/rPackageRequirementReadiness";
            import { loadRequiredRPackages, attachRequiredRPackages, requireSuccessfulRPackageAttachment } from "./src/runtime/providers/r/dependencies/rPackageAttachment";
            import { captureRPackageRuntime } from "./src/runtime/providers/r/dependencies/rPackageRuntimeGuard";
            import { createRPackageInstallWorkflow } from "./src/runtime/providers/r/dependencies/packageInstallWorkflow";
            import { createRequiredInstallCommand } from "./src/runtime/providers/r/dependencies/packageInstallPlan";
            import { createRConsoleCompletionReader } from "./src/runtime/providers/r/completions/rConsoleRuntimeCompletion";
            import { createPlotViewerPresentationState } from "./src/base-app/features/plot-viewer/plotViewerPresentationState";
            import { createWebRHelpPageReader } from "./src/runtime/providers/webr/webRHelpDocument";
            import { createBrowserHelpResourceChannel } from "./src/shell-web/browserHelpResourceChannel";
            import { prepareBrowserProductPackageLibrary } from "./src/runtime/providers/webr/webRBrowserPackageLibraryAdapter";
            import { mountWebRFilesystem } from "./src/runtime/providers/webr/webRFilesystemMount";
            import { createVisibleCommandRequest } from "./src/runtime/commands/commandProtocol";
            window.orderedStartupMeasurements = [];
            window.checkOrderedPlotResourceRetirement = async function() {
                try {
                    return await checkWebRPlotResourceRetirement({
                        source: window.orderedPlotSourceBitmap,
                        createHost: createBrowserPlotViewerHost,
                        readResource: url => readPlotExportResource(createBrowserResourceClient(), url)
                    });
                }
                finally {
                    window.orderedPlotSourceBitmap?.close();
                    window.orderedPlotSourceBitmap = null;
                }
            };
            window.checkOrderedPackageDatasetCache = () => checkActualPackageDatasetCache({
                host: "webr", execute: (code, answer) => window.executeOrderedAcceptance(code, answer),
                runtime: window.orderedSessionManager, createCache: createDatasetEditorWarmCache,
                createResolverOwner: createRuntimeDialogDatasetResolverOwner,
                prepareEffects: prepareWorkspaceDatasetCacheEffects,
                createWorkspaceDelivery: createWorkspaceSnapshotDelivery,
                createEffects: createWorkspaceDatasetCacheEffects, applyEffects: applyWorkspaceDatasetCacheEffects,
                installFixture: async library => {
                    const response = await fetch("/cache-fixture.tgz");
                    if (!response.ok) throw new Error("Build the SAME package cache fixture first.");
                    await window.orderedRuntime.FS.writeFile("/tmp/dialogforge-cache-fixture.tgz",
                        new Uint8Array(await response.arrayBuffer()));
                    await window.orderedRuntime.evalRVoid(
                        'utils::untar("/tmp/dialogforge-cache-fixture.tgz",tar="internal",exdir='
                            + JSON.stringify(library) + ')'
                    );
                }
            });
            window.startOrderedAcceptance = async function() {
                const started = performance.now();
                const runtime = await createBrowserWebRRuntime({
                    baseUrl: new URL("/webr/", location.href).href,
                    importWebRModule: () => import("/webr/webr.js")
                });
                window.orderedRuntime = runtime;
                window.orderedPlotPresentation = createPlotViewerPresentationState();
                window.orderedPlotPixels = null;
                await runtime.init();
                window.orderedDrainProbe = createWorkerDrainFailureProbe();
                if (${process.env.DIALOGFORGE_TEST_WORKER_DRAIN_FAILURE === "1"}) {
                    const readDrain = runtime.read.bind(runtime);
                    const drainProbe = window.orderedDrainProbe;
                    runtime.read = async () => drainProbe.receive(await readDrain());
                }
                let helpReadStarted;
                let completionReadStarted;
                window.observeExecutingCompletion = callback => { completionReadStarted = callback; };
                if (${process.env.DIALOGFORGE_TEST_HELP_EXECUTING === "1" || process.env.DIALOGFORGE_TEST_HELP_SERVICE_WORKER === "1" || process.env.DIALOGFORGE_TEST_COMPLETION_EXECUTING === "1"}) {
                    const originalRead = runtime.read.bind(runtime);
                    runtime.read = async function() {
                        const message = await originalRead();
                        if (message?.type === "dialogforge-help-fixture-progress") {
                            helpReadStarted?.({ boundary: "worker-executing-r-query",
                                progressFromActualR: true, completedResourceRead: false });
                        }
                        if (message?.type === "dialogforge-completion-fixture-progress") {
                            completionReadStarted?.();
                        }
                        return message;
                    };
                }
                const initializedAt = performance.now();
                const packageMounts = await window.mountRegressionPackageLibrary(runtime);
                const mountedAt = performance.now();
                if (${!!validPackageRepository}) {
                    await runtime.evalRVoid('options(webr_pkg_repos=' + ${JSON.stringify(JSON.stringify(emptyPackageRepository || validPackageRepository))} + ')');
                    await installWebRPackageInstallShim(runtime);
                    const addressed = JSON.parse(await runtime.evalRString(
                        'jsonlite::toJSON(getOption("dialogforge.r.package.transport")$contrib(c("https://cloud.r-project.org", '
                        + ${JSON.stringify(JSON.stringify(validPackageRepository))} + ')), auto_unbox=FALSE)'
                    ));
                    const suffix = "/bin/emscripten/contrib/4.6";
                    if (addressed.length !== 2
                        || addressed[0] !== ${JSON.stringify(emptyPackageRepository || validPackageRepository)} + suffix
                        || addressed[1] !== ${JSON.stringify(validPackageRepository)} + suffix) {
                        throw Error("Worker binary repository addressing did not preserve custom repos/SDK CRAN mirror");
                    }
                }
                // Production shared-control startup installs the single helper.
                // The fixture only creates its private journal/library locations.
                await runtime.evalRVoid('dir.create("/tmp/ordered-helper", recursive=TRUE); dir.create("/tmp/ordered-journals")');
                const helperStagedAt = performance.now();
                const controlEvaluations = [];
                const profileCompilation = ${process.env.DIALOGFORGE_TEST_STARTUP_PROFILE === "1"};
                let compilationProfile = null;
                const originalEvalRVoid = runtime.evalRVoid;
                runtime.evalRVoid = async function(code, ...options) {
                    const started = performance.now();
                    let phase = "control-setup";
                    if (code.startsWith('as.environment("DialogApp")$runtime_prepare_control_functions(')) {
                        phase = "canonical-compilation";
                    } else if (code.startsWith("eval(")) {
                        phase = "canonical-source";
                    } else if (code.startsWith("utils::untar(")) {
                        phase = "host-helper-staging";
                    }
                    const profiling = profileCompilation && phase === "canonical-compilation";
                    if (profiling) {
                        await originalEvalRVoid.call(runtime, ${JSON.stringify('assign("DF_compilation_profile", list(), .GlobalEnv); base::trace("cmpfun", where=asNamespace("compiler"), print=FALSE, tracer=quote(DF_compile_started <- proc.time()[[3L]]), exit=quote({ DF_compile_elapsed <- proc.time()[[3L]] - DF_compile_started; DF_compile_body <- deparse(body(f)); DF_compilation_profile[[length(DF_compilation_profile) + 1L]] <<- list(seconds=DF_compile_elapsed, wasCompiled=typeof(.Internal(bodyCode(f))) == "bytecode", lines=length(DF_compile_body), body=substr(paste(DF_compile_body, collapse=" "), 1L, 240L)) }))')});
                    }
                    try {
                        return await originalEvalRVoid.call(runtime, code, ...options);
                    } finally {
                        controlEvaluations.push({ phase, milliseconds: performance.now() - started });
                        if (profiling) {
                        await originalEvalRVoid.call(runtime, 'base::untrace("cmpfun", where=asNamespace("compiler"))');
                            compilationProfile = JSON.parse(await runtime.evalRString('jsonlite::toJSON(DF_compilation_profile, auto_unbox=TRUE)'));
                            await originalEvalRVoid.call(runtime, 'rm("DF_compilation_profile", envir=.GlobalEnv)');
                        }
                    }
                };
                let pending = Promise.resolve();
                let activeRequest;
                let sequence = 0;
                let current = true;
                let promptReplies = [];
                let reply = "answer";
                const journals = [];
                window.orderedRecords = [];
                window.orderedPromptCount = 0;
                let promptPasswords = [];
                let promptIdentities = [];
                window.orderedDeliveryProbe = createOutputDeliveryFailureProbe();
                window.orderedDeliveryRetirementProbe = createOutputDeliveryRetirementProbe();
                const record = events => {
                    window.orderedDeliveryProbe.receive(events);
                    window.orderedRecords.push(...events.map(event => ({ event, time: Date.now() })));
                };
                const client = await installWebRSharedRuntimeControl({
                    maxRetainedEventBytes: ${retentionBytes || "undefined"},
                    runtime,
                    runRuntimeOperation(action) {
                        const next = pending.then(action);
                        pending = next.catch(() => {});
                        return next;
                    },
                    fetchSource: async name => {
                        const response = await fetch("/r/" + name);
                        if (!response.ok) throw new Error("Missing shared R source: " + name);
                        return response.text();
                    },
                    fetchControlCompilationCache: ${process.env.DIALOGFORGE_TEST_CONTROL_CACHE === "1"}
                        ? async () => {
                            const response = await fetch("/control-cache.rds");
                            if (!response.ok) throw new Error("Build the shared control compilation cache first.");
                            return new Uint8Array(await response.arrayBuffer());
                        } : undefined,
                    orderedOutput: ${groupedInput} ? undefined : { library: "/tmp/ordered-helper", directory: "/tmp/ordered-journals", sessionId: "paired-worker" },
                    async graphicsReceived(images, count) {
                        if (${process.env.DIALOGFORGE_TEST_GRAPHICS_RESOURCE_RETIREMENT === "1"} && images.length) {
                            const source = await createImageBitmap(images[images.length - 1]);
                            window.orderedPlotSourceBitmap?.close();
                            window.orderedPlotSourceBitmap = source;
                        }
                        await window.orderedPlotPresentation.receiveCapturedImages(images, count, {
                            createUrl: async image => {
                                const canvas = document.createElement("canvas");
                                canvas.width = image.width;
                                canvas.height = image.height;
                                const context = canvas.getContext("2d");
                                context.drawImage(image, 0, 0);
                                const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data;
                                let red = 0;
                                let blue = 0;
                                for (let offset = 0; offset < bytes.length; offset += 4) {
                                    if (bytes[offset] > 200 && bytes[offset + 1] < 50 && bytes[offset + 2] < 50) red++;
                                    if (bytes[offset + 2] > 200 && bytes[offset] < 50 && bytes[offset + 1] < 50) blue++;
                                }
                                window.orderedPlotPixels = { width: canvas.width, height: canvas.height, red, blue };
                                const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
                                if (!blob) throw new Error("Actual image encoding failed");
                                return URL.createObjectURL(blob);
                            },
                            releaseUrls: urls => urls.forEach(url => URL.revokeObjectURL(url)),
                            closeImages: images => images.forEach(image => image.close())
                        });
                    },
                    promptReceived(event) {
                        window.orderedPromptCount++;
                        window.orderedLastPrompt = { parentId: event.parent_id, promptId: event.id };
                        promptIdentities.push(window.orderedLastPrompt);
                        promptPasswords.push(Boolean(event.password));
                        if (reply === null) return;
                        const answer = Array.isArray(reply) ? reply[window.orderedPromptCount - 1] : reply;
                        if (answer === undefined) throw new Error("Every actual prompt needs a fixture reply");
                        // Queue the real reply without blocking the worker
                        // reader that must consume its acknowledgment.
                        promptReplies.push(client.execute({
                            id: "paired-reply-" + (++sequence), method: "reply_prompt",
                            params: { parentId: event.parent_id, promptId: event.id, reply: answer }
                        }).then(result => result.ok));
                    },
                    outputJournalForRequest: ${groupedInput} ? undefined : function(request) {
                        const journal = createWebROutputJournalReader({
                            path: "/tmp/ordered-journals/capture-" + (++sequence) + ".bin",
                            sessionId: "paired-worker", parentId: String(request.params.parentId),
                            request: activeRequest, isCurrent: () => current,
                            onTranscriptEvents: record
                        });
                        const delivery = window.orderedDeliveryRetirementProbe.decorate(journal);
                        journals.push(delivery);
                        return delivery;
                    }
                });
                runtime.evalRVoid = originalEvalRVoid;
                window.orderedCommandEventRetirementProbe = createCommandEventRetirementProbe();
                if (${process.env.DIALOGFORGE_TEST_COMMAND_EVENT_RETIREMENT === "1"
                    || process.env.DIALOGFORGE_TEST_VISIBLE_OPERATION_DISPOSITION === "1"
                    || process.env.DIALOGFORGE_TEST_AUXILIARY_COMMAND_RECEIPTS === "1"
                    || process.env.DIALOGFORGE_TEST_COMPLETION_WORKSPACE_FRESHNESS === "1"}) {
                    window.orderedCommandEventRetirementProbe.decorate(client);
                }
                const session = createBrowserWebRSession({
                    runtime, runtimeControlClient: client, isCurrentSession: () => current,
                    visibleCommands: { readConsoleOutputWidth: () => 120, recordTranscriptEvents: record },
                    workspaceChanged: async () => {}
                });
                window.orderedStartupMeasurements.push({
                    initializationMs: initializedAt - started,
                    packageMounts,
                    packageMountMs: mountedAt - initializedAt,
                    outputHelperStageMs: helperStagedAt - mountedAt,
                    sharedControlMs: performance.now() - helperStagedAt,
                    controlEvaluations,
                    compilationProfile,
                    compilationCacheHits: await runtime.evalRNumber('as.environment("DialogApp")$runtime_control_compilation_cache_hits'),
                    compilationCacheEntries: await runtime.evalRNumber('length(as.environment("DialogApp")$runtime_control_compilation_cache)'),
                    compilerOptimization: await runtime.evalRNumber('compiler::getCompilerOption("optimize")'),
                    compilationCacheChecks: profileCompilation ? JSON.parse(await runtime.evalRString(${JSON.stringify('local({ rt <- as.environment("DialogApp"); jsonlite::toJSON(lapply(c("dataset_changed_columns", "workspace_snapshot", "json_str"), function(name) { value <- rt[[name]]; cached <- rt$runtime_control_compilation_cache[[name]]; list(name=name, compiled=rt$runtime_control_closure_is_compiled(cached), formals=identical(formals(value), formals(cached)), body=identical(body(value), body(cached)), attributes=identical(attributes(value), attributes(cached)), valueAttributes=names(attributes(value)), cacheAttributes=names(attributes(cached))) }), auto_unbox=TRUE) })')})) : null,
                    totalMs: performance.now() - started,
                    productUiMeasured: false
                });
                window.orderedRuntime = runtime;
                window.orderedSessionManager = session.runtimeSessionManager;
                const helpGeneration = session.runtimeSessionManager.getSnapshot().lifecycleGeneration;
                const helpReader = createWebRHelpPageReader(location.origin, async command => {
                    const result = await session.runtimeSessionManager.executeInvisibleQuery({ query: command, source: "paired-help-test" });
                    if (result.status !== "ready") throw new Error(result.message);
                    return String(result.value || "");
                }, () => current && session.runtimeSessionManager.getSnapshot().lifecycleGeneration === helpGeneration);
                window.fetchOrderedHelpPage = value => helpReader.fetchPage(value);
                window.createOrderedHeldHelpReader = hold => createWebRHelpPageReader(location.origin,
                    async command => {
                        const result = await session.runtimeSessionManager.executeInvisibleQuery({ query: command, source: "paired-held-help" });
                        if (result.status !== "ready") throw Error(result.message);
                        return hold(String(result.value || ""));
                    }, () => current && window.orderedSessionManager === session.runtimeSessionManager
                        && session.runtimeSessionManager.getSnapshot().lifecycleGeneration === helpGeneration);
                window.createOrderedExecutingHelpOperation = started => {
                    helpReadStarted = started;
                    const progress = 'webr::eval_js(' + JSON.stringify(
                        'globalThis.Module.webr.channel.write({type: "dialogforge-help-fixture-progress"}); null'
                    ) + '); Sys.sleep(3); ';
                    return {
                        reader: createWebRHelpPageReader(location.origin, async command => {
                            const result = await session.runtimeSessionManager.executeInvisibleQuery({
                                query: progress + command, source: "paired-executing-help"
                            });
                            if (result.status !== "ready") {
                                throw Error(result.message);
                            }
                            return String(result.value || "");
                        }, () => current && window.orderedSessionManager === session.runtimeSessionManager
                            && session.runtimeSessionManager.getSnapshot().lifecycleGeneration === helpGeneration),
                        release: async () => {},
                        dispose: async () => { helpReadStarted = undefined; }
                    };
                };
                const helpChannels = [];
                window.registerOrderedHelpResourceChannel = async reader => {
                    const channel = createBrowserHelpResourceChannel({
                        serviceWorker: navigator.serviceWorker, origin: location.origin, reader
                    });
                    helpChannels.push(channel);
                    return channel.register();
                };
                const closeHelpChannels = () => helpChannels.forEach(channel => channel.close());
                window.closeOrderedHelpResourceChannels = closeHelpChannels;
                window.rebindOrderedHelpResourceChannels = () => Promise.all(helpChannels.map(channel => channel.register()));
                window.fetchOrderedHelpResource = async value => {
                    const result = await helpReader.fetchResource(value);
                    // Transfer only acceptance metadata, not an enumerated byte object.
                    return { ...result, body: result.body ? Array.from(result.body) : undefined };
                };
                window.writeOrderedCells = requests => session.runtimeSessionManager.writeCells(requests);
                window.replyOrderedPrompt = params => session.runtimeSessionManager.executeRuntimeMethod({
                    method: "reply_prompt", params
                });
                window.executeOrderedAcceptance = async function(code, answer, inspection = {}) {
                    window.orderedRecords = [];
                    reply = answer;
                    promptReplies = [];
                    window.orderedPromptCount = 0;
                    promptPasswords = [];
                    promptIdentities = [];
                    activeRequest = createVisibleCommandRequest({ text: code, source: "paired-ordered-test" });
                    const startedAt = Date.now();
                    const result = await session.runtimeSessionManager.executeVisibleCommandWithEffects(activeRequest);
                    const finishedAt = Date.now();
                    const records = [...window.orderedRecords,
                        ...result.transcriptEvents.map(event => ({ event, time: finishedAt }))];
                    const repliesAccepted = (await Promise.all(promptReplies)).every(Boolean);
                    const journalCount = inspection.inspectJournal === false ? null : Number(await runtime.evalRString(
                        'as.character(length(list.files("/tmp/ordered-journals", pattern="[.]bin$")))'
                    ));
                    return { records, startedAt, finishedAt, outcome: result.evaluationOutcome,
                        journalCount,
                        returnedEvents: result.transcriptEvents, workspaceUpdate: result.workspaceUpdate,
                        workspaceReconciliation: result.workspaceReconciliation,
                        promptCount: window.orderedPromptCount, promptPasswords, promptIdentities, repliesAccepted,
                        activityId: result.activityId,
                        executionDisposition: result.executionDisposition,
                        failed: result.transcriptEvents.some(event => event.type === "failed" || event.state === "error"),
                        terminal: result.transcriptEvents.some(event => event.type === "completed" || event.type === "failed") };
                };
                window.retireOrderedAcceptance = async function() {
                    current = false;
                    client.detach();
                    await session.runtimeSessionManager.stop();
                    for (const journal of journals) await journal.retire();
                };
                window.interruptOrderedAcceptance = async function() {
                    const result = await session.runtimeSessionManager.executeRuntimeMethod({
                        method: "runtime.interrupt", params: {}
                    });
                    if (result.status !== "ready") throw new Error(result.message);
                };
                window.closeOrderedAcceptance = async function() {
                    current = false;
                    closeHelpChannels();
                    client.detach();
                    // Mirror stopWebRRuntime: retire the canonical manager before
                    // awaiting physical worker/resource shutdown.
                    await session.runtimeSessionManager.stop();
                    for (const journal of journals) await journal.retire();
                    window.orderedPlotPresentation.retireImages().forEach(url => URL.revokeObjectURL(url));
                    await runtime.close();
                    window.orderedRuntime = null;
                    window.orderedSessionManager = null;
                };
            };
            const restarter = createWebRRuntimeRestartAdapter({
                getRuntime: () => window.orderedRuntime,
                getRuntimeSessionManager: () => window.orderedSessionManager,
                readRuntimeSnapshot: () => window.orderedSessionManager?.getSnapshot()
                    || { providerId: "webr", status: "stopped", connection: "closed", message: "Fixture worker stopped." },
                canPersistWorkspaceNow: () => true,
                stopRuntime: () => window.closeOrderedAcceptance(),
                startRuntime: async () => {
                    await window.startOrderedAcceptance();
                    return window.orderedSessionManager.getSnapshot();
                },
                invalidateDatasetPreview() {}, setRuntimeSession() {}, sendRuntimeSession() {},
                refreshWorkspace: () => window.orderedSessionManager.listWorkspaceObjects(),
                captureWorkspaceBaseline: async () => {}
            });
            window.restartOrderedAcceptance = action => restarter.restart(action, "paired-restore-test");
            window.checkOrderedConnectionOutput = () => checkActualConnectionOutput({
                host: "webr", execute: (code, answer) => window.executeOrderedAcceptance(code, answer),
                restart: action => window.restartOrderedAcceptance(action)
            });
            window.checkOrderedCommandEventRetirement = () => checkActualCommandEventRetirement({
                host: "webr", execute: (code, answer, inspection) => window.executeOrderedAcceptance(code, answer, inspection),
                readEvents: () => window.orderedSessionManager.listRuntimeEvents(),
                captureProbe: () => window.orderedCommandEventRetirementProbe,
                restart: action => window.restartOrderedAcceptance(action)
            });
            window.checkOrderedVisibleOperationDisposition = () => checkActualVisibleOperationDisposition({
                host: "webr", execute: (code, answer, inspection) => window.executeOrderedAcceptance(code, answer, inspection),
                captureProbe: () => window.orderedCommandEventRetirementProbe,
                restart: action => window.restartOrderedAcceptance(action)
            });
            window.checkOrderedAuxiliaryCommandReceipts = () => checkActualAuxiliaryCommandReceipts({
                host: "webr", execute: (code, answer, inspection) => window.executeOrderedAcceptance(code, answer, inspection),
                captureProbe: () => window.orderedCommandEventRetirementProbe,
                query: request => session.runtimeSessionManager.executeInvisibleQuery(request),
                checkStartupQueries: ${process.env.DIALOGFORGE_TEST_STARTUP_QUERIES === "1"},
                restart: action => window.restartOrderedAcceptance(action)
            });
            window.checkOrderedHelpRetirement = () => checkActualHelpRetirement({
                host: "webr", createReader: hold => window.createOrderedHeldHelpReader(hold),
                restart: async () => {
                    const snapshot = await window.restartOrderedAcceptance("clean");
                    if (snapshot.status !== "ready") throw Error("Actual help worker replacement failed");
                }
            });
            window.checkOrderedExecutingHelpRetirement = () => checkExecutingHelpRetirement({
                host: "webr", createOperation: started => window.createOrderedExecutingHelpOperation(started),
                createFreshReader: () => window.createOrderedHeldHelpReader(async value => value),
                restart: async () => {
                    const snapshot = await window.restartOrderedAcceptance("clean");
                    if (snapshot.status !== "ready") {
                        throw Error("Actual executing-help worker replacement failed");
                    }
                }
            });
            window.measureOrderedDatasetWarming = () => measureRuntimeDatasetWarming({
                host: "webr", execute: (code, answer) => window.executeOrderedAcceptance(code, answer),
                runtime: window.orderedSessionManager, createCache: createDatasetEditorWarmCache,
                checkInvalidation: ${process.env.DIALOGFORGE_TEST_DATASET_CACHE_INVALIDATION === "1"},
                checkMetadataRace: ${process.env.DIALOGFORGE_TEST_DATASET_METADATA_RACE === "1"},
                createEffects: createWorkspaceDatasetCacheEffects, applyEffects: applyWorkspaceDatasetCacheEffects
            });
            window.checkOrderedHistoryStorage = () => {
                const settingsKey = "physical-history-acceptance.settings";
                const fillerKey = "physical-history-acceptance.quota";
                const adapter = createBrowserStorageAdapter({ settingsKey });
                const store = createConsoleHistorySettingsStore({
                    defaultProductId: "physical-history-acceptance", defaultRuntimeId: "webr",
                    readSettings: adapter.readSettings, writeSettings: adapter.writeSettings
                });
                return checkActualHistoryStorage({
                    host: "webr", runtimeId: "webr", createHistory: createConsoleCommandHistory,
                    execute: (code, answer) => window.executeOrderedAcceptance(code, answer),
                    storage: {
                        prepare: value => adapter.writeSettings(value),
                        readHistory: async scope => store.read(scope),
                        writeHistory: value => store.write(value),
                        readSettings: adapter.readSettings,
                        failWrites: async () => {
                            let lower = 0;
                            let upper = 16 * 1024 * 1024;
                            let quotaFailures = 0;
                            while (lower + 1 < upper) {
                                const count = Math.floor((lower + upper) / 2);
                                try {
                                    localStorage.setItem(fillerKey, "x".repeat(count));
                                    lower = count;
                                } catch (error) {
                                    if (error.name !== "QuotaExceededError") {
                                        throw error;
                                    }
                                    quotaFailures++;
                                    upper = count;
                                }
                            }
                            if (!quotaFailures || !lower) {
                                throw Error("Isolated browser Storage quota was not reached");
                            }
                            localStorage.setItem(fillerKey, "x".repeat(lower));
                            return { kind: "storage-quota", fillerCharacters: lower, quotaFailures };
                        },
                        recoverWrites: async () => localStorage.removeItem(fillerKey),
                        cleanup: async () => {
                            localStorage.removeItem(settingsKey);
                            localStorage.removeItem(fillerKey);
                        }
                    }
                });
            };
            window.checkOrderedOutputBudget = () => checkActualOutputBudget({
                host: "webr", execute: (code, answer, inspection) =>
                    window.executeOrderedAcceptance(code, answer, inspection),
                getRuntime: () => window.orderedSessionManager, retentionBytes: ${retentionBytes || "undefined"},
                restart: action => window.restartOrderedAcceptance(action)
            });
            window.checkOrderedOutputDelivery = () => checkActualOutputDeliveryFailure({
                host: "webr", execute: (code, answer) => window.executeOrderedAcceptance(code, answer),
                checkEncoding: ${process.env.DIALOGFORGE_TEST_OUTPUT_ENCODING === "1"},
                arm: () => window.orderedDeliveryProbe.arm(),
                rejectedCount: () => window.orderedDeliveryProbe.rejectedCount(),
                restart: action => window.restartOrderedAcceptance(action)
            });
            window.checkOrderedOutputRetirement = () => checkActualOutputDeliveryRetirement({
                host: "webr", execute: (code, answer, inspection) =>
                    window.executeOrderedAcceptance(code, answer, inspection),
                captureProbe: () => window.orderedDeliveryRetirementProbe,
                restart: action => window.restartOrderedAcceptance(action)
            });
            window.checkOrderedWorkerDrain = () => checkActualWorkerDrainFailure({
                execute: (code, answer, inspection) => window.executeOrderedAcceptance(code, answer, inspection),
                captureProbe: () => window.orderedDrainProbe,
                getRuntime: () => window.orderedSessionManager,
                restart: action => window.restartOrderedAcceptance(action)
            });
            window.checkOrderedWorkerResponseRead = () => checkActualWorkerResponseReadFailure({
                execute: (code, answer, inspection) => window.executeOrderedAcceptance(code, answer, inspection),
                getPhysicalRuntime: () => window.orderedRuntime,
                getRuntime: () => window.orderedSessionManager,
                restart: action => window.restartOrderedAcceptance(action)
            });
            window.checkOrderedCompletionFreshness = () => checkActualCompletionWorkspaceFreshness({
                host: "webr", getRuntime: () => window.orderedSessionManager,
                execute: (code, answer) => window.executeOrderedAcceptance(code, answer),
                captureProbe: () => window.orderedCommandEventRetirementProbe
            });
            window.checkOrderedCompletions = () => checkActualRuntimeCompletions({
                host: "webr", runtime: window.orderedSessionManager,
                execute: (code, answer) => window.executeOrderedAcceptance(code, answer),
                createReader: createRConsoleCompletionReader,
                checkMembers: ${process.env.DIALOGFORGE_TEST_COMPLETION_MEMBERS === "1"}
            });
            window.checkOrderedCompletionRetirement = () => checkActualCompletionRetirement({
                host: "webr", getRuntime: () => window.orderedSessionManager,
                execute: (code, answer) => window.executeOrderedAcceptance(code, answer),
                restart: action => window.restartOrderedAcceptance(action),
                createReader: createRConsoleCompletionReader
            });
            window.checkOrderedExecutingCompletion = () => checkExecutingCompletionRetirement({
                host: "webr", getRuntime: () => window.orderedSessionManager,
                execute: (code, answer) => window.executeOrderedAcceptance(code, answer),
                restart: action => window.restartOrderedAcceptance(action),
                createReader: createRConsoleCompletionReader,
                createProgress: async () => {
                    let started;
                    const progress = new Promise(resolve => { started = resolve; });
                    const observer = window.observeExecutingCompletion;
                    observer(started);
                    return {
                        code: 'webr::eval_js(' + JSON.stringify(
                            'globalThis.Module.webr.channel.write({type: "dialogforge-completion-fixture-progress"}); null'
                        ) + ')',
                        wait: () => progress,
                        dispose: async () => observer(null)
                    };
                }
            });
            window.checkOrderedPackages = () => checkActualRuntimePackages({
                host: "webr", runtime: window.orderedSessionManager,
                emptyRepository: ${JSON.stringify(emptyPackageRepository)},
                checkLoadedNamespaces: ${process.env.DIALOGFORGE_TEST_PACKAGE_LOADED_NAMESPACE === "1"},
                execute: (code, answer) => window.executeOrderedAcceptance(code, answer),
                owners: {
                    createPreparation: createRPackagePreparationController,
                    preparePackages: prepareRequiredRPackages,
                    loadPackages: loadRequiredRPackages, attachPackages: attachRequiredRPackages,
                    requireReceipt: requireSuccessfulRPackageAttachment,
                    captureRuntime: captureRPackageRuntime,
                    createInstall: createRPackageInstallWorkflow
                }
            });
            window.checkOrderedPackageInstallation = () => checkActualPackageInstallation({
                host: "webr", getRuntime: () => window.orderedSessionManager,
                execute: (code, answer) => window.executeOrderedAcceptance(code, answer),
                createInstall: createRPackageInstallWorkflow,
                repository: ${JSON.stringify(validPackageRepository)},
                upgradeRepository: ${JSON.stringify(upgradePackageRepository)},
                staleRepository: ${JSON.stringify(stalePackageRepository)},
                corruptRepository: ${JSON.stringify(corruptPackageRepository)},
                partialRepository: ${JSON.stringify(partialPackageRepository)},
                restoreInstallation: ${process.env.DIALOGFORGE_TEST_PACKAGE_RESTORE === "1"},
                prepareReadonlyLibrary: ${process.env.DIALOGFORGE_TEST_PACKAGE_READONLY === "1"}
                    ? async () => {
                        const profile = ${JSON.stringify(library.profiles[0])};
                        const prepared = await prepareBrowserProductPackageLibrary(profile,
                            { setStatus() {}, progressFromStage() { return 0; } });
                        if (!prepared) {
                            throw Error("Readonly worker package image preparation failed");
                        }
                        const mountpoint = "/paired-readonly-library";
                        await mountWebRFilesystem(window.orderedRuntime, {
                            kind: "workerfs", source: "test", mountpoint,
                            options: { packages: [{ metadata: prepared.metadata, blob: prepared.blob }] }
                        });
                        return mountpoint;
                    } : undefined,
                emptyRepository: ${JSON.stringify(emptyPackageRepository)},
                createInstallCommand: createRequiredInstallCommand,
                restart: action => window.restartOrderedAcceptance(action)
            });
            window.checkOrderedPackageDependencies = () => checkActualPackageDependencies({
                host: "webr", getRuntime: () => window.orderedSessionManager,
                execute: (code, answer) => window.executeOrderedAcceptance(code, answer),
                createInstall: createRPackageInstallWorkflow, createInstallCommand: createRequiredInstallCommand,
                repository: ${JSON.stringify(dependencyPackageRepository)},
                seedRepository: ${JSON.stringify(seedDependencyRepository)},
                checkPublicationRollback: ${process.env.DIALOGFORGE_TEST_PACKAGE_ROLLBACK === "1"},
                restart: action => window.restartOrderedAcceptance(action)
            });
        ` },
        bundle: true, platform: "browser", format: "esm", external: ["/webr/webr.js"],
        plugins: [createBrowserNodeFallbackPlugin()], write: false
    });
    const serviceWorker = process.env.DIALOGFORGE_TEST_HELP_SERVICE_WORKER === "1"
        ? await build({ entryPoints: [path.join(root, "src/shell-web/serviceWorker.js")],
            bundle: true, platform: "browser", format: "iife", write: false }) : null;
    const server = http.createServer((request, response) => {
        // Match the real browser host's isolation needed by WebR's physical
        // blocking-input channel. Do not replace that input with a fixture.
        response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        try {
            const pathname = new URL(request.url, "http://localhost").pathname;
            if (pathname === "/runtime-help-sw.js" && serviceWorker) {
                response.setHeader("Content-Type", "text/javascript");
                response.end(serviceWorker.outputFiles[0].contents);
                return;
            }
            if (serveRegressionPackageLibrary(pathname, response, library)) return;
            if (pathname === "/graphics-device-probe.so") {
                response.writeHead(200, { "Content-Type": "application/octet-stream" }).end(fs.readFileSync(
                    path.join(root, "dist/r-runtime/probe/webr/graphicsdeviceprobe.so")
                ));
                return;
            }
            if (pathname === "/cache-fixture.tgz") {
                response.writeHead(200, { "Content-Type": "application/gzip" }).end(fs.readFileSync(
                    path.join(root, "dist/package-install-fixture/webr/4.6.0/DialogForgeCacheFixture_0.0.1.tgz")
                ));
                return;
            }
            if (pathname === "/") {
                response.setHeader("Content-Type", "text/html");
                response.end('<!doctype html><title>Disposable ordered-output regression</title><script type="module" src="/fixture.js"></script>');
                return;
            }
            if (pathname === "/fixture.js") {
                response.setHeader("Content-Type", "text/javascript");
                response.end(bundle.outputFiles[0].contents);
                return;
            }
            let file;
            if (/^\/r\/[a-zA-Z0-9_-]+\.R$/.test(pathname)) {
                file = path.join(sourceDirectory, path.basename(pathname));
            }
            else if (/^\/r-(inspection|output-prototype)\/webr\/4\.6\.0\/dialogforge(inspect_0\.4\.3|output_0\.0\.1)\.tgz$/.test(pathname)) {
                file = path.join(root, "dist", pathname.slice(1));
            }
            else if (pathname === "/r-runtime/webr/4.6.0/dialogforgeruntime_0.1.1.tgz") {
                file = path.join(root, "dist", pathname.slice(1));
            }
            else if (pathname === "/control-cache.rds") {
                file = path.join(root, "dist/src/runtime/providers/r/r-sources/runtime-control-cache.rds");
            }
            else if (pathname.startsWith("/webr/")) {
                const directory = path.join(root, "node_modules/webr/dist");
                const candidate = path.resolve(directory, pathname.slice(6));
                if (candidate.startsWith(directory + path.sep)) file = candidate;
            }
            if (!file) { response.writeHead(404).end(); return; }
            response.setHeader("Content-Type", file.endsWith(".wasm") ? "application/wasm"
                : /\.(m?js)$/.test(file) ? "text/javascript" : "application/octet-stream");
            response.end(fs.readFileSync(file));
        }
        catch { response.writeHead(404).end(); }
    });
    let browser;
    let deadline;
    try {
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        browser = await chromium.launch({ headless: true });
        deadline = setTimeout(() => { void browser.close(); }, 120000);
        const page = await browser.newPage();
        page.on("pageerror", error => console.error(error));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        assert.equal(await page.evaluate(() => crossOriginIsolated), true,
            "The prompt fixture must use the production host's isolated channel environment.");
        await page.waitForFunction(() => typeof window.startOrderedAcceptance === "function");
        await page.evaluate(() => window.startOrderedAcceptance());
        let result = [];
        if (process.env.DIALOGFORGE_TEST_PROMPT_RETIREMENT === "1") {
            const measurement = await checkActualPromptRetirement({
                host: "webr",
                preparePrompt: () => page.evaluate(() => { window.orderedPromptCount = 0; }),
                waitForPrompt: async () => {
                    await page.waitForFunction(() => window.orderedPromptCount > 0);
                    return page.evaluate(() => window.orderedLastPrompt);
                },
                begin: code => page.evaluate(input => window.executeOrderedAcceptance(
                    input, null, { inspectJournal: false }), code),
                reply: params => page.evaluate(input => window.replyOrderedPrompt(input), params),
                restart: action => page.evaluate(input => window.restartOrderedAcceptance(input), action)
            });
            result.push({ name: "actual-prompt-retirement", ...measurement });
            console.log("Actual prompt retirement measurement: " + JSON.stringify(measurement));
        }
        if (process.env.DIALOGFORGE_TEST_RAW_CONSOLE_INPUT === "1") {
            const raw = await checkRawConsoleInput("webr", (code, answer) => page.evaluate(
                input => window.executeOrderedAcceptance(input.code, input.answer), { code, answer }
            ));
            result.push(raw);
            console.log("Actual raw console input measurement: " + JSON.stringify(raw));
            if (raw.failure) {
                return result;
            }
            await checkPendingInputInterrupt("webr", {
                begin: code => page.evaluate(input => window.executeOrderedAcceptance(input, null), code),
                waitForPrompt: () => page.waitForFunction(() => window.orderedPromptCount > 0),
                interrupt: () => page.evaluate(() => window.interruptOrderedAcceptance()),
                execute: (code, answer) => page.evaluate(input => window.executeOrderedAcceptance(input.code, input.answer), { code, answer })
            }, 'local({ loadNamespace("dialogforgeruntime")$read_runtime_console_line("interrupt raw input: "); cat("input-unreachable\\n") })');
            const scope = await page.evaluate(text => window.orderedRuntime.evalRString(text),
                fs.readFileSync(path.join(root, "scripts/check-runtime-console-scope.R"), "utf8"));
            assert.equal(scope, "console-scope-passed");
        }
        if (process.env.DIALOGFORGE_TEST_FOCUSED_ONLY !== "1") {
            result = await checkCases("webr", (code, answer) => page.evaluate(
                input => window.executeOrderedAcceptance(input.code, input.answer), { code, answer }
            ));
            await checkMixedCellBatch("webr", {
                execute: (code, answer) => page.evaluate(input => window.executeOrderedAcceptance(
                    input.code, input.answer), { code, answer }),
                writeCells: requests => page.evaluate(input => window.writeOrderedCells(input), requests)
            });
            await checkLiveRetirement("webr", {
                begin: code => page.evaluate(input => window.executeOrderedAcceptance(input, "answer"), code),
                waitForEarlyOutput: () => page.waitForFunction(() => window.orderedRecords.some(
                    record => record.event.message === "retire-before\n"
                )),
                retire: () => page.evaluate(() => window.retireOrderedAcceptance()),
                restart: async () => {
                    await page.evaluate(() => window.closeOrderedAcceptance());
                    await page.evaluate(() => window.startOrderedAcceptance());
                },
                execute: (code, answer) => page.evaluate(input => window.executeOrderedAcceptance(
                    input.code, input.answer), { code, answer })
            });
            await checkPhysicalInterrupt("webr", {
                begin: code => page.evaluate(input => window.executeOrderedAcceptance(input, "answer"), code),
                waitForEarlyOutput: () => page.waitForFunction(() => window.orderedRecords.some(
                    record => record.event.message === "interrupt-before\n"
                )),
                interrupt: () => page.evaluate(() => window.interruptOrderedAcceptance()),
                execute: (code, answer) => page.evaluate(input => window.executeOrderedAcceptance(
                    input.code, input.answer), { code, answer })
            });
            await checkPendingInputInterrupt("webr", {
                begin: code => page.evaluate(input => window.executeOrderedAcceptance(input, null), code),
                waitForPrompt: () => page.waitForFunction(() => window.orderedPromptCount > 0),
                interrupt: () => page.evaluate(() => window.interruptOrderedAcceptance()),
                execute: (code, answer) => page.evaluate(input => window.executeOrderedAcceptance(
                    input.code, input.answer), { code, answer })
            });
            await checkRepeatedRestoreRestart("webr", {
                execute: (code, answer) => page.evaluate(input => window.executeOrderedAcceptance(
                    input.code, input.answer), { code, answer }),
                restart: action => page.evaluate(input => window.restartOrderedAcceptance(input), action)
            });
        }
        if (process.env.DIALOGFORGE_TEST_DATASET_WARMING === "1") {
            console.log("Dataset warming measurement: " + JSON.stringify(await page.evaluate(
                () => window.measureOrderedDatasetWarming()
            )));
        }
        if (process.env.DIALOGFORGE_TEST_HISTORY_STORAGE === "1") {
            console.log("Physical history storage measurement: " + JSON.stringify(await page.evaluate(
                () => window.checkOrderedHistoryStorage()
            )));
        }
        if (retentionBytes) {
            console.log("Actual output budget measurement: " + JSON.stringify(await page.evaluate(
                () => window.checkOrderedOutputBudget()
            )));
        }
        if (process.env.DIALOGFORGE_TEST_OUTPUT_DELIVERY === "1") {
            console.log("Actual output delivery measurement: " + JSON.stringify(await page.evaluate(
                () => window.checkOrderedOutputDelivery()
            )));
        }
        if (process.env.DIALOGFORGE_TEST_OUTPUT_RETIREMENT === "1") {
            console.log("Actual output retirement measurement: " + JSON.stringify(await page.evaluate(
                () => window.checkOrderedOutputRetirement()
            )));
        }
        if (process.env.DIALOGFORGE_TEST_WORKER_DRAIN_FAILURE === "1") {
            console.log("Actual worker drain measurement: " + JSON.stringify(await page.evaluate(
                () => window.checkOrderedWorkerDrain()
            )));
        }
        if (process.env.DIALOGFORGE_TEST_WORKER_RESPONSE_FAILURE === "1") {
            console.log("Actual worker response read measurement: " + JSON.stringify(await page.evaluate(
                () => window.checkOrderedWorkerResponseRead()
            )));
        }
        if (process.env.DIALOGFORGE_TEST_COMPLETION_WORKSPACE_FRESHNESS === "1") {
            const freshness = await page.evaluate(() => window.checkOrderedCompletionFreshness());
            result.push({ name: "actual-completion-workspace-freshness", ...freshness });
            console.log("Actual completion freshness measurement: " + JSON.stringify(freshness));
        }
        if (process.env.DIALOGFORGE_TEST_ACTUAL_COMPLETIONS === "1") {
            const completion = await page.evaluate(
                () => window.checkOrderedCompletions()
            );
            result.push({ name: "actual-completion-safety", ...completion });
            console.log("Actual completion measurement: " + JSON.stringify(completion));
            if (process.env.DIALOGFORGE_TEST_COMPLETION_RETIREMENT === "1") {
                console.log("Actual completion retirement measurement: " + JSON.stringify(
                    await page.evaluate(() => window.checkOrderedCompletionRetirement())
                ));
            }
            if (process.env.DIALOGFORGE_TEST_COMPLETION_EXECUTING === "1") {
                console.log("Executing completion retirement measurement: " + JSON.stringify(
                    await page.evaluate(() => window.checkOrderedExecutingCompletion())
                ));
            }
        }
        if (process.env.DIALOGFORGE_TEST_ACTUAL_PACKAGES === "1") {
            const packages = await page.evaluate(() => window.checkOrderedPackages());
            result.push({ name: "actual-package-safety", ...packages });
            console.log("Actual package measurement: " + JSON.stringify(packages));
            if (validPackageRepository) {
                const installed = await page.evaluate(() => window.checkOrderedPackageInstallation());
                result.push({ name: "actual-package-installation", ...installed });
                console.log("Actual physical installation measurement: " + JSON.stringify(installed));
            }
            if (dependencyPackageRepository) {
                const dependencies = await page.evaluate(() => window.checkOrderedPackageDependencies());
                result.push({ name: "actual-package-dependencies", ...dependencies });
                console.log("Actual package dependency measurement: " + JSON.stringify(dependencies));
            }
        }
        if (process.env.DIALOGFORGE_TEST_CONNECTION_OUTPUT === "1") {
            const connectionOutput = await page.evaluate(() => window.checkOrderedConnectionOutput());
            result.push({ name: "actual-connection-output", ...connectionOutput });
            console.log("Actual connection output measurement: " + JSON.stringify(connectionOutput));
        }
        if (process.env.DIALOGFORGE_TEST_COMMAND_EVENT_PARITY === "1") {
            result.push({ name: "actual-command-event-log", ...await checkActualCommandEventLog({
                host: "webr",
                execute: (code, answer) => page.evaluate(input =>
                    window.executeOrderedAcceptance(input.code, input.answer), { code, answer }),
                readEvents: () => page.evaluate(() => window.orderedSessionManager.listRuntimeEvents())
            }) });
        }
        if (process.env.DIALOGFORGE_TEST_AUXILIARY_COMMAND_RECEIPTS === "1") {
            const auxiliary = await page.evaluate(() => window.checkOrderedAuxiliaryCommandReceipts());
            result.push({ name: "actual-auxiliary-command-receipts", ...auxiliary });
            console.log("Actual auxiliary command receipt measurement: " + JSON.stringify(auxiliary));
        }
        if (process.env.DIALOGFORGE_TEST_VISIBLE_OPERATION_DISPOSITION === "1") {
            const disposition = await page.evaluate(() => window.checkOrderedVisibleOperationDisposition());
            result.push({ name: "actual-visible-operation-disposition", ...disposition });
            console.log("Actual visible operation disposition measurement: " + JSON.stringify(disposition));
        }
        if (process.env.DIALOGFORGE_TEST_COMMAND_EVENT_RETIREMENT === "1") {
            const retired = await page.evaluate(() => window.checkOrderedCommandEventRetirement());
            result.push({ name: "actual-command-event-retirement", ...retired });
            console.log("Actual command event retirement measurement: " + JSON.stringify(retired));
        }
        if (process.env.DIALOGFORGE_TEST_PACKAGE_DATASET_CACHE === "1") {
            const cached = await page.evaluate(() => window.checkOrderedPackageDatasetCache());
            result.push({ name: "actual-package-dataset-cache", ...cached });
            console.log("Package dataset cache measurement: " + JSON.stringify(cached));
        }
        if (process.env.DIALOGFORGE_TEST_ACTUAL_GRAPHICS === "1") {
            if (process.env.DIALOGFORGE_TEST_GRAPHICS_CALLBACKS === "1") {
                await page.evaluate(async () => {
                    const response = await fetch("/graphics-device-probe.so");
                    if (!response.ok) throw Error("Missing canonical foreign-driver probe");
                    await window.orderedRuntime.FS.writeFile("/tmp/graphicsdeviceprobe.so",
                        new Uint8Array(await response.arrayBuffer()));
                });
            }
            console.log("Actual graphics measurement: " + JSON.stringify(await checkActualRuntimeGraphics({
                host: "webr",
                foreignDriverPath: process.env.DIALOGFORGE_TEST_GRAPHICS_CALLBACKS === "1"
                    ? "/tmp/graphicsdeviceprobe.so" : undefined,
                checkLowLevelClose: process.env.DIALOGFORGE_TEST_GRAPHICS_LOW_LEVEL === "1",
                openForeignDeviceCode: 'webr::canvas(width=720,height=576,capture=TRUE); grDevices::dev.control(displaylist="enable")',
                execute: (code, answer) => page.evaluate(input => window.executeOrderedAcceptance(input.code, input.answer), { code, answer }),
                readState: query => page.evaluate(async query => {
                    const result = await window.orderedSessionManager.executeInvisibleQuery({ query, source: "paired-graphics-test" });
                    if (result.status !== "ready") throw new Error(result.message);
                    return JSON.parse(String(result.value));
                }, graphicsStateQuery),
                readImage: () => page.evaluate(() => window.orderedPlotPixels)
            })));
            if (process.env.DIALOGFORGE_TEST_GRAPHICS_RESOURCE_RETIREMENT === "1") {
                const resources = await page.evaluate(() => window.checkOrderedPlotResourceRetirement());
                result.push({ name: "actual-graphics-resource-retirement", ...resources });
                console.log("Actual graphics resource retirement measurement: " + JSON.stringify(resources));
            }
        }
        if (process.env.DIALOGFORGE_TEST_ACTUAL_HELP === "1") {
            if (process.env.DIALOGFORGE_TEST_HELP_SERVICE_WORKER === "1") {
                const channel = await checkWebRHelpServiceWorker(page,
                    "http://127.0.0.1:" + server.address().port + "/runtime-help-sw.js",
                    process.env.DIALOGFORGE_TEST_HELP_SERVICE_WORKER_REPLACEMENT === "1");
                result.push({ name: "actual-help-service-worker", ...channel });
                console.log("Actual help service worker measurement: " + JSON.stringify(channel));
            }
            if (process.env.DIALOGFORGE_TEST_HELP_EXECUTING === "1") {
                const retired = await page.evaluate(() => window.checkOrderedExecutingHelpRetirement());
                result.push({ name: "executing-help-retirement", ...retired });
                console.log("Executing help retirement measurement: " + JSON.stringify(retired));
            }
            if (process.env.DIALOGFORGE_TEST_HELP_RETIREMENT === "1") {
                const retired = await page.evaluate(() => window.checkOrderedHelpRetirement());
                result.push({ name: "actual-help-retirement", ...retired });
                console.log("Actual help retirement measurement: " + JSON.stringify(retired));
            }
            console.log("Actual help measurement: " + JSON.stringify(await checkActualRuntimeHelp({
                host: "webr",
                fetchPage: value => page.evaluate(value => window.fetchOrderedHelpPage(value), value),
                fetchResource: value => page.evaluate(value => window.fetchOrderedHelpResource(value), value),
                retireOwner: () => page.evaluate(() => window.retireOrderedAcceptance())
            })));
        }
        console.log("Runtime fixture startup measurement: " + JSON.stringify(await page.evaluate(
            () => window.orderedStartupMeasurements
        )));
        await page.evaluate(() => window.closeOrderedAcceptance());
        return result;
    }
    finally {
        clearTimeout(deadline);
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
    }
};

const main = async function() {
    if (process.env.DIALOGFORGE_TEST_FOCUSED_ONLY === "1") {
        assert.ok([
            "DIALOGFORGE_TEST_PROMPT_RETIREMENT", "DIALOGFORGE_TEST_PACKAGE_DATASET_CACHE",
            "DIALOGFORGE_TEST_COMMAND_EVENT_PARITY",
            "DIALOGFORGE_TEST_COMMAND_EVENT_RETIREMENT",
            "DIALOGFORGE_TEST_CONNECTION_OUTPUT",
            "DIALOGFORGE_TEST_VISIBLE_OPERATION_DISPOSITION",
            "DIALOGFORGE_TEST_AUXILIARY_COMMAND_RECEIPTS",
            "DIALOGFORGE_TEST_COMPLETION_WORKSPACE_FRESHNESS",
            "DIALOGFORGE_TEST_HISTORY_STORAGE", "DIALOGFORGE_TEST_NATIVE_PROCESS_PIPES",
            "DIALOGFORGE_TEST_WORKER_DRAIN_FAILURE", "DIALOGFORGE_TEST_WORKER_RESPONSE_FAILURE",
            "DIALOGFORGE_TEST_OUTPUT_RETIREMENT", "DIALOGFORGE_TEST_OUTPUT_DELIVERY",
            "DIALOGFORGE_TEST_OUTPUT_BUDGET", "DIALOGFORGE_TEST_RAW_CONSOLE_INPUT",
            "DIALOGFORGE_TEST_ACTUAL_HELP", "DIALOGFORGE_TEST_ACTUAL_GRAPHICS",
            "DIALOGFORGE_TEST_DATASET_WARMING", "DIALOGFORGE_TEST_ACTUAL_COMPLETIONS",
            "DIALOGFORGE_TEST_ACTUAL_PACKAGES"
        ]
            .some(name => process.env[name] === "1"), "Focused acceptance must select an actual scenario");
    }
    let repository;
    const repositoryRequests = [];
    let repositoryHost = "native";
    if (process.env.DIALOGFORGE_TEST_EMPTY_PACKAGE_INSTALL === "1"
        || process.env.DIALOGFORGE_TEST_PACKAGE_INSTALL_SUCCESS === "1") {
        repository = http.createServer((request, response) => {
            response.setHeader("Access-Control-Allow-Origin", "*");
            response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            const pathname = new URL(request.url, "http://localhost").pathname;
            repositoryRequests.push({ host: repositoryHost, path: pathname });
            if (pathname.startsWith("/dependencies/") || pathname.startsWith("/seed-dependency/")) {
                const seed = pathname.startsWith("/seed-dependency/");
                const binary = pathname.includes("/bin/");
                const suffix = binary ? ".tgz" : ".tar.gz";
                const packages = seed ? [["DialogForgeDependencyFixture", "0.0.1"]]
                    : [["DialogForgeInstallFixture", "0.0.3"], ["DialogForgeDependencyFixture", "0.0.2"]];
                const metadata = packages.map(([name, version]) => [
                    "Package: " + name, "Version: " + version, "Depends: R (>= 4.6.0)",
                    ...(name === "DialogForgeInstallFixture" ? ["Imports: DialogForgeDependencyFixture (>= 0.0.2)"] : []),
                    "License: MIT + file LICENSE", "NeedsCompilation: no", "File: " + name + "_" + version + suffix, "", ""
                ].join("\n")).join("\n");
                if (pathname.endsWith("/PACKAGES")) {
                    response.writeHead(200, { "Content-Type": "text/plain" }).end(metadata);
                } else if (pathname.endsWith("/PACKAGES.gz")) {
                    response.writeHead(200, { "Content-Type": "application/gzip" })
                        .end(require("node:zlib").gzipSync(Buffer.from(metadata)));
                } else {
                    const archive = packages.find(([name, version]) => pathname.endsWith("/" + name + "_" + version + suffix));
                    if (!archive) {
                        response.writeHead(404).end();
                        return;
                    }
                    const directory = binary ? pathname.includes("/bin/emscripten/") ? "webr/4.6.0" : "native" : "";
                    response.writeHead(200, { "Content-Type": "application/octet-stream" }).end(fs.readFileSync(
                        path.join(root, "dist/package-install-fixture", directory, archive[0] + "_" + archive[1] + suffix)
                    ));
                }
                return;
            }
            const upgrade = pathname.startsWith("/upgrade/");
            const stale = pathname.startsWith("/stale/");
            const corrupt = pathname.startsWith("/corrupt/");
            const partial = pathname.startsWith("/partial/");
            const partialUpgrade = partial && pathname.includes("/upgrade/");
            const fixture = pathname.startsWith("/fixture/") || upgrade || stale || corrupt || partial;
            const version = upgrade || stale || partialUpgrade ? "0.0.2" : "0.0.1";
            const archiveVersion = stale ? "0.0.1" : version;
            const wasm = pathname.includes("/bin/emscripten/");
            const binary = pathname.includes("/bin/");
            const archiveName = "DialogForgeInstallFixture_" + version + (binary ? ".tgz" : ".tar.gz");
            const index = fixture ? [
                "Package: DialogForgeInstallFixture", "Version: " + version, "Depends: R (>= 4.6.0)",
                "License: MIT + file LICENSE", "NeedsCompilation: no", "File: " + archiveName, "", ""
            ].join("\n") : "";
            if (corrupt && /DialogForgeInstallFixture_[0-9.]+\.(?:tgz|tar\.gz)$/.test(pathname)) {
                response.writeHead(200, { "Content-Type": "application/octet-stream" })
                    .end(Buffer.from("This is deliberately not a package archive\n"));
                return;
            }
            if (partial && pathname.endsWith("/" + archiveName)) {
                const directory = binary ? wasm ? "webr/4.6.0" : "native" : "";
                const bytes = fs.readFileSync(path.join(root, "dist/package-install-fixture",
                    directory, "DialogForgeInstallFixture_" + archiveVersion + (binary ? ".tgz" : ".tar.gz")));
                const firstPart = bytes.subarray(0, Math.floor(bytes.length / 2));
                if (pathname.includes("/disconnect/")) {
                    // Actual download begins before the physical repository peer
                    // disappears. The common fixture, not either host, selects it.
                    response.writeHead(200, {
                        "Content-Type": "application/octet-stream", "Content-Length": bytes.length
                    });
                    response.write(firstPart);
                    setTimeout(() => response.destroy(), 25);
                } else {
                    // Complete HTTP transfer of a real, truncated gzip archive.
                    response.writeHead(200, { "Content-Type": "application/octet-stream" }).end(firstPart);
                }
                return;
            }
            if (fixture && pathname.endsWith("/DialogForgeInstallFixture_" + version + ".tgz")) {
                response.writeHead(200, { "Content-Type": "application/octet-stream" })
                    .end(fs.readFileSync(path.join(root, wasm
                        ? "dist/package-install-fixture/webr/4.6.0/DialogForgeInstallFixture_" + archiveVersion + ".tgz"
                        : "dist/package-install-fixture/native/DialogForgeInstallFixture_" + archiveVersion + ".tgz")));
                return;
            }
            if (fixture && pathname.endsWith("/DialogForgeInstallFixture_" + version + ".tar.gz")) {
                response.writeHead(200, { "Content-Type": "application/octet-stream" })
                    .end(fs.readFileSync(path.join(root, "dist/package-install-fixture/DialogForgeInstallFixture_" + archiveVersion + ".tar.gz")));
                return;
            }
            if (pathname.endsWith("/PACKAGES")) {
                response.writeHead(200, { "Content-Type": "text/plain" }).end(index);
            }
            else if (pathname.endsWith("/PACKAGES.gz")) {
                response.writeHead(200, { "Content-Type": "application/gzip" })
                    .end(require("node:zlib").gzipSync(Buffer.from(index)));
            }
            else {
                response.writeHead(404).end();
            }
        });
        await new Promise(resolve => repository.listen(0, "127.0.0.1", resolve));
        const origin = "http://127.0.0.1:" + repository.address().port;
        emptyPackageRepository = process.env.DIALOGFORGE_TEST_EMPTY_PACKAGE_INSTALL === "1"
            || process.env.DIALOGFORGE_TEST_PACKAGE_UPGRADE === "1"
            ? origin + "/empty" : undefined;
        validPackageRepository = process.env.DIALOGFORGE_TEST_PACKAGE_INSTALL_SUCCESS === "1" ? origin + "/fixture" : undefined;
        upgradePackageRepository = process.env.DIALOGFORGE_TEST_PACKAGE_UPGRADE === "1"
            || process.env.DIALOGFORGE_TEST_PACKAGE_PARTIAL === "1"
            || process.env.DIALOGFORGE_TEST_PACKAGE_RESTORE === "1"
            ? origin + "/upgrade" : undefined;
        stalePackageRepository = process.env.DIALOGFORGE_TEST_PACKAGE_UPGRADE === "1" ? origin + "/stale" : undefined;
        corruptPackageRepository = process.env.DIALOGFORGE_TEST_PACKAGE_CORRUPT === "1" ? origin + "/corrupt" : undefined;
        partialPackageRepository = process.env.DIALOGFORGE_TEST_PACKAGE_PARTIAL === "1" ? origin + "/partial" : undefined;
        dependencyPackageRepository = process.env.DIALOGFORGE_TEST_PACKAGE_DEPENDENCIES === "1" ? origin + "/dependencies" : undefined;
        seedDependencyRepository = dependencyPackageRepository ? origin + "/seed-dependency" : undefined;
    }
    let native;
    let webr;
    try {
        native = await runNative();
        repositoryHost = "webr";
        webr = process.env.DIALOGFORGE_TEST_NATIVE_ONLY === "1" ? [] : await runWebR();
    }
    finally {
        if (repository) await new Promise(resolve => repository.close(resolve));
    }
    console.log(JSON.stringify({ native, webr }));
    for (const raw of [...native, ...webr].filter(result => result.name === "actual-raw-console-input")) {
        assert.equal(raw.failure, "", raw.host + ": raw C input did not reach shared prompt handling");
        assert.equal(raw.observations.length, 7);
    }
    if (repositoryRequests.length) console.log("Actual package repository requests: " + JSON.stringify(repositoryRequests));
    for (const retired of [...native, ...webr].filter(result => result.name === "actual-help-retirement")) {
        for (const observation of retired.observations) {
            assert.equal(observation.status, 410, retired.host + ": old help delivery/error reused a new owner");
            assert.equal(observation.error, "help-resource-retired");
            assert.equal(observation.bodyPublished, false);
            assert.equal(observation.textPublished, false);
        }
    }
    for (const result of [...native, ...webr].filter(result => result.name === "actual-package-dependencies")) {
        for (const observation of result.observations) {
            assert.equal(observation.writeProbeCount, 0);
            assert.equal(observation.stagingDirectoryCount, observation.mode === "rollback-recovery" ? 1 : 0);
            if (observation.recovery) {
                assert.notEqual(observation.failure, "");
                assert.deepEqual(observation.accepted, []);
                assert.equal(observation.versions, observation.mode === "replacement-failure"
                    ? "missing|0.0.1" : "missing|missing");
                assert.equal(observation.selected, "DialogForgeDependencyFixture|DialogForgeInstallFixture");
                assert.equal(observation.dependencyLoaded, false);
                if (observation.mode === "replacement-failure" || observation.mode === "rollback-recovery") {
                    assert.equal(observation.oldDependencyBytesPreserved, true);
                }
                if (observation.mode === "rollback-recovery") {
                    assert.ok(observation.outcomes[0].output.includes("Package rollback needs recovery from:"));
                    assert.ok(observation.outcomes[0].output.includes(path.dirname(observation.recoveryDirectory)));
                    assert.equal(observation.manualRecoveryBytesPreserved, true);
                } else {
                    assert.ok(observation.outcomes[0].output.includes("Unable to publish the installed R package:"));
                }
                assert.equal(observation.recovery.failure, "");
                assert.deepEqual(observation.recovery.accepted, ["DialogForgeInstallFixture"]);
                assert.equal(observation.recovery.versions, "0.0.3|0.0.2");
                assert.equal(observation.recovery.value, 42);
                continue;
            }
            if (observation.mode === "outdated-loaded") {
                assert.notEqual(observation.failure, "");
                assert.deepEqual(observation.accepted, []);
                assert.equal(observation.versions, "missing|0.0.1");
                assert.equal(observation.selected, "");
                assert.equal(observation.dependencyLoaded, true);
                assert.ok(observation.outcomes[0].output.includes(
                    "Restart R before installing loaded packages: DialogForgeDependencyFixture"));
                continue;
            }
            assert.equal(observation.failure, "", result.host + ": required dependency installation failed");
            assert.deepEqual(observation.accepted, ["DialogForgeInstallFixture"]);
            assert.equal(observation.versions, "0.0.3|0.0.2");
            assert.equal(observation.selected, observation.mode === "compatible-loaded"
                ? "DialogForgeInstallFixture" : "DialogForgeDependencyFixture|DialogForgeInstallFixture");
            assert.equal(observation.dependencyLoaded, true);
        }
    }
    for (const result of [...native, ...webr].filter(result => result.name === "actual-package-installation")) {
        for (const observation of result.observations) {
            assert.equal(observation.state.writeProbeCount, 0, result.host + ": library admission left a write probe");
            assert.equal(observation.state.stagingDirectoryCount, 0,
                result.host + ": completed installation left a staging directory");
        }
        const success = result.observations.find(observation => observation.mode === "success");
        assert.equal(success.failure, "", result.host + ": physical package install failed");
        assert.deepEqual(success.accepted, ["DialogForgeInstallFixture"]);
        assert.equal(success.state.present, true);
        assert.equal(success.state.selectedLibrary, true);
        assert.equal(success.state.version, "0.0.1");
        assert.equal(success.value, 42);
        const upgrade = result.observations.find(observation => observation.mode === "upgrade");
        if (upgrade) {
            assert.equal(upgrade.failure, "", result.host + ": physical update failed");
            assert.deepEqual(upgrade.accepted, ["DialogForgeInstallFixture"]);
            assert.equal(upgrade.state.version, "0.0.2", result.host + ": stale package accepted as updated");
            assert.equal(upgrade.state.selectedLibrary, true);
            assert.equal(upgrade.value, 42);
        }
        const restarted = result.observations.find(observation =>
            observation.mode === "restart-upgrade" || observation.mode === "restore-upgrade");
        if (restarted) {
            assert.equal(restarted.failure, "", result.host + ": post-restart installation failed");
            assert.deepEqual(restarted.accepted, ["DialogForgeInstallFixture"]);
            assert.equal(restarted.state.version, "0.0.2");
            assert.equal(restarted.state.selectedLibrary, true);
            assert.equal(restarted.value, 42);
            assert.deepEqual(restarted.confirmations, [["DialogForgeInstallFixture"]]);
            assert.equal(restarted.restarts, 1);
            if (restarted.mode === "restore-upgrade") {
                assert.equal(restarted.restoredWorkspace, true, result.host + ": package restart lost the saved workspace");
            }
        }
        for (const failure of result.observations.filter(observation =>
            !["success", "upgrade", "restart-upgrade", "restore-upgrade"].includes(observation.mode))) {
            assert.notEqual(failure.failure, "", result.host + ": failed physical install was accepted");
            assert.deepEqual(failure.accepted, []);
            if (failure.mode === "stale-version" || failure.mode === "unavailable-upgrade") {
                assert.equal(failure.state.version, "0.0.1");
                assert.equal(failure.state.selectedLibrary, true);
            }
            if (failure.mode === "unavailable-upgrade") {
                assert.ok(repositoryRequests.some(request => request.host === result.host
                    && request.path.startsWith("/empty/")),
                    result.host + ": unavailable upgrade must reach the actual empty repository");
                assert.ok(!failure.outcomes[0].output.includes("undefined/"),
                    result.host + ": undefined repository is not an unavailable-package test");
            }
            if (failure.mode === "load-failure") {
                if (result.host === "native" && !failure.state.present) {
                    // Native source installation test-loads the package before
                    // promotion. WebR's binary installer reaches the shared
                    // post-install namespace check instead.
                    assert.equal(failure.failure, "Failed to install required R packages.");
                    assert.equal(failure.state.loaded, false);
                    assert.match(failure.outcomes[0].output, /DialogForge package fixture load failure/);
                    assert.match(failure.outcomes[0].output, /Package installation did not reach the selected library/);
                }
                else {
                    assert.match(failure.failure, /Installed R package could not load:/);
                    assert.equal(failure.state.present, true);
                    assert.equal(failure.state.loaded, false);
                }
            }
            if (failure.mode === "late-loaded") {
                assert.equal(failure.state.version, "0.0.1");
                assert.match(failure.outcomes[0].output, /Restart R before installing loaded packages:/);
            }
            if (failure.mode === "failed-extraction" || failure.mode === "readonly-library") {
                assert.equal(failure.state.present, false, result.host + ": corrupt archive created an accepted package");
                assert.equal(failure.state.loaded, false, result.host + ": corrupt archive loaded a namespace");
            }
            if (failure.mode === "readonly-library") {
                assert.equal(failure.libraryPathsChanged, false,
                    result.host + ": readonly admission changed library search before rejection");
                assert.match(failure.outcomes[0].output, /Selected R package library is not a writable directory/);
            }
            if (failure.recovery) {
                assert.equal(failure.state.loaded, false, result.host + ": partial installation loaded a namespace");
                assert.equal(failure.state.version, failure.mode.endsWith("-upgrade") ? "0.0.1" : "",
                    result.host + ": partial extraction replaced the current package metadata");
                assert.equal(failure.recovery.failure, "", result.host + ": retry after partial installation failed");
                assert.deepEqual(failure.recovery.accepted, ["DialogForgeInstallFixture"]);
                assert.equal(failure.recovery.state.selectedLibrary, true);
                assert.equal(failure.recovery.state.version, failure.mode.endsWith("-upgrade") ? "0.0.2" : "0.0.1");
                assert.equal(failure.recovery.state.writeProbeCount, 0);
                assert.equal(failure.recovery.state.stagingDirectoryCount, 0);
                assert.equal(failure.recovery.value, 42);
            }
        }
    }
    for (const result of [...native, ...webr].filter(result => result.name === "actual-package-safety")) {
        if (result.loadedNamespaceRestart) {
            assert.deepEqual(result.loadedNamespaceRestart.confirmations, [["declared"]],
                result.host + ": loaded but detached namespace bypassed restart choice");
            assert.equal(result.loadedNamespaceRestart.libraryChoices, 0,
                "Canceled namespace restart must stop before library choice");
        }
        if (result.emptyRepository) {
            assert.equal(result.emptyRepository.present, false);
            assert.equal(result.emptyRepository.rejected, true,
                result.host + ": installation of an absent package reported acceptance");
            assert.deepEqual(result.emptyRepository.accepted, [],
                result.host + ": failed physical installation published installed packages");
        }
    }
    for (const result of [...native, ...webr].filter(result => result.name === "actual-completion-safety")) {
        assert.equal(result.bindingHits, 0, result.host + ": completion evaluated a lazy/active binding");
        assert.deepEqual(result.lazy, [], result.host + ": unforced lazy member completion must be restricted");
        assert.deepEqual(result.active, [], result.host + ": active member completion must be restricted");
        assert.deepEqual(result.forced, ["alpha"], result.host + ": explicitly forced value did not recover");
        assert.equal(result.explicitHits, 1, result.host + ": only explicit evaluation may run the lazy body");
        if (result.memberSafety) {
            assert.equal(result.memberSafety.methodHits, 0, result.host + ": completion invoked a class method");
            assert.deepEqual(result.memberSafety.custom, []);
            assert.deepEqual(result.memberSafety.nestedCustom, []);
            assert.deepEqual(result.memberSafety.modifiedStandard, []);
            assert.deepEqual(result.memberSafety.functions, ["alpha"], "Stored function-valued fields must not be lost");
            assert.deepEqual(result.memberSafety.restoredStandard, ["alpha"]);
        }
    }
    console.log(process.env.DIALOGFORGE_TEST_NATIVE_ONLY === "1"
        ? "Selected native physical scenarios passed; WebR/product rendering/default enablement remain separate."
        : process.env.DIALOGFORGE_TEST_FOCUSED_ONLY === "1"
        ? "Selected actual paired scenario passed; full suite/product rendering remain separate."
        : "Real paired opt-in ordered output passed; product rendering/default enablement/full producer drain remain separate.");
};

main().catch(error => { console.error(error); process.exitCode = 1; });
