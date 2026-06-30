"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createRRuntimeLaunchPlan, listMissingRuntimeSourceFiles, normalizeRRuntimeLocaleEnvironment, requiredRuntimeSourceFileNames, resolveRuntimeSourceDir } = require("../../shared/runtime/providers/r/session/runtimeLaunchPlan");
const createRuntimeSourceFixture = function () {
    const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-r-runtime-fixture-"));
    requiredRuntimeSourceFileNames.forEach((fileName) => {
        fs.writeFileSync(path.join(dirPath, fileName), "# fixture\n", "utf8");
    });
    return dirPath;
};
const verifyExplicitLaunchPlan = function () {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-root-fixture-"));
    const runtimeSourceDir = createRuntimeSourceFixture();
    const plan = createRRuntimeLaunchPlan({
        rootDir,
        runtimeSourceDir,
        profileRuntimeControlPath: "/tmp/profile-runtime-control.R",
        sessionKind: "dedicated",
        platform: "darwin",
        env: {
            R_BINARY: "/usr/local/bin/R"
        }
    });
    assert.strictEqual(plan.command, "/usr/local/bin/R");
    assert.deepStrictEqual(plan.args, [
        "--quiet",
        "--no-save",
        "--no-echo",
        "-f",
        path.join(runtimeSourceDir, "runtimeControlLauncher.R")
    ]);
    assert.strictEqual(plan.cwd, rootDir);
    assert.strictEqual(plan.runtimeSourceDir, runtimeSourceDir);
    assert.strictEqual(plan.env.DM_RUNTIME_R_DIR, runtimeSourceDir);
    assert.strictEqual(plan.env.DM_PROFILE_RUNTIME_CONTROL_PATH, "/tmp/profile-runtime-control.R");
    assert.strictEqual(plan.env.DM_RUNTIME_CONTROL_SESSION_KIND, "dedicated");
    assert.strictEqual(plan.env.DM_RUNTIME_CONTROL_MAX_PAYLOAD, "262144");
    assert.strictEqual(plan.env.LC_CTYPE, "en_US.UTF-8");
    assert.strictEqual(plan.env.LANG, "en_US.UTF-8");
    assert.ok(Number(plan.env.DM_RUNTIME_CONTROL_PORT) >= 20000);
    assert.ok(plan.env.DM_RUNTIME_CONTROL_TOKEN.length > 0);
    assert.ok(plan.metaPath.endsWith("runtime-control-meta.json"));
    assert.ok(plan.eventsPath.endsWith("runtime-events.jsonl"));
    assert.ok(plan.tracePath.endsWith("runtime-control-trace.log"));
    assert.deepStrictEqual(listMissingRuntimeSourceFiles(runtimeSourceDir), []);
};
const verifyRuntimeLocaleEnvironment = function () {
    const normalized = normalizeRRuntimeLocaleEnvironment({
        LANG: "C",
        LC_ALL: "C",
        LC_CTYPE: "C"
    }, "darwin");
    assert.strictEqual(normalized.LC_ALL, undefined);
    assert.strictEqual(normalized.LC_CTYPE, "en_US.UTF-8");
    assert.strictEqual(normalized.LANG, "en_US.UTF-8");
    const preserved = normalizeRRuntimeLocaleEnvironment({
        LANG: "ro_RO.UTF-8",
        LC_ALL: "ro_RO.UTF-8",
        LC_CTYPE: "ro_RO.UTF-8"
    }, "darwin");
    assert.strictEqual(preserved.LC_ALL, "ro_RO.UTF-8");
    assert.strictEqual(preserved.LC_CTYPE, "ro_RO.UTF-8");
    assert.strictEqual(preserved.LANG, "ro_RO.UTF-8");
};
const verifyDefaultRuntimeSourceResolution = function () {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-source-root-"));
    const sourceDir = path.join(rootDir, "shared", "runtime", "providers", "r", "r-sources");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "runtimeControlLauncher.R"), "# fixture\n", "utf8");
    assert.strictEqual(resolveRuntimeSourceDir(rootDir), sourceDir);
};
verifyExplicitLaunchPlan();
verifyRuntimeLocaleEnvironment();
verifyDefaultRuntimeSourceResolution();
console.log("R runtime launch plan contract verified.");
