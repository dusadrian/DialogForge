"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { finishConsoleParity } = require("./verify-console-command-parity");

const checkConsoleFixtureCleanup = async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "console-cleanup-check-"));
    const reportPath = path.join(root, "report.json");
    const fixture = () => fs.mkdtempSync(path.join(root, "fixture-"));
    const savedReport = () => JSON.parse(fs.readFileSync(reportPath, "utf8"));
    try {
        const directory = fixture();
        fs.writeFileSync(path.join(directory, "data.txt"), "fixture");
        const report = { ok: true };
        assert.equal(finishConsoleParity(report, directory, reportPath), report);
        assert.equal(fs.existsSync(directory), false);
        assert.equal(savedReport().ok, true);
        assert.ok(savedReport().finishedAt);

        // Exercise report/error precedence without depending on the host's
        // permission model. Real Windows handle locks are checked below.
        for (const original of [undefined, new Error("original assertion failed")]) {
            const directory = fixture();
            const locked = Object.assign(new Error("fixture directory locked"), { code: "EPERM" });
            const remove = fs.rmSync;
            fs.rmSync = function(target, options) {
                if (target === directory) throw locked;
                return remove(target, options);
            };
            try {
                assert.throws(
                    () => finishConsoleParity({ ok: !original }, directory, reportPath, original),
                    error => error === (original || locked)
                );
                const saved = savedReport();
                assert.equal(saved.ok, false);
                assert.match(saved.cleanupError, /fixture directory locked/);
                assert.match(saved.error, original ? /original assertion failed/ : /fixture directory locked/);
            } finally {
                fs.rmSync = remove;
                remove(directory, { recursive: true, force: true });
            }
        }

        if (process.platform === "win32") {
            for (const persistent of [false, true]) {
                const directory = fixture();
                // Windows locks a process's working directory. The child exits
                // on its own in the transient case; no mock releases the lock.
                const child = spawn(process.execPath, ["-e",
                    "process.stdout.write('ready'); setTimeout(() => process.exit(0), 120000); "
                    + "process.stdin.once('data', () => setTimeout(() => process.exit(0), 800));"
                ], { cwd: directory, stdio: ["pipe", "pipe", "pipe"] });
                const closed = once(child, "close");
                try {
                    await Promise.race([
                        once(child.stdout, "data"),
                        once(child, "error").then(([error]) => { throw error; })
                    ]);
                    assert.throws(() => fs.rmSync(directory, { recursive: true, force: true }),
                        error => ["EPERM", "EBUSY", "EACCES"].includes(error.code));
                    if (!persistent) child.stdin.end("release");
                    const started = Date.now();
                    if (persistent) {
                        assert.throws(() => finishConsoleParity({ ok: true }, directory, reportPath),
                            error => ["EPERM", "EBUSY", "EACCES"].includes(error.code));
                        assert.equal(savedReport().ok, false);
                        assert.ok(savedReport().cleanupError);
                        assert.ok(Date.now() - started < 20000, "Persistent locks must fail within a bounded interval.");
                    } else {
                        finishConsoleParity({ ok: true }, directory, reportPath);
                        assert.equal(fs.existsSync(directory), false);
                        assert.equal(savedReport().ok, true);
                    }
                } finally {
                    if (child.exitCode === null && child.signalCode === null) child.kill();
                    await closed;
                    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
                }
            }
            console.log("Console fixture cleanup passed: real transient and persistent Windows directory locks.");
        }
        console.log("Console fixture reports passed: successful removal, fatal cleanup errors and original error preservation.");
    } finally {
        fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
};

if (require.main === module) {
    checkConsoleFixtureCleanup().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { checkConsoleFixtureCleanup };
