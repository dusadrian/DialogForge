"use strict";

// Exercise the real private deployment scripts without refreshing libraries or
// allowing sudo, rsync or service changes. Only a generated receipt is moved,
// and it is restored even when a case fails.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { readWebRHelperArtifacts } = require("./web-r-helper-artifacts");

const root = path.resolve(__dirname, "..");
const scripts = process.argv.slice(2);
assert.ok(scripts.length > 0, "Supply the actual product deployment scripts.");
const helper = readWebRHelperArtifacts(root)[0];
for (const script of scripts) {
    assert.ok(path.isAbsolute(script) && path.basename(script) === "deploy-web.sh");
    const output = path.join(path.dirname(path.dirname(script)), "dist/web");
    const receipt = path.join(output, helper.relativePath + ".build.json");
    const heldReceipt = receipt + ".test-held-" + randomUUID();
    const run = function() {
        return spawnSync("bash", ["-c", [
            "npm() { return 0; }",
            "sudo() { echo TEST_STOP_BEFORE_SERVER_MUTATION; return 98; }",
            "export -f npm sudo",
            'exec bash "$1" --config /dev/null --port 5199 --no-build --no-verify'
        ].join("\n"), "deployment-fixture", script], {
            cwd: root,
            env: { ...process.env, DIALOGFORGE_ROOT: root, DIALOGFORGE_SOURCE_ROOT: root },
            encoding: "utf8", timeout: 15000
        });
    };
    const syntax = spawnSync("bash", ["-n", script], { encoding: "utf8" });
    assert.equal(syntax.status, 0, syntax.stderr);
    fs.renameSync(receipt, heldReceipt);
    try {
        const rejected = run();
        assert.equal(rejected.status, 1, rejected.stderr);
        assert.match(rejected.stderr, /Required WebR helper is missing, stale or invalid/);
        assert.ok(!rejected.stdout.includes("TEST_STOP_BEFORE_SERVER_MUTATION"));
    } finally {
        fs.renameSync(heldReceipt, receipt);
    }
    const admitted = run();
    assert.equal(admitted.status, 98, admitted.stderr);
    assert.match(admitted.stdout, /Required WebR helper artifact and build receipt are current/);
    assert.match(admitted.stdout, /TEST_STOP_BEFORE_SERVER_MUTATION/);
    console.log("Deployment preflight rejects missing receipts before server changes: " + script);
}
