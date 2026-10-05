"use strict";

// Explicit maintainer operation: build and qualify one physical native target.
// Ordinary desktop builds only consume its frozen vendor artifacts.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { bundleNativeRHelperArtifacts } = require("./native-r-helper-artifacts");

const sourceRoot = path.resolve(__dirname, "..");
const runtimeVersion = process.argv[2];
const evidenceRoot = process.argv[3];
const bundleRoot = process.argv[4] ? path.resolve(process.argv[4]) : path.join(sourceRoot, "vendor");
if (!/^\d+\.\d+\.\d+$/.test(runtimeVersion || "") || !evidenceRoot || !path.isAbsolute(evidenceRoot)) {
    throw new Error("Supply the exact R version, an absolute private evidence directory, and optionally a bundle output root.");
}
const r = process.env.DIALOGFORGE_BUILD_R || "R";
const actualVersion = execFileSync(r, ["--vanilla", "--slave", "-e", "cat(as.character(getRversion()))"], {
    encoding: "utf8"
}).trim();
if (actualVersion !== runtimeVersion) {
    throw new Error("Native helper release requires R " + runtimeVersion + ", not " + actualVersion);
}
fs.mkdirSync(evidenceRoot, { recursive: true });
const evidence = fs.mkdtempSync(path.join(evidenceRoot, "helper-release-"));
execFileSync(process.execPath, [path.join(sourceRoot, "scripts/check-native-r-platform.js"), evidence], {
    cwd: sourceRoot, env: process.env, stdio: "inherit"
});
const reports = fs.readdirSync(evidence)
    .filter(name => name.startsWith("native-platform-"))
    .map(name => path.join(evidence, name, "results.json"));
if (reports.length !== 1) {
    throw new Error("Native acceptance did not produce exactly one report for this release build.");
}
bundleNativeRHelperArtifacts(sourceRoot, reports[0], bundleRoot);
fs.copyFileSync(reports[0], path.join(bundleRoot, "native-acceptance.json"));
