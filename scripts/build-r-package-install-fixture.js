"use strict";

// Native source archive and WebR binary from ONE maintained fixture package.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const packageName = process.env.DIALOGFORGE_PACKAGE_FIXTURE_PACKAGE || "DialogForgeInstallFixture";
if (!["DialogForgeInstallFixture", "DialogForgeDependencyFixture", "DialogForgeCacheFixture"].includes(packageName)) {
    throw Error("Unsupported fixture package");
}
const source = path.join(root, "tests/fixtures/r-package-install", packageName);
const output = path.join(root, "dist/package-install-fixture");
fs.mkdirSync(output, { recursive: true });
const staging = fs.mkdtempSync(path.join(output, "source-"));
const version = process.env.DIALOGFORGE_PACKAGE_FIXTURE_VERSION || "0.0.1";
if (!["0.0.1", "0.0.2", "0.0.3"].includes(version)
    || (packageName === "DialogForgeDependencyFixture" && version === "0.0.3")
    || (packageName === "DialogForgeCacheFixture" && version !== "0.0.1")) {
    throw Error("Unsupported fixture version");
}
// Version variants are generated from ONE maintained source, not two packages.
const generatedSource = path.join(staging, packageName);
fs.cpSync(source, generatedSource, { recursive: true });
const descriptionPath = path.join(generatedSource, "DESCRIPTION");
fs.writeFileSync(descriptionPath, fs.readFileSync(descriptionPath, "utf8")
    .replace(/^Version: 0\.0\.1$/m, "Version: " + version));
const dependencyArchive = version === "0.0.3"
    ? path.join(output, "DialogForgeDependencyFixture_0.0.2.tar.gz") : "";
if (dependencyArchive) {
    if (!fs.existsSync(dependencyArchive)) {
        throw Error("Build the canonical dependency0.0.2 fixture first");
    }
    // The dependency variant remains generated from the SAME target source.
    fs.writeFileSync(descriptionPath, fs.readFileSync(descriptionPath, "utf8")
        .replace("A dependency-free package", "A dependency-bearing package")
        + "Imports: DialogForgeDependencyFixture (>= 0.0.2)\n");
    fs.appendFileSync(path.join(generatedSource, "NAMESPACE"),
        "importFrom(DialogForgeDependencyFixture, dependency_value)\n");
}
execFileSync(process.env.DIALOGFORGE_BUILD_R || "R", [
    "CMD", "build", "--no-manual", "--no-build-vignettes", generatedSource
], { cwd: staging, stdio: "inherit" });
const archive = path.join(staging, packageName + "_" + version + ".tar.gz");
fs.copyFileSync(archive, path.join(output, path.basename(archive)));
const native = path.join(output, "native");
const library = path.join(staging, "native-library");
fs.mkdirSync(native, { recursive: true });
fs.mkdirSync(library, { recursive: true });
if (dependencyArchive) {
    execFileSync(process.env.DIALOGFORGE_BUILD_R || "R", [
        "CMD", "INSTALL", "--library=" + library, dependencyArchive
    ], { cwd: staging, stdio: "inherit" });
}
execFileSync(process.env.DIALOGFORGE_BUILD_R || "R", [
    "CMD", "INSTALL", "--build", "--no-test-load", "--library=" + library, archive
], { cwd: native, stdio: "inherit", env: { ...process.env, R_LIBS: library } });
execFileSync("docker", [
    "run", "--rm", "--network", "none", "--platform", "linux/amd64",
    "--mount", `type=bind,src=${root},dst=/source,readonly`,
    "--mount", `type=bind,src=${output},dst=/output`,
    process.env.DIALOGFORGE_WEBR_BUILD_IMAGE || "ghcr.io/r-wasm/webr:v0.6.0",
    "Rscript", "/source/scripts/build-r-helper-webr.R",
    `/output/${path.basename(staging)}/${path.basename(archive)}`, packageName,
    ...(dependencyArchive ? ["/output/" + path.basename(dependencyArchive)] : [])
], { stdio: "inherit" });
console.log("Disposable package archives built from the same fixture source.");
