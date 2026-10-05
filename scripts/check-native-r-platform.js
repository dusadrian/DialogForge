"use strict";

// Offline native ABI check. All behavior cases and helper sources are canonical,
// not copies or an alternative platform runtime. No product UI is launched.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const output = process.argv[2];
if (!output || !path.isAbsolute(output) || path.resolve(output) === root) {
    throw Error("Supply a private absolute output directory outside the checkout.");
}
fs.mkdirSync(output, { recursive: true });
const directory = fs.mkdtempSync(path.join(output, "native-platform-"));
const library = path.join(directory, "library");
fs.mkdirSync(library);
const r = process.env.DIALOGFORGE_BUILD_R || "R";
const report = { startedAt: new Date().toISOString(), root,
    scope: "Native R ABI/shared-source cases, not product UI or release acceptance",
    directory, identity: null, fingerprints: {}, builds: [], results: [], error: null };
let sequence = 0;
const env = { ...process.env, R_PROFILE_USER: "/dev/null", R_ENVIRON_USER: "/dev/null",
    R_LIBS_USER: library, DIALOGFORGE_TEST_INSPECTION_LIBRARY: library,
    DIALOGFORGE_TRANSPORT_LIBRARY: library, DIALOGFORGE_OUTPUT_LIBRARY: library };
const fingerprint = function(relative) {
    report.fingerprints[relative] = crypto.createHash("sha256")
        .update(fs.readFileSync(path.join(root, relative))).digest("hex");
};
const run = function(label, arguments_, options = {}) {
    const started = Date.now();
    const result = spawnSync(r, arguments_, {
        cwd: options.cwd || root, env: { ...env, ...options.env },
        encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024
    });
    const log = `${++sequence}-${label.replace(/[^a-zA-Z0-9_.-]/g, "_")}.log`;
    fs.writeFileSync(path.join(directory, log), (result.stdout || "") + (result.stderr || ""));
    const entry = { name: label, status: result.status === 0 ? "passed" : "failed",
        durationMs: Date.now() - started, exitCode: result.status, signal: result.signal,
        error: result.error ? String(result.error) : null, log };
    console.log(`${entry.status}: ${label} (${entry.durationMs}ms)`);
    return { entry, stdout: result.stdout || "" };
};
const build = function(packageName, sourceInput) {
    const relative = `src/runtime/providers/r/native/${packageName}`;
    const source = sourceInput || path.join(root, relative);
    const version = fs.readFileSync(path.join(source, "DESCRIPTION"), "utf8")
        .match(/^Version:\s*(\S+)$/m)[1];
    for (const section of ["src", "R", ""]) {
        const sectionPath = path.join(source, section);
        if (!fs.existsSync(sectionPath)) {
            continue;
        }
        for (const file of fs.readdirSync(sectionPath)) {
            if (/\.(c|h|R)$/.test(file) || ["DESCRIPTION", "NAMESPACE"].includes(file)) {
                const fullPath = path.join(sectionPath, file);
                const key = sourceInput ? "external-declared/" + path.join(section, file)
                    : path.join(relative, section, file);
                report.fingerprints[key] = crypto.createHash("sha256")
                    .update(fs.readFileSync(fullPath)).digest("hex");
            }
        }
    }
    const archive = path.join(directory, `${packageName}_${version}.tar.gz`);
    for (const [label, arguments_] of [
        ["build-" + packageName, ["CMD", "build", "--no-manual", "--no-build-vignettes", source]],
        ["install-" + packageName, ["CMD", "INSTALL", "--no-test-load", "--library=" + library, archive]]
    ]) {
        const result = run(label, arguments_, { cwd: directory });
        report.builds.push(result.entry);
        if (result.entry.status !== "passed") {
            throw Error("Native helper build failed: " + packageName);
        }
    }
};

