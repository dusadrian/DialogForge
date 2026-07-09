"use strict";

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

const fail = function(message) {
    throw new Error(message);
};

const licenseReference = "SEE LICENSE IN LICENSE";
const licenseText = "Academic Non-Commercial License (see LICENSE file for details).";
const macCopyright = "© 2025-2026 Adrian Dusa — " + licenseText;

const readJson = function(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

const assertNoDialogForgeProductWorkflows = function() {
    const workflowsDir = path.join(projectRoot, ".github/workflows");
    const files = fs.existsSync(workflowsDir)
        ? fs.readdirSync(workflowsDir)
        : [];
    const forbidden = files.filter((fileName) => {
        return /^build-dialog(?:r|qca)(?:-|\.yml$)/i.test(fileName);
    });

    if (forbidden.length > 0) {
        fail("DialogForge must not own product-named build workflows: " + forbidden.join(", "));
    }
};

const assertDialogForgePublicScripts = function() {
    const packageJson = readJson(path.join(projectRoot, "package.json"));
    const scripts = packageJson.scripts || {};
    const forbidden = Object.keys(scripts).filter((scriptName) => {
        return /^submit:/.test(scriptName)
            || /^staple:/.test(scriptName)
            || /^build:Dialog/.test(scriptName)
            || /^dist:Dialog/.test(scriptName);
    });

    if (forbidden.length > 0) {
        fail("DialogForge package.json exposes product/private release scripts: " + forbidden.join(", "));
    }
};

const assertLicenseMetadata = function() {
    const packageJson = readJson(path.join(projectRoot, "package.json"));
    const build = packageJson.build || {};
    const extraResources = Array.isArray(build.extraResources)
        ? build.extraResources
        : [];
    const mac = build.mac || {};
    const win = build.win || {};
    const extendInfo = mac.extendInfo || {};

    if (packageJson.author !== "Adrian Dusa") {
        fail("package.json must declare Adrian Dusa as author.");
    }
    if (packageJson.contributors) {
        fail("DialogForge package.json must not declare product-organization contributors.");
    }
    if (packageJson.license !== licenseReference) {
        fail("package.json must reference the root LICENSE file.");
    }
    if (!extraResources.includes("LICENSE")) {
        fail("package.json build.extraResources must include LICENSE.");
    }
    if (win.legalTrademarks !== licenseText) {
        fail("package.json build.win.legalTrademarks must describe the license.");
    }
    if (extendInfo.NSHumanReadableCopyright !== macCopyright) {
        fail("package.json build.mac.extendInfo.NSHumanReadableCopyright must describe the license.");
    }
};

const assertSigningBrokerExists = function() {
    const workflowPath = path.join(projectRoot, ".github/workflows/sign-windows-product.yml");
    if (!fs.existsSync(workflowPath)) {
        fail("Missing DialogForge Windows signing broker workflow.");
    }
};

const assertSigningBrokerUsesProductOutput = function() {
    const actionPath = path.join(projectRoot, ".github/actions/package-product/action.yml");
    const actionSource = fs.readFileSync(actionPath, "utf8");
    const packageProductSource = fs.readFileSync(
        path.join(projectRoot, "scripts/package-product.js"),
        "utf8"
    );

    if (!actionSource.includes("files-folder: ${{ github.workspace }}\\external-product\\build\\output")) {
        fail("Windows signing must target the product-owned external-product/build/output directory.");
    }
    if (actionSource.includes("files-folder: ${{ github.workspace }}\\build\\output")) {
        fail("Windows signing must not target DialogForge build/output for product artifacts.");
    }
    if (!actionSource.includes("DIALOGFORGE_RELEASE_REPOSITORY:")
        || !actionSource.includes("DIALOGFORGE_RELEASE_TAG:")
        || !packageProductSource.includes("process.env.DIALOGFORGE_RELEASE_REPOSITORY")
        || !packageProductSource.includes("process.env.DIALOGFORGE_RELEASE_TAG")) {
        fail("Release packaging must configure updater metadata for brokered builds.");
    }
};

const main = function() {
    assertNoDialogForgeProductWorkflows();
    assertDialogForgePublicScripts();
    assertLicenseMetadata();
    assertSigningBrokerExists();
    assertSigningBrokerUsesProductOutput();
    console.log("Build ownership contract passed.");
};

main();
