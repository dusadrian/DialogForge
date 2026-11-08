"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");


const rootDir = process.cwd();
const read = function(filePath) {
    return fs.readFileSync(filePath, "utf8");
};
const packageJson = require(path.join(rootDir, "package.json"));
const copyStatic = read(path.join(rootDir, "scripts/copy-static.js"));
const packageProduct = read(path.join(rootDir, "scripts/package-product.js"));
const packageProductAction = read(path.join(
    rootDir,
    ".github/actions/package-product/action.yml"
));
const packagedDependencies = read(
    path.join(rootDir, "scripts/packagedRuntimeDependencies.js")
);


const assertPackagedSmokeJob = function(workflowPath, jobName, command) {
    const workflow = yaml.load(read(workflowPath));
    const steps = workflow.jobs[jobName]?.steps || [];
    const matchingSteps = steps.filter((step) => {
        const run = String(step.run || "").trim();

        return step["working-directory"] === "DialogForge" && (
            run === command || run === `xvfb-run -a ${command}`
        );
    });

    assert.strictEqual(
        matchingSteps.length,
        1,
        `${workflowPath} job ${jobName} must run the expected packaged smoke suite.`
    );
};


[
    "dompurify",
    "marked",
    "monaco-editor",
    "preact",
    "sortablejs"
].forEach((packageName) => {
    assert.ok(
        packagedDependencies.includes(`"${packageName}"`),
        `${packageName} must be staged for packaged desktop products.`
    );
});

assert.ok(
    packageJson.scripts.build.includes("node scripts/copy-static.js")
        && packageJson.scripts["build:web"] === "node scripts/build-web.js"
        && copyStatic.includes("includeWebRuntime")
        && copyStatic.includes('"!src/shell-web/**/*"')
        && copyStatic.includes('"!src/runtime/providers/server-r/**/*"')
        && copyStatic.includes('"!src/runtime/providers/webr/**/*"'),
    "Desktop packaging must remain isolated from browser-host runtime assets."
);
assert.ok(
    packageProduct.includes("validateI18nDirectory")
        && packageProduct.includes("validateDialogRegistry")
        && packageProduct.includes("`--config.electronVersion=${electronVersion}`")
        && packageProduct.includes("`--config.directories.output=${outputDir}`")
        && packageProduct.includes(
            "`--config.linux.artifactName=${fileName}_intel.AppImage`"
        )
        && packageProduct.includes(
            "`--config.nsis.artifactName=${fileName}_setup_intel.exe`"
        )
        && packageProduct.includes(
            "`--config.portable.artifactName=${fileName}_intel.exe`"
        ),
    "Shared packaging must validate product contributions and preserve artifact contracts."
);
assert.deepEqual(packageJson.build.win.target, ["nsis", "portable"]);
assert.ok(
    packageProductAction.includes("DIALOGFORGE_ROOT: ${{ github.workspace }}"),
    "Brokered product checks must receive the checked-out DialogForge root."
);
assert.ok(
    packageProductAction.includes("Verify packaged Script Editor and Live Script")
        && packageProductAction.includes(
            "verify-production-electron.js --product-path ./external-product "
            + "--output-dir ./external-product/build/output --target script-editor"
        ),
    "Brokered builds must exercise Live Script from the packaged application."
);

for (const productName of ["DialogR", "DialogQCA"]) {
    const productRoot = path.resolve(rootDir, "..", productName);
    const productPackage = require(path.join(productRoot, "package.json"));
    const buildProduct = read(path.join(productRoot, "scripts/build-product.js"));
    const workflowRoot = path.join(productRoot, ".github", "workflows");

    assert.strictEqual(productPackage.scripts.build, "node scripts/build-product.js");
    assert.strictEqual(
        productPackage.scripts.check,
        "node scripts/check-build-ownership.js && node scripts/check-product.js"
    );
    assert.deepEqual(productPackage.product.releaseTags, {
        linuxIntel: "latest",
        windowsIntel: "latest",
        macosIntel: "latest",
        macosSilicon: "latest",
        webrVFS: "web"
    });
    assert.ok(
        buildProduct.includes("scripts/build-desktop.js")
            && buildProduct.includes("scripts/package-product.js"),
        `${productName} must delegate its desktop engine and packaging to DialogForge.`
    );
    assert.ok(buildProduct.includes("DIALOGFORGE_RELEASE_CHANNEL"));
    assert.ok(buildProduct.includes('forceMacosIntel ? "latest-x64" : "latest-arm64"'));
    assert.ok(packageProduct.includes("--config.publish.channel"));

    [
        "build.yml",
        "build-linux.yml",
        "build-windows.yml",
        "build-macos.yml",
        "check.yml"
    ].forEach((workflowName) => {
        assert.ok(
            fs.existsSync(path.join(workflowRoot, workflowName)),
            `${productName} must own ${workflowName}.`
        );
    });

    // DialogR runs all default targets; DialogQCA retains its focused check.
    const packagedSmokeCommand = "node scripts/verify-production-electron.js "
        + "--product-path ../product --output-dir ../product/build/output"
        + (productName === "DialogR" ? "" : " --target script-editor");

    for (const platform of ["linux", "windows", "macos"]) {
        for (const workflowName of ["build.yml", `build-${platform}.yml`]) {
            assertPackagedSmokeJob(
                path.join(workflowRoot, workflowName),
                platform,
                packagedSmokeCommand
            );
        }
    }
}

assert.deepEqual(
    fs.readdirSync(path.join(rootDir, ".github", "workflows"))
        .filter((fileName) => fileName.endsWith(".yml"))
        .sort(),
    ["build-native-iroh-binding.yml", "build-r-runtime-helpers.yml",
        "check-console-command-parity.yml", "check-dialog-label-parity.yml",
        "check-native-dataset-dialog.yml", "check-packaging-dependencies.yml",
        "probe-intel-iroh.yml", "sign-windows-product.yml"],
    "DialogForge owns runtime helper and binding builds, acceptance probes, and shared signing; products own releases."
);

console.log("Current packaging ownership and artifact policy verified.");
