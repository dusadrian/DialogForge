"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "src/runtime/providers/r/native/dialogforgeruntime");
const output = path.join(root, "dist/r-runtime");
const target = process.argv[2] || "native";
if (!["native", "webr", "both"].includes(target)) {
    throw new Error("Choose native, webr, or both.");
}
const r = process.env.DIALOGFORGE_BUILD_R || "R";
const version = fs.readFileSync(path.join(source, "DESCRIPTION"), "utf8")
    .match(/^Version:\s*(\S+)$/m)[1];
fs.mkdirSync(output, { recursive: true });
const staging = fs.mkdtempSync(path.join(output, "source-"));
execFileSync(r, ["CMD", "build", "--no-manual", "--no-build-vignettes", source], {
    cwd: staging,
    stdio: "inherit"
});
const archive = path.join(staging, `dialogforgeruntime_${version}.tar.gz`);

if (target === "native" || target === "both") {
    const runtime = execFileSync(r, ["--vanilla", "--slave", "-e",
        'cat(paste(R.version$platform, getRversion(), sep = "-"))'
    ], { encoding: "utf8" }).trim();
    if (!/^[a-zA-Z0-9_.-]+$/.test(runtime)) {
        throw new Error("Unexpected native R build identity.");
    }
    const library = path.join(output, "native", runtime);
    fs.mkdirSync(library, { recursive: true });
    execFileSync(r, ["CMD", "INSTALL", "--no-test-load", `--library=${library}`, archive], {
        stdio: "inherit"
    });
    console.log(`Native helper library: ${library}`);
}

if (target === "webr" || target === "both") {
    const image = process.env.DIALOGFORGE_WEBR_BUILD_IMAGE || "ghcr.io/r-wasm/webr:v0.6.0";
    execFileSync("docker", [
        "run", "--rm", "--network", "none", "--platform", "linux/amd64",
        "--mount", `type=bind,src=${root},dst=/source,readonly`,
        "--mount", `type=bind,src=${output},dst=/output`,
        image, "Rscript", "/source/scripts/build-r-helper-webr.R",
        `/output/${path.basename(staging)}/${path.basename(archive)}`, "dialogforgeruntime"
    ], { stdio: "inherit" });
}
