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


const changeJavaScript = function(directory, before, after) {
    let replacements = 0;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) {
            continue;
        }

        const file = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            replacements += changeJavaScript(file, before, after);
        }
        else if (entry.name.endsWith(".js")) {
            const source = fs.readFileSync(file, "utf8");

            if (source.includes(before)) {
                fs.writeFileSync(file, source.replaceAll(before, after));
                replacements += 1;
            }
        }
    }

    return replacements;
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
        { name: "script-selection-bypass", case: "script-selection" }
    ];

    try {
        for (const mutation of mutations) {
            const build = path.join(temporaryRoot, mutation.name);
            copyBuild(dist, build);

            if (mutation.name === "whole-block-prompts") {
                const replacements = changeJavaScript(build,
                    "const chunks = plan && !plan.incomplete ? plan.chunks : [text];",
                    "const chunks = [text];");
                assert.ok(replacements >= 2,
                    "The isolated native and browser command planners must both be reverted.");
            }
            else if (mutation.name === "final-value-only") {
                restoreFinalValueOnlyPrinting(build);
            }
            else {
                const replacement = 'const plan = { chunks: [code], incomplete: false, remainder: "" };';
                const native = changeJavaScript(build,
                    "const plan = await (0, consoleInputExecution_1.planConsoleInputExecution)(code, checkFragment);",
                    replacement);
                const browser = changeJavaScript(build,
                    "const plan = await planConsoleInputExecution(code, checkFragment);",
                    replacement);
                assert.ok(native >= 1 && browser >= 1,
                    "The isolated native and browser script planners must both be bypassed.");
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
