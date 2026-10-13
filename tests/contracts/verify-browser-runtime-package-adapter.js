"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const packageAdapter = fs.readFileSync(
    path.join(rootDir, "src/runtime/providers/webr/webRRuntimePackageAdapter.ts"),
    "utf8"
);
const installPlan = fs.readFileSync(path.join(rootDir, "src/runtime/providers/r/dependencies/packageInstallPlan.ts"), "utf8");
const packageRequirements = fs.readFileSync(
    path.join(rootDir, "src/runtime/providers/r/dependencies/runtimePackageRequirements.ts"),
    "utf8"
);
const dialogRBrowserHost = fs.readFileSync(
    path.join(rootDir, "src/shell-web/pages/shell.js"),
    "utf8"
);
const shellWebTsconfig = fs.readFileSync(
    path.join(rootDir, "tsconfig.shell-web.json"),
    "utf8"
);

assert.ok(
    packageAdapter.includes("parseRPackageList")
        && packageAdapter.includes("readRequirements")
        && packageAdapter.includes("loadPackages")
        && packageAdapter.includes("installSessionPackages")
        && packageAdapter.includes("ensureDialogPackages")
        && packageAdapter.includes("readRDialogPackageRequirements")
        && packageAdapter.includes("loadRequiredRPackages")
        && packageAdapter.includes("createRPackageInstallWorkflow")
        && installPlan.includes("createRequiredInstallCommand")
        && packageAdapter.includes("loadPackages: async function(packageNames)")
        && !packageAdapter.includes("runtimeRequirements.rPackages")
        && !packageAdapter.includes("sourceProperties.dependencies"),
    "WebR runtime package adapter must delegate package requirement parsing while keeping install and load orchestration separate"
);
assert.ok(
    packageRequirements.includes("readRDialogPackageRequirements")
        && packageRequirements.includes("createRRuntimePackageStatusCommand")
        && packageRequirements.includes("parseRRuntimePackageStatus")
        && packageRequirements.includes("runtimeRequirements.rPackages")
        && packageRequirements.includes("sourceProperties.dependencies"),
    "R runtime package requirement parsing and status command construction must live in the shared R provider"
);
assert.ok(
    dialogRBrowserHost.includes("/browser-esm/src/runtime/providers/webr/webRRuntimePackageAdapter.js")
        && dialogRBrowserHost.includes("createWebRRuntimePackageAdapter")
        && dialogRBrowserHost.includes("browserRuntimePackages().loadPackages(packages, options)")
        && dialogRBrowserHost.includes("browserRuntimePackages().ensureDialogPackages(dialogPayload)")
        && !dialogRBrowserHost.includes("const readRuntimePackageStatus = async function")
        && !dialogRBrowserHost.includes("const readDialogRuntimePackageRequirements = function"),
    "DialogR browser host must delegate runtime package orchestration to the adapter"
);
assert.ok(
    shellWebTsconfig.includes("src/runtime/providers/webr/webRRuntimePackageAdapter.ts")
        && shellWebTsconfig.includes("src/runtime/providers/r/dependencies/runtimePackageRequirements.ts"),
    "WebR runtime package adapter and shared R package requirements must be included in the browser ESM build"
);

const nativePackages = fs.readFileSync(path.join(rootDir,
    "src/shell-electron/dialog-runtime/productDialogRuntimeComposition.ts"), "utf8");
for (const source of [nativePackages, packageAdapter]) {
    assert.ok(source.includes("prepareRequiredRPackages"),
        "Both hosts must use the same package-version readiness implementation");
    assert.ok(source.includes("createRPackagePreparationController"),
        "Both hosts must share pending preparation and retirement policy");
    assert.ok(!source.includes("resolveRPackageCompatibility"),
        "Host adapters must not independently orchestrate version acceptance");
    assert.ok(source.includes("loadRequiredRPackages"),
        "Both hosts must use the same installed/attached inspection and loading owner");
    assert.ok(!source.includes("parseRRuntimePackageStatus"),
        "Package status parsing must stay in the common loading owner");
}
assert.ok(!packageAdapter.includes("verifiedRequirementSets"),
    "Browser readiness must not reuse successful checks after external package changes");
assert.ok(!nativePackages.includes("dependencyReadiness"),
    "Native composition must not retain its separate pending-preparation owner");

console.log("WebR runtime package adapter verified.");
