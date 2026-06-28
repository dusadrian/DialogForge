"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    generateCoreSdk
} = require("../../scripts/generate-core-sdk");


const rootDir = process.cwd();
const read = function(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
};
const readJson = function(relativePath) {
    return JSON.parse(read(relativePath));
};


generateCoreSdk();


const sourceProductContract = read("shared/core/contracts/productContribution.ts");
const contractMatch = sourceProductContract.match(
    /PRODUCT_CONTRIBUTION_CONTRACT_VERSION\s*=\s*(\d+)/
);
assert.ok(
    contractMatch,
    "source product contract must declare a numeric version"
);

const expectedVersion = Number(contractMatch[1]);
const rootPackage = readJson("package.json");
const sdkPackage = readJson("dist/sdk/core/package.json");
const sdkDeclaration = read("dist/sdk/core/index.d.ts");
const sdkRuntime = require("../../dist/sdk/core");
const stagedRuntimeSdkPackage = readJson(
    "dist/node_modules/@dialogforge/core/package.json"
);
const stagedRuntimeSdk = require("../../dist/node_modules/@dialogforge/core");


assert.deepEqual(
    {
        name: sdkPackage.name,
        version: sdkPackage.version,
        main: sdkPackage.main,
        types: sdkPackage.types
    },
    {
        name: "@dialogforge/core",
        version: rootPackage.version,
        main: "index.js",
        types: "index.d.ts"
    },
    "core SDK package metadata must match the DialogForge product contract"
);
assert.strictEqual(
    sdkRuntime.PRODUCT_CONTRIBUTION_CONTRACT_VERSION,
    expectedVersion,
    "core SDK runtime constant must match the source product contract version"
);
assert.deepEqual(
    {
        name: stagedRuntimeSdkPackage.name,
        version: stagedRuntimeSdkPackage.version,
        main: stagedRuntimeSdkPackage.main,
        types: stagedRuntimeSdkPackage.types
    },
    {
        name: "@dialogforge/core",
        version: rootPackage.version,
        main: "index.js",
        types: "index.d.ts"
    },
    "core SDK must also be staged as a runtime-resolvable package"
);
assert.strictEqual(
    stagedRuntimeSdk.PRODUCT_CONTRIBUTION_CONTRACT_VERSION,
    expectedVersion,
    "runtime-staged core SDK constant must match the source product contract version"
);
[
    `export declare const PRODUCT_CONTRIBUTION_CONTRACT_VERSION: ${String(expectedVersion)};`,
    "export interface DialogExternalCallHost",
    "export interface RuntimeExtensionMethodRequest",
    "export interface RuntimeExtensionMethodResult",
    "export interface ProductContributionContext",
    "export interface ProductContribution",
    "executeRuntimeMethod(",
    "createDialogExternalCallHosts(",
    "readConsoleStateChips?("
].forEach((expected) => {
    assert.ok(
        sdkDeclaration.includes(expected),
        "core SDK declaration is missing: " + expected
    );
});
