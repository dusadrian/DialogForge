"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const [checkpoint, destination] = process.argv.slice(2);
if (!checkpoint || !destination) {
    throw Error("Usage: node scripts/replay-runtime-checkpoint.js <retained-results.json> <private-results.json>");
}
const root = path.resolve(__dirname, "..");
const entries = JSON.parse(fs.readFileSync(checkpoint, "utf8"));
const results = [];
for (const entry of entries) {
    if (!/^check-[a-z0-9-]+\.js$/.test(entry.script)) {
        throw Error("Invalid retained regression script name: " + entry.script);
    }
    const started = Date.now();
    const result = spawnSync(process.execPath, [path.join(root, "scripts", entry.script)], {
        cwd: root, encoding: "utf8", timeout: 60000
    });
    results.push({ script: entry.script, exitCode: result.status,
        durationMs: Date.now() - started, stdout: result.stdout, stderr: result.stderr,
        error: result.error ? String(result.error) : undefined });
    if (result.status !== 0) {
        console.log("FAILED " + entry.script + ": " + (result.stderr || result.error));
    }
    if (results.length % 20 === 0) {
        console.log("Completed " + results.length + "/" + entries.length);
    }
}
fs.writeFileSync(destination, JSON.stringify({
    recordedAt: new Date().toISOString(), checkpoint,
    passed: results.filter(result => result.exitCode === 0).length,
    total: results.length, results
}, null, 2));
console.log(JSON.stringify({ passed: results.filter(result => result.exitCode === 0).length, total: results.length }));
if (results.some(result => result.exitCode !== 0)) {
    process.exitCode = 1;
}