try {
    fingerprint("scripts/check-native-r-platform.js");
    const identity = run("native-identity", ["--vanilla", "--slave", "-e",
        'cat(R.version.string, "\\n", R.version$platform, "\\n", Sys.getlocale(), "\\n"); cat("utf8=", isTRUE(l10n_info()$`UTF-8`), "\\n"); cat("declared=", requireNamespace("declared", quietly=TRUE), "\\n")']);
    if (identity.entry.status !== "passed") {
        throw Error("Native R identity query failed");
    }
    report.identity = identity.stdout.trim();
    if (!/utf8= TRUE/.test(identity.stdout)) {
        throw Error("Use the production launcher's UTF-8 locale prerequisite for native console cases");
    }
    if (process.env.DIALOGFORGE_TEST_DECLARED_SOURCE) {
        build("declared", process.env.DIALOGFORGE_TEST_DECLARED_SOURCE);
    }
    const declared = run("declared-identity", ["--vanilla", "--slave", "-e",
        'if (requireNamespace("declared", quietly=TRUE)) cat("declared=", as.character(packageVersion("declared")), "\\n")']);
    report.declaredIdentity = declared.stdout.trim();
    const hasDeclared = declared.entry.status === "passed" && /declared= /.test(declared.stdout);
    build("dialogforgeruntime");
    const probe = "src/runtime/providers/r/native/dialogforgeruntime/tests/altrepprobe.c";
    fingerprint(probe);
    fs.copyFileSync(path.join(root, probe), path.join(directory, "altrepprobe.c"));
    const probeBuild = run("build-altrep-probe", ["CMD", "SHLIB", "altrepprobe.c"], { cwd: directory });
    report.builds.push(probeBuild.entry);
    if (probeBuild.entry.status !== "passed") {
        throw Error("Native ALTREP fixture build failed");
    }
    env.DIALOGFORGE_ALTREP_PROBE_DLL = path.join(directory,
        process.platform === "win32" ? "altrepprobe.dll" : "altrepprobe.so");
    const scripts = fs.readdirSync(path.join(root, "scripts"))
        .filter(name => /^check-.*\.R$/.test(name)).sort();
    for (const script of scripts) {
        fingerprint("scripts/" + script);
        if (script === "check-variable-decimal-preservation.R" && !hasDeclared) {
            report.results.push({ name: script, status: "prerequisite-unavailable",
                reason: "Offline native image has no declared package; this required case is not passed" });
            continue;
        }
        const result = run(script, ["--vanilla", "--slave", "--file=" + path.join(root, "scripts", script)]);
        report.results.push(result.entry);
    }
    const sources = "src/runtime/providers/r/r-sources";
    for (const name of fs.readdirSync(path.join(root, sources)).filter(name => /\.R$/.test(name))) {
        fingerprint(sources + "/" + name);
    }
    fingerprint("scripts/build-r-control-cache.R");
    const cachePath = path.join(directory, "runtime-control-cache.rds");
    const cache = run("build-common-bytecode", ["--vanilla", "--slave",
        "--file=" + path.join(root, "scripts/build-r-control-cache.R"), "--args", path.join(root, sources), cachePath]);
    report.builds.push(cache.entry);
    if (cache.entry.status !== "passed") {
        throw Error("Native bytecode fixture build failed");
    }
    report.results.push(run("check-runtime-startup-compilation-cached", ["--vanilla", "--slave",
        "--file=" + path.join(root, "scripts/check-runtime-startup-compilation.R")], {
        env: { DIALOGFORGE_TEST_CONTROL_CACHE: "1", DIALOGFORGE_TEST_CONTROL_CACHE_PATH: cachePath }
    }).entry);
    report.declaredBranchesAvailable = hasDeclared;
} catch (error) {
    report.error = String(error);
} finally {
    report.finishedAt = new Date().toISOString();
    const failed = report.error || [...report.builds, ...report.results].some(entry => entry.status === "failed");
    report.status = failed ? "failed" : report.results.some(entry => entry.status === "prerequisite-unavailable")
        ? "partial-prerequisite" : "passed";
    fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(report, null, 2));
    console.log("Native evidence: " + path.join(directory, "results.json"));
    if (failed) {
        process.exitCode = 1;
    }
}
