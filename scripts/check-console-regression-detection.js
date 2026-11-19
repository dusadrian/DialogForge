"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const evidence = path.join(root, "artifacts/console-command-parity");


const copyBuild = function(source, target) {
    fs.mkdirSync(target, { recursive: true });

    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const from = path.join(source, entry.name);
        const to = path.join(target, entry.name);

        if (entry.isDirectory() && ["node_modules", "r-runtime", "vendor"].includes(entry.name)) {
            fs.symlinkSync(from, to, process.platform === "win32" ? "junction" : "dir");
        }
        else {
            fs.cpSync(from, to, { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
        }
    }
};


const restoreWholeBlockSubmission = function(directory, inputMode) {
    const file = path.join(directory, "src/runtime/providers/r/r-sources/runtimeDispatchCore.R");
    const source = fs.readFileSync(file, "utf8");
    const planner = "input_plan <- runtime_console_input_boundaries(code)";
    assert.ok(source.includes(planner), "The input planner was not found in the isolated build.");
    fs.writeFileSync(file, source.replace(planner, [
        planner,
        `        if (identical(params$planInput, "${inputMode}")) {`,
        "            input_plan$ends <- length(input_plan$lines)",
        "        }"
    ].join("\n")));
};


const restoreFinalValueOnlyPrinting = function(directory) {
    const file = path.join(directory, "src/runtime/providers/r/r-sources/runtimeDispatchCore.R");
    const source = fs.readFileSync(file, "utf8");
    const evaluator = /runtime_evaluate_visible_expressions <- function\(code\) \{[\s\S]*?\n\}/;
    assert.ok(evaluator.test(source), "The canonical R evaluator was not found in the isolated build.");
    fs.writeFileSync(file, source.replace(evaluator, [
        "runtime_evaluate_visible_expressions <- function(code) {",
        "    result <- withVisible(eval(parse(text = code), envir = .GlobalEnv))",
        "    if (isTRUE(result$visible)) {",
        "        runtime_print_visible_value(result$value)",
        "    }",
        "    invisible(NULL)",
        "}"
    ].join("\n")));
};


const restoreMuffledMessages = function(directory) {
    const file = path.join(directory, "src/runtime/providers/r/r-sources/runtimeWarningCore.R");
    const source = fs.readFileSync(file, "utf8");
    const observer = 'observe_scope("muffleMessage", TRUE)';
    assert.ok(source.includes(observer), "The shared message observer was not found.");
    fs.writeFileSync(file, source.replace(observer, [
        "cat(conditionMessage(condition), file = output_connection)",
        '            tryInvokeRestart("muffleMessage")'
    ].join("\n")));
};


const restoreListWrappedMethodName = function(directory) {
    const file = path.join(directory, "src/runtime/providers/r/r-sources/runtimeBindingInspection.R");
    const source = fs.readFileSync(file, "utf8");
    const extraction = /            # Dynamic S3 registration[\s\S]*?            stock_name <- \.subset2\(stock_name, 1L\)/;
    assert.ok(extraction.test(source), "The safe S3 method extraction was not found.");
    fs.writeFileSync(file, source.replace(extraction,
        "            stock_name <- declarations[declaration, 3L]"));
};


const main = function() {
    const dist = path.join(root, "dist");
    assert.ok(fs.existsSync(path.join(dist, "browser-esm/shell.js")),
        "Build the native and browser outputs before running regression detection.");
    fs.mkdirSync(evidence, { recursive: true });
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-console-mutants-"));
    const results = [];
    const mutations = [
        { name: "whole-block-prompts", case: "rivers" },
        { name: "final-value-only", case: "semicolons" },
        { name: "script-selection-bypass", case: "script-selection" },
        { name: "muffled-message-output", case: "messages" },
        { name: "list-wrapped-method-name", case: "package-methods" }
    ];

    try {
        for (const mutation of mutations) {
            const build = path.join(temporaryRoot, mutation.name);
            copyBuild(dist, build);

            if (mutation.name === "whole-block-prompts") {
                restoreWholeBlockSubmission(build, "console");
            }
            else if (mutation.name === "final-value-only") {
                restoreFinalValueOnlyPrinting(build);
            }
            else if (mutation.name === "muffled-message-output") {
                restoreMuffledMessages(build);
            }
            else if (mutation.name === "list-wrapped-method-name") {
                restoreListWrappedMethodName(build);
            }
            else {
                restoreWholeBlockSubmission(build, "script");
            }

            for (const host of ["native", "web"]) {
                const report = path.join(evidence, `${mutation.name}-${host}.json`);
                const result = spawnSync(process.execPath, [
                    path.join(root, "scripts/verify-console-command-parity.js"),
                    "--host", host,
                    "--dist-dir", build,
                    "--web-dist", build,
                    "--cases", mutation.case,
                    "--report", report,
                    "--timeout-ms", "30000"
                ], {
                    cwd: root,
                    env: process.env,
                    encoding: "utf8",
                    timeout: 90000
                });

                if (result.error) {
                    throw result.error;
                }

                const observation = JSON.parse(fs.readFileSync(report, "utf8"));
                assert.notEqual(result.status, 0, `${host} accepted the ${mutation.name} regression.`);
                assert.equal(observation.ok, false);
                assert.match(observation.error || "", /AssertionError[\s\S]*console transcript/,
                    "A mutation must fail the transcript assertion, not startup or cleanup.");
                results.push({ mutation: mutation.name, host, detected: true, report });
                console.log(`OK ${host} rejects ${mutation.name}`);
            }
        }
    }
    finally {
        fs.writeFileSync(path.join(evidence, "regression-detection.json"),
            JSON.stringify(results, null, 4) + "\n");
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
};


main();
