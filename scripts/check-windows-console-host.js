"use strict";

// Physical Windows frontend checks; all scope behavior cases remain the
// canonical check-runtime-console-scope.R used by every native target.
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const host = process.env.DIALOGFORGE_R_BINARY;
const library = process.env.DIALOGFORGE_TRANSPORT_LIBRARY;
assert.equal(process.platform, "win32");
assert.ok(host && library);
const plainR = process.env.DIALOGFORGE_BUILD_R || "R";
const withoutHost = spawnSync(plainR, ["--vanilla", "--slave", "-e",
    `helper <- loadNamespace("dialogforgeruntime", lib.loc=${JSON.stringify(library)}); `
    + 'helper$with_runtime_console_input(function() NULL, function(prompt) "reply")'
], { encoding: "utf8", timeout: 5000 });
assert.notEqual(withoutHost.status, 0);
assert.match(withoutHost.stderr, /version-pinned Windows R host/);

const directory = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || require("node:os").tmpdir(), "df-windows-host-"));
const source = path.join(directory, "unicode-é.R");
fs.writeFileSync(source, 'stopifnot(identical(commandArgs(trailingOnly=TRUE), c("marker", "Ω😀é"))); cat("HOST_FILE_OK\\n")\n');
const file = spawnSync(host, ["--vanilla", "--slave", "--file=" + source, "--args", "marker", "Ω😀é"], {
    encoding: "utf8", timeout: 5000
});
assert.equal(file.status, 0, file.stderr || String(file.error));
assert.match(file.stdout, /HOST_FILE_OK/);

const child = spawn(host, ["--vanilla", "--slave", "-e",
    `helper <- loadNamespace("dialogforgeruntime", lib.loc=${JSON.stringify(library)}); `
    + 'result <- tryCatch(helper$with_runtime_console_input(function() { '
    + 'cat("HOST_READY\\n"); flush.console(); repeat { } }, '
    + 'function(prompt) "unused"), interrupt=function(error) "interrupted"); '
    + 'stopifnot(identical(result, "interrupted")); '
    + 'stopifnot(identical(helper$with_runtime_console_input(function() '
    + 'helper$read_runtime_console_line("recovered: ",512L),function(prompt) "after interrupt"),"after interrupt")); '
    + 'cat("HOST_RECOVERED\\n")'
], { stdio: "pipe", windowsHide: true });
let output = "";
let errors = "";
let requested = false;
const timeout = setTimeout(() => child.kill(), 10000);
child.stdout.on("data", function(bytes) {
    output += String(bytes);
    if (!requested && /HOST_READY\r*\n/.test(output)) {
        requested = true;
        const interrupt = spawnSync(host, ["--interrupt-pid", String(child.pid)], {
            windowsHide: true, encoding: "utf8", timeout: 2000
        });
        assert.equal(interrupt.status, 0, interrupt.stderr || String(interrupt.error));
    }
});
child.stderr.on("data", bytes => { errors += String(bytes); });
child.on("error", function(error) {
    clearTimeout(timeout);
    throw error;
});
child.on("close", function(code) {
    clearTimeout(timeout);
    assert.equal(code, 0, errors || output);
    assert.ok(requested);
    assert.match(output, /HOST_RECOVERED/);
    console.log("Windows physical host: UTF-8 file/arguments, required bridge, interrupt and shared-scope recovery passed.");
});
