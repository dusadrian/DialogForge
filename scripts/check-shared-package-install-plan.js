"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    createRequiredInstallCommand,
    createRUniverseInstallCommand,
    selectRDevelopmentPackages,
    normalizeRInstallationPackageNames
} = require("../dist/src/runtime/providers/r/dependencies/packageInstallPlan");
const { createRRuntimeLoadedPackageCommand } = require("../dist/src/runtime/providers/r/dependencies/runtimePackageRequirements");

assert.equal(createRRuntimeLoadedPackageCommand([]), "");
const loadedCommand = createRRuntimeLoadedPackageCommand(["declared", "declared", " admisc "]);
assert.ok(loadedCommand.includes('base::c("declared", "admisc")'));
assert.ok(loadedCommand.includes("base::loadedNamespaces()"));
assert.ok(loadedCommand.includes("base::search()"));

for (const host of ["r", "webr"]) {
    assert.deepEqual(selectRDevelopmentPackages("declared;QCA,venn\nbase"), ["declared", "QCA", "venn"].sort((a, b) => a.localeCompare(b)), host);
    assert.deepEqual(selectRDevelopmentPackages(["declared", "QCA", "base"], {
        cran: ["declared"], runiverse: ["QCA"], both: ["base"]
    }), ["base", "QCA"]);
    assert.deepEqual(normalizeRInstallationPackageNames([" declared ", "declared", "base"]), ["base", "declared"]);
    const command = createRequiredInstallCommand(["declared", "declared", " admisc "], {
        dependencies: host === "r"
    });

    assert.match(command, /c\("declared", "admisc"\)/);
    assert.match(command, /repos = c\("https:\/\/dusadrian.r-universe.dev", "https:\/\/cloud.r-project.org"\)/);
    assert.equal(command.includes(".packages, dependencies = TRUE"), host === "r");
    assert.ok(command.includes("dependencies = FALSE"));
    assert.equal(createRequiredInstallCommand([], { libraryPath: "/unused" }), "");
}

const libraryPath = '/tmp/library "quoted"';
const localInstall = createRequiredInstallCommand(["declared"], { libraryPath });
assert.ok(localInstall.includes("lib = .stage"));
assert.ok(localInstall.startsWith(`dir.create(${JSON.stringify(libraryPath)}`));
assert.ok(localInstall.includes(".libPaths(unique(c("));
assert.ok(localInstall.includes(`.library <- ${JSON.stringify(libraryPath)}`));
assert.ok(localInstall.includes("dir.exists(.library)"));
assert.ok(localInstall.includes("file.access(.library, 2L)"));
assert.ok(localInstall.includes("Selected R package library is not a writable directory."));
assert.ok(localInstall.includes("base::file.create(.write_probe)"));
assert.ok(localInstall.includes("base::unlink(.write_probe)"));
assert.ok(localInstall.indexOf("base::file.create(.write_probe)") < localInstall.indexOf(".libPaths(unique(c("));
assert.ok(localInstall.indexOf("base::unlink(.write_probe)") < localInstall.indexOf("utils::available.packages("));
assert.ok(localInstall.includes("dependencies = TRUE"));
const update = createRUniverseInstallCommand(["declared"], { libraryPath });
assert.ok(update.includes("lib = .stage"));
assert.ok(!update.includes("dependencies = TRUE"));
assert.ok(!update.includes("cloud.r-project.org"));
assert.ok(update.includes("Selected R package library is not a writable directory."));
assert.ok(update.includes("ignore_repo_cache = TRUE"));
assert.ok(update.includes("lib.loc = .stage"));
assert.ok(update.includes("Package installation did not produce repository version:"));
assert.ok(update.includes(".transport$install("));
assert.ok(update.includes("base::loadedNamespaces()"));
assert.ok(update.includes("Restart R before installing loaded packages:"));
assert.ok(update.includes('utils::getFromNamespace("getDependencies", "utils")'));
assert.ok(update.includes("for (.package in .install_packages)"));
assert.ok(update.includes(".transport$install(.install_packages, .stage, .available)"));
assert.ok(update.includes(".dialogforge-package-stage-"));
assert.ok(update.includes(".libPaths(.library_paths)"));
assert.ok(update.includes("Package rollback needs recovery from:"));
assert.ok(update.indexOf("Package installation did not produce repository version:")
    < update.indexOf("Unable to publish the installed R package:"));
assert.ok(update.indexOf(".backed_up <- c(.backed_up, .package)")
    < update.indexOf(".promoted <- c(.promoted, .package)"));
assert.ok(update.indexOf("intersect(.install_packages, base::loadedNamespaces())")
    < update.indexOf(".transport$install("));
const extractionAdapter = fs.readFileSync(path.join(__dirname,
    "../src/runtime/providers/webr/webRBootstrap.ts"), "utf8");
assert.ok(!extractionAdapter.includes("webr::install(dependencies"));
assert.ok(extractionAdapter.includes("webr:::install_tgz("));

const sharedWorkflow = fs.readFileSync(path.join(
    __dirname, "../src/runtime/providers/r/dependencies/packageInstallWorkflow.ts"
), "utf8");
const browserAdapter = fs.readFileSync(path.join(
    __dirname, "../src/runtime/providers/webr/webRRuntimePackageAdapter.ts"
), "utf8");
assert.ok(sharedWorkflow.includes("createRequiredInstallCommand("));
assert.ok(browserAdapter.includes("createRPackageInstallWorkflow("));
assert.ok(browserAdapter.includes('from "../r/dependencies/packageInstallWorkflow"'));
assert.ok(!browserAdapter.includes("createRequiredInstallCommand("),
    "The browser adapter delegates the workflow, not a second command-building path.");
assert.ok(!browserAdapter.includes("createWebRRequiredInstallCommand"));

console.log("Shared package install command cases passed; real installation acceptance remains open.");
