"use strict";

// Artifact contract fixtures only: fake payload bytes cannot establish native
// ABI, Electron UI or release acceptance. Run this script only when authorized.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fileSha256, readArtifactFileHashes } = require("./r-helper-artifact-files");
const { hashUnsignedMacHelper } = require("./mac-r-helper-code-signature");
const {
    bundleNativeRHelperArtifacts, prepareNativeRHelperArtifacts, assertNativeRHelperArtifacts,
    importNativeRHelperArtifacts
} = require("./native-r-helper-artifacts");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-native-artifact-cases-"));
const write = function(relative, bytes) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return file;
};
const helper = "src/runtime/providers/r/native/dialogforgeruntime";
write(helper + "/DESCRIPTION", "Package: dialogforgeruntime\nVersion: 0.1.0\n");
write(helper + "/src/helper.c", "/* Canonical fixture */\n");
write(helper + "/R/helper.R", "# Canonical fixture\n");
write("scripts/check-r-runtime-helper.R", "# Native acceptance fixture\n");
write("scripts/check-native-r-platform.js", "// Native runner fixture\n");
write("src/runtime/providers/r/r-sources/runtimePrelude.R", "# Shared runtime fixture\n");
const reportPath = path.join(root, "evidence/results.json");
const installed = "evidence/library/dialogforgeruntime";
write(installed + "/DESCRIPTION", "Package: dialogforgeruntime\nVersion: 0.1.0\n"
    + "Built: R 4.6.1; aarch64-apple-darwin23; fixture; unix\n");
write(installed + "/libs/dialogforgeruntime.so", "Fake binary fixture, not ABI evidence");
const report = {
    status: "passed", error: null, declaredBranchesAvailable: true,
    identity: "R version 4.6.1\naarch64-apple-darwin23",
    finishedAt: "2026-10-04T00:00:00Z",
    builds: [{ name: "install-dialogforgeruntime", status: "passed", exitCode: 0 }],
    results: ["check-r-runtime-helper.R", "check-runtime-startup-compilation-cached"]
        .map(name => ({ name, status: "passed", exitCode: 0 })),
    helperFiles: readArtifactFileHashes(path.join(root, installed)),
    fingerprints: {}
};
for (const relative of [helper + "/DESCRIPTION", helper + "/src/helper.c", helper + "/R/helper.R",
    "scripts/check-r-runtime-helper.R", "scripts/check-native-r-platform.js",
    "src/runtime/providers/r/r-sources/runtimePrelude.R"]) {
    report.fingerprints[relative] = fileSha256(path.join(root, relative));
}
const saveReport = function() { write("evidence/results.json", JSON.stringify(report)); };
saveReport();
assert.throws(() => prepareNativeRHelperArtifacts(root, path.join(root, "dist")), /missing/);
report.status = "partial-prerequisite";
saveReport();
assert.throws(() => bundleNativeRHelperArtifacts(root, reportPath), /fully passed/);
report.status = "passed";
const originalFiles = report.helperFiles;
delete report.helperFiles;
saveReport();
assert.throws(() => bundleNativeRHelperArtifacts(root, reportPath), /payload fingerprints/);
report.helperFiles = originalFiles;
saveReport();
bundleNativeRHelperArtifacts(root, reportPath);
assert.throws(() => bundleNativeRHelperArtifacts(root, reportPath), /already exists/);
const imported = path.join(root, "reviewed-native-artifact");
fs.cpSync(path.join(root, "vendor/r-runtime/native"), imported, { recursive: true });
importNativeRHelperArtifacts(root, imported);
assert.throws(() => importNativeRHelperArtifacts(root, path.join(root, "vendor/r-runtime/native")), /destination itself/);
const output = path.join(root, "dist");
write("dist/r-runtime/native/unlisted-old-R/dialogforgeruntime/libs/stale.so", "Unpinned cache");
prepareNativeRHelperArtifacts(root, output);
assert.ok(!fs.existsSync(path.join(output, "r-runtime/native/unlisted-old-R")));
assertNativeRHelperArtifacts(root, output, "macos", "arm64");
for (const [platform, arch] of [["macos", "x64"], ["windows", "x64"], ["linux", "x64"]]) {
    assert.throws(() => assertNativeRHelperArtifacts(root, output, platform, arch), /No verified native helper/);
}
const target = "r-runtime/native/aarch64-apple-darwin23-4.6.1";
const stagedBinary = write("dist/" + target + "/dialogforgeruntime/libs/dialogforgeruntime.so", "Corrupt bytes");
assert.throws(() => assertNativeRHelperArtifacts(root, output), /checksums/);
prepareNativeRHelperArtifacts(root, output);
assert.equal(fs.readFileSync(stagedBinary, "utf8"), "Fake binary fixture, not ABI evidence");
const suppliedBinary = path.join(root, "vendor", target, "dialogforgeruntime/libs/dialogforgeruntime.so");
const pinned = fs.readFileSync(suppliedBinary);
fs.writeFileSync(suppliedBinary, "Corrupt supplied bytes");
assert.throws(() => prepareNativeRHelperArtifacts(root, output), /checksums/);
fs.writeFileSync(suppliedBinary, pinned);
const receiptPath = path.join(root, "vendor", target, "dialogforgeruntime.build.json");
const receipt = fs.readFileSync(receiptPath);
fs.writeFileSync(receiptPath, "{}");
assert.throws(() => prepareNativeRHelperArtifacts(root, output), /release pin/);
fs.writeFileSync(receiptPath, receipt);
write(helper + "/src/helper.c", "/* New unqualified source */\n");
assert.throws(() => prepareNativeRHelperArtifacts(root, output), /stale/);
assert.throws(() => bundleNativeRHelperArtifacts(root, reportPath), /current source/);

// Narrow Mac signature-normalization fixtures. Only the allocation-size field
// retained by Apple's signature removal may differ; code and linkage may not.
const macho = Buffer.alloc(128);
macho.writeUInt32LE(0xfeedfacf, 0);
macho.writeUInt32LE(1, 16);
macho.writeUInt32LE(72, 20);
macho.writeUInt32LE(0x19, 32);
macho.writeUInt32LE(72, 36);
macho.write("__LINKEDIT", 40, "ascii");
macho.writeBigUInt64LE(16384n, 64);
const resigned = Buffer.from(macho);
resigned.writeBigUInt64LE(32768n, 64);
assert.equal(hashUnsignedMacHelper(macho), hashUnsignedMacHelper(resigned));
resigned[120] = 1;
assert.notEqual(hashUnsignedMacHelper(macho), hashUnsignedMacHelper(resigned));
resigned[120] = 0;
resigned[72] = 1;
assert.notEqual(hashUnsignedMacHelper(macho), hashUnsignedMacHelper(resigned));
resigned.writeUInt32LE(0x1d, 32);
assert.throws(() => hashUnsignedMacHelper(resigned), /signature remaining/);
assert.throws(() => hashUnsignedMacHelper(Buffer.alloc(20)), /64-bit native Mac/);
console.log("Native helper artifact fixtures passed; these are not native ABI or rendered acceptance.");
console.log("Retained fixtures: " + root);
