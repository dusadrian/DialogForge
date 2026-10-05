"use strict";

// Host-selection contract fixture, not a physical Windows or Electron check.
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { resolveWindowsRConsoleHost } = require("../dist/src/runtime/providers/r/session/windowsRConsoleHost");

const originalQuery = childProcess.execFileSync;
const originalExists = fs.existsSync;
const originalStat = fs.statSync;
const helperRoot = path.resolve("fixture-verified-helpers");
const expectedHost = path.join(helperRoot, "x86_64-w64-mingw32-4.6.1",
    "dialogforgeruntime/libs/x64/dialogforge-r-host.exe");
const environment = { Path: "existing-directory", PATH: "duplicate-directory", R_HOME: "stale-home" };
let identity = "x86_64-w64-mingw32-4.6.1\r\nC:/selected-R\r\nC:/selected-R/bin/x64\r\n";
let available = true;
let regularFile = true;
const queries = [];

try {
    childProcess.execFileSync = (command, args, options) => {
        queries.push({ command, args, options });
        return identity;
    };
    fs.existsSync = file => available && file === expectedHost;
    fs.statSync = () => ({ isFile: () => regularFile });

    const selected = resolveWindowsRConsoleHost("chosen-Rterm.exe", environment, helperRoot);
    assert.equal(selected.command, expectedHost);
    assert.equal(selected.env.R_HOME, "C:/selected-R");
    assert.equal(selected.env.PATH, "C:/selected-R/bin/x64;existing-directory");
    assert.equal(Object.hasOwn(selected.env, "Path"), false);
    assert.equal(environment.R_HOME, "stale-home", "Do not mutate the caller's environment.");
    assert.equal(queries[0].command, "chosen-Rterm.exe");
    assert.deepEqual(queries[0].args.slice(0, 3), ["--vanilla", "--slave", "-e"]);
    assert.equal(queries[0].options.windowsHide, true);
    assert.equal(queries[0].options.timeout, 10000);

    for (const value of ["malformed", "i386-w64-mingw32-4.6.1\nR\nbin\n", "x86_64-w64-mingw32-latest\nR\nbin\n"]) {
        identity = value;
        assert.throws(() => resolveWindowsRConsoleHost("chosen-Rterm.exe", environment, helperRoot),
            /Cannot identify/);
    }
    identity = "x86_64-w64-mingw32-4.6.1\nC:/selected-R\nC:/selected-R/bin/x64\n";
    available = false;
    assert.throws(() => resolveWindowsRConsoleHost("chosen-Rterm.exe", environment, helperRoot),
        /verified, version-pinned/);
    available = true;
    regularFile = false;
    assert.throws(() => resolveWindowsRConsoleHost("chosen-Rterm.exe", environment, helperRoot),
        /verified, version-pinned/);
} finally {
    childProcess.execFileSync = originalQuery;
    fs.existsSync = originalExists;
    fs.statSync = originalStat;
}

console.log("Windows host selection contract passed; physical host acceptance is separate.");
