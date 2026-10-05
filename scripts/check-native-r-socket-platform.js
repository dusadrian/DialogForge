"use strict";

// Runs the existing native physical cases against private platform artifacts.
// No socket-case policy, R source or production launcher is reimplemented here.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync, execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const directory = process.argv[2];
if (!directory || !path.isAbsolute(directory)) {
    throw Error("Supply the private successful native-platform build directory.");
}
const prior = JSON.parse(fs.readFileSync(path.join(directory, "results.json"), "utf8"));
if (prior.status !== "passed") {
    throw Error("Physical cases require a fully passed current-package platform prerequisite.");
}
const stage = fs.mkdtempSync(path.join(directory, "socket-stage-"));
const sources = "src/runtime/providers/r/r-sources";
fs.mkdirSync(path.dirname(path.join(stage, sources)), { recursive: true });
// Plain artifact copies also work on read-only Docker bind sources whose Node
// directory-copy operation rejects, while individual file copying succeeds.
execFileSync("cp", ["-R", path.join(root, sources), path.join(stage, sources)]);
const platform = prior.identity.split("\n")[1].trim();
const version = prior.identity.match(/R version (\d+\.\d+\.\d+)/)[1];
if (!/^[a-zA-Z0-9_.-]+$/.test(platform)) {
    throw Error("Unexpected native platform identity.");
}
const inspectionRoot = path.join(stage, "r-inspection/native");
fs.mkdirSync(inspectionRoot, { recursive: true });
execFileSync("cp", ["-R", path.join(directory, "library"), path.join(inspectionRoot, platform + "-" + version)]);
const transportLibrary = path.join(stage, "r-transport-prototype/native", platform + "-" + version);
fs.mkdirSync(transportLibrary, { recursive: true });
execFileSync("cp", ["-R", path.join(directory, "library/dialogforgetransport"),
    path.join(transportLibrary, "dialogforgetransport")]);
const cache = path.join(stage, "dist", sources, "runtime-control-cache.rds");
fs.mkdirSync(path.dirname(cache), { recursive: true });
fs.copyFileSync(path.join(directory, "runtime-control-cache.rds"), cache);
const started = Date.now();
const result = spawnSync(process.execPath, [path.join(root, "scripts/check-native-bounded-socket.js")], {
    cwd: root, encoding: "utf8", timeout: 90000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, R_LIBS_USER: path.join(directory, "library"),
        DIALOGFORGE_TEST_NATIVE_ROOT: stage, DIALOGFORGE_TRANSPORT_LIBRARY: path.join(directory, "library") }
});
const prefix = "Actual native socket measurement: ";
const observations = (result.stdout || "").split("\n").filter(line => line.startsWith(prefix))
    .map(line => JSON.parse(line.slice(prefix.length)));
const responsePrefix = "Actual native response close measurement: ";
const responseCloseObservations = (result.stdout || "").split("\n")
    .filter(line => line.startsWith(responsePrefix))
    .map(line => JSON.parse(line.slice(responsePrefix.length)));
const requestPrefix = "Actual native incomplete frame measurement: ";
const requestFrameObservations = (result.stdout || "").split("\n")
    .filter(line => line.startsWith(requestPrefix))
    .map(line => JSON.parse(line.slice(requestPrefix.length)));
const fingerprints = {};
for (const name of [...fs.readdirSync(path.join(root, sources)).filter(name => name.endsWith(".R"))
    .map(name => sources + "/" + name),
    "scripts/check-native-bounded-socket.js", "scripts/check-native-r-socket-platform.js",
    "dist/src/runtime/providers/r/session/runtimeLaunchPlan.js",
    "dist/src/runtime/providers/r/protocol/runtimeControlClient.js",
    "dist/src/runtime/session/processTree.js"]) {
    fingerprints[name] = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, name))).digest("hex");
}
const report = { status: !result.error && result.status === 0 ? "passed" : "failed",
    identity: prior.identity, declaredIdentity: prior.declaredIdentity, stage,
    durationMs: Date.now() - started, observations, responseCloseObservations, requestFrameObservations, fingerprints,
    error: result.error ? String(result.error) : null, renderedAppChecked: false };
if ((process.env.DIALOGFORGE_TEST_R_RESPONSE_CLOSE === "1"
    || process.env.DIALOGFORGE_TEST_R_RESPONSE_STALL === "1")
    && (responseCloseObservations.length !== 1 || responseCloseObservations[0].length !== 1)) {
    report.status = "failed";
    report.error = "The physical platform response-close observation is required.";
}
if (process.env.DIALOGFORGE_TEST_R_REQUEST_STALL === "1"
    && (requestFrameObservations.length !== 1 || requestFrameObservations[0].length !== 1)) {
    report.status = "failed";
    report.error = "The physical platform request-frame observation is required.";
}
fs.writeFileSync(path.join(stage, "run.log"), (result.stdout || "") + (result.stderr || ""));
if (report.status === "passed" && process.argv.includes("--output-suite")) {
    report.outputRuns = [];
    for (const mode of ["ordered", "default-raw"]) {
        const outputStarted = Date.now();
        const output = spawnSync(process.execPath, [path.join(root, "scripts/check-paired-ordered-runtime-output.js")], {
            cwd: root, encoding: "utf8", timeout: 90000, maxBuffer: 16 * 1024 * 1024,
            env: { ...process.env, R_LIBS_USER: path.join(directory, "library"),
                DIALOGFORGE_TEST_NATIVE_ROOT: stage, DIALOGFORGE_TEST_NATIVE_ONLY: "1",
                DIALOGFORGE_TEST_NATIVE_OUTPUT_LIBRARY: path.join(directory, "library"),
                DIALOGFORGE_TEST_NATIVE_TRANSPORT_LIBRARY: path.join(directory, "library"),
                DIALOGFORGE_TEST_CONTROL_CACHE: "1", DIALOGFORGE_TEST_RAW_CONSOLE_INPUT: "1",
                DIALOGFORGE_TEST_GROUPED_INPUT: mode === "default-raw" ? "1" : "0",
                DIALOGFORGE_TEST_FOCUSED_ONLY: mode === "default-raw" ? "1" : "0" }
        });
        const lines = (output.stdout || "").split("\n");
        const measurement = lines.find(line => line.startsWith('{"native":'));
        const rawPrefix = "Actual raw console input measurement: ";
        const raw = lines.find(line => line.startsWith(rawPrefix));
        const log = "output-" + mode + ".log";
        fs.writeFileSync(path.join(stage, log), (output.stdout || "") + (output.stderr || ""));
        const entry = { mode, status: !output.error && output.status === 0 ? "passed" : "failed",
            durationMs: Date.now() - outputStarted,
            measurements: measurement ? JSON.parse(measurement) : null,
            rawInput: raw ? JSON.parse(raw.slice(rawPrefix.length)) : null,
            error: output.error ? String(output.error) : null, log };
        report.outputRuns.push(entry);
        if (entry.status !== "passed") {
            report.status = "failed";
        }
    }
    for (const name of ["scripts/check-paired-ordered-runtime-output.js",
        "scripts/runtime-output-budget-acceptance.js", "scripts/runtime-output-delivery-acceptance.js",
        "dist/src/runtime/providers/r/session/runtimeProcessHost.js",
        "dist/src/runtime/providers/r/session/runtimeProcessController.js",
        "dist/src/runtime/providers/r/controllers/rOrderedOutputDelivery.js"]) {
        fingerprints[name] = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, name))).digest("hex");
    }
}
fs.writeFileSync(path.join(stage, "results.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (report.status !== "passed") {
    process.exitCode = 1;
}
