"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const path = require("path");
const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");
const fs = require("fs");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const { verifierGroups } = require("../run-verifier-group.js");
const scripts = packageJson.scripts || {};
const groupScripts = [
    "verify:engine"
];
const groupNames = [
    "engine-contract"
];
const assertPackageScriptExists = function (scriptName) {
    assert.ok(Object.prototype.hasOwnProperty.call(scripts, scriptName), "Expected package script " + scriptName + " to exist.");
};
const verifyTopLevelScripts = function () {
    assert.strictEqual(scripts.verify, "npm run verify:engine");

    groupScripts.forEach((scriptName, index) => {
        assertPackageScriptExists(scriptName);
    });

    assert.strictEqual(scripts["verify:engine"], "npm run build && node -r ./tests/register-dist-require.js tests/run-verifier-group.js engine-contract");
    assert.strictEqual(scripts["verify:dialogforge-contract"], "npm run verify:engine");
    assert.strictEqual(scripts["verify:all"], "npm run verify:engine");
};
const verifyGroupMembers = function () {
    groupNames.forEach((groupName) => {
        const members = verifierGroups[groupName];

        assert.ok(members, "Expected verifier group " + groupName + " to be declared.");
        assert.ok(members.length > 0, "Expected " + groupName + " to contain verifier scripts.");
        members.forEach((scriptName) => {
            assertPackageScriptExists(scriptName);
        });
    });
};
const verifyWorkflowCoverage = function () {
    const engineScripts = verifierGroups["engine-contract"];

    const excludedScripts = [
        "verify:composition",
        "verify:legacy-menu-parity",
        "verify:product-assets",
        "verify:product-dialog-sources",
        "verify:product-i18n",
        "verify:product-parity-completion",
        "verify:dialogr-parity-ledger",
        "verify:runtime-session"
    ];

    excludedScripts.forEach((scriptName) => {
        assert.ok(!engineScripts.includes(scriptName), "Expected engine-contract to exclude " + scriptName + ".");
    });

    excludedScripts.filter((scriptName) => {
        return scriptName !== "verify:runtime-session";
    }).forEach((scriptName) => {
        assert.ok(!Object.prototype.hasOwnProperty.call(scripts, scriptName), "Expected package scripts to remove " + scriptName + ".");
    });
};
verifyTopLevelScripts();
verifyGroupMembers();
verifyWorkflowCoverage();
