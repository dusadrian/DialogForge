"use strict";

const assert = require("node:assert/strict");
const {
    packagedRuntimeDependenciesFor
} = require("../../scripts/packagedRuntimeDependencies");


const expectedNativePackages = [
    ["darwin", "arm64", [
        "@number0/iroh-darwin-universal",
        "@number0/iroh-darwin-arm64"
    ]],
    ["darwin", "x64", ["@number0/iroh-darwin-universal"]],
    ["win32", "x64", ["@number0/iroh-win32-x64-msvc"]],
    ["linux", "x64", [
        "@number0/iroh-linux-x64-gnu",
        "@number0/iroh-linux-x64-musl"
    ]]
];


for (const [platform, arch, expected] of expectedNativePackages) {
    const dependencies = packagedRuntimeDependenciesFor(platform, arch);

    assert.ok(dependencies.includes("@number0/iroh"));
    assert.ok(dependencies.includes("qrcode"));
    assert.ok(dependencies.includes("diceware-wordlist-en-eff"));
    assert.deepEqual(
        dependencies.filter((name) => name.startsWith("@number0/iroh-")),
        expected,
        `${platform}/${arch} native iroh dependency selection`
    );
}

process.stdout.write(
    "live-script native dependency selection for supported package targets: ok\n"
);
