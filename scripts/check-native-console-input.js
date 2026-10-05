"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const library = process.env.DIALOGFORGE_TRANSPORT_LIBRARY || path.resolve(
    __dirname, "../dist/r-transport-prototype/native/aarch64-apple-darwin23-4.6.1"
);
const rBinary = process.env.DIALOGFORGE_R_BINARY || "R";
const run = function(input, code = 'cat(encodeString(helper$read_runtime_console_line("fixture: ", 512L), quote="\\\"")); stopifnot(!base::interactive())') {
    return spawnSync(rBinary, ["--vanilla", "--quiet", "--no-readline", "-e",
        `tryCatch({ helper <- loadNamespace("dialogforgetransport", lib.loc=${JSON.stringify(library)}); `
            + code + '; q(save="no", status=0) }, error=function(error) { message(conditionMessage(error)); q(save="no", status=1) })'
    ], { input, encoding: "utf8", timeout: 5000 });
};
for (const input of ["answer", "", "Ω😀é", "x".repeat(512)]) {
    const result = run(input + "\n");
    assert.equal(result.status, 0, result.stderr || String(result.error));
    assert.ok(result.stdout.includes(JSON.stringify(input)), result.stdout);
}
const crlf = run("answer\r\n");
assert.equal(crlf.status, 0, crlf.stderr);
assert.ok(crlf.stdout.includes('"answer"'));
for (const input of ["", "partial", "x".repeat(513) + "\n"]) {
    const result = run(input);
    assert.notEqual(result.status, 0, "EOF, incomplete and oversized replies cannot be accepted");
}
const invalid = run("ignored\n", 'helper$read_runtime_console_line(NA_character_, 512L)');
assert.notEqual(invalid.status, 0);
console.log("Actual public R console reads preserve blank/UTF-8/CRLF and reject incomplete/oversized input.");
