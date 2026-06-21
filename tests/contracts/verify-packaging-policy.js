"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");


const rootDir = process.cwd();
const read = function(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
};
const packageAction = read(".github/actions/package-product/action.yml");
const packageProduct = read("build/scripts/package-product.ts");
const renameMacArtifacts = read("build/scripts/rename-binaries-mac.ts");
const packageJson = JSON.parse(read("package.json"));
const productWorkflowPaths = [
    ".github/workflows/build-dialogr-linux.yml",
    ".github/workflows/build-dialogr-windows.yml",
    ".github/workflows/build-dialogr-macos.yml",
    ".github/workflows/build-dialogqca-linux.yml",
    ".github/workflows/build-dialogqca-windows.yml",
    ".github/workflows/build-dialogqca-macos.yml",
    ".github/workflows/build-dialogr.yml",
    ".github/workflows/build-dialogqca.yml"
];
const productWorkflows = productWorkflowPaths.map(read);
const dialogRWorkflowPaths = productWorkflowPaths.filter((relativePath) => {
    return relativePath.includes("build-dialogr");
});
const dialogQCAWorkflowPaths = productWorkflowPaths.filter((relativePath) => {
    return relativePath.includes("build-dialogqca");
});


assert.ok(
    productWorkflows.every((workflow) => {
        return workflow.includes("prepare-release:")
            && workflow.includes("needs: prepare-release");
    }),
    "binary builds must prepare the target Release before parallel uploads"
);
assert.ok(
    packageAction.includes("gh release upload"),
    "platform builds must upload files directly to the target Release"
);
dialogRWorkflowPaths.forEach((relativePath) => {
    const workflow = read(relativePath);

    assert.ok(
        workflow.includes("default: DialogR")
        && workflow.includes("default: dusadrian/binaries"),
        relativePath + " must publish to the established DialogR release by default"
    );
});
dialogQCAWorkflowPaths.forEach((relativePath) => {
    const workflow = read(relativePath);

    assert.ok(
        workflow.includes("default: QCA")
        && workflow.includes("default: dusadrian/binaries"),
        relativePath + " must publish to the established QCA release by default"
    );
});
assert.ok(
    ![packageAction, ...productWorkflows].some((workflow) => {
        return workflow.includes("actions/upload-artifact")
            || workflow.includes("actions/download-artifact")
            || workflow.includes("publish-release-assets:");
    }),
    "binary builds must not relay files through GitHub Actions artifacts"
);
[
    "files=(build/output/*.AppImage)",
    "files=(build/output/*.exe)",
    "files=(build/output/*.dmg)"
].forEach((expected) => {
    assert.ok(
        packageAction.includes(expected),
        "binary Release upload is missing: " + expected
    );
});
assert.ok(
    !packageAction.includes("build/output/*.zip"),
    "Windows Release uploads must not include portable ZIP archives"
);
assert.deepEqual(
    packageJson.build.win.target,
    ["nsis", "portable"],
    "Windows packaging must produce installer and standalone executables"
);
assert.deepEqual(
    packageJson.build.mac.target[0].arch,
    ["arm64"],
    "local macOS packaging must declare Apple Silicon only"
);
const assertProductPlatformWorkflow = function(
    relativePath,
    repository,
    platform,
    runner,
    archArgs = ""
) {
    const workflow = read(relativePath);

    assert.ok(
        workflow.includes(`product_repository: ${repository}`),
        relativePath + " must select " + repository
    );
    assert.ok(
        workflow.includes(`platform: ${platform}`)
        && workflow.includes(`runner: ${runner}`),
        relativePath + " must own the expected platform runner"
    );

    if (archArgs) {
        assert.ok(
            workflow.includes(`arch_args: ${archArgs}`),
            relativePath + " must own the expected architecture argument"
        );
    }
};


assertProductPlatformWorkflow(
    ".github/workflows/build-dialogr-linux.yml",
    "RODA/DialogR",
    "linux",
    "ubuntu-latest"
);
assertProductPlatformWorkflow(
    ".github/workflows/build-dialogr-windows.yml",
    "RODA/DialogR",
    "windows",
    "windows-latest"
);
assertProductPlatformWorkflow(
    ".github/workflows/build-dialogr-macos.yml",
    "RODA/DialogR",
    "macos",
    "macos-15-intel",
    "--arch x64"
);
assertProductPlatformWorkflow(
    ".github/workflows/build-dialogqca-linux.yml",
    "RODA/DialogQCA",
    "linux",
    "ubuntu-latest"
);
assertProductPlatformWorkflow(
    ".github/workflows/build-dialogqca-windows.yml",
    "RODA/DialogQCA",
    "windows",
    "windows-latest"
);
assertProductPlatformWorkflow(
    ".github/workflows/build-dialogqca-macos.yml",
    "RODA/DialogQCA",
    "macos",
    "macos-15-intel",
    "--arch x64"
);

[
    [".github/workflows/build-dialogr.yml", "build-dialogr"],
    [".github/workflows/build-dialogqca.yml", "build-dialogqca"]
].forEach(([relativePath, workflowPrefix]) => {
    const workflow = read(relativePath);

    ["linux", "windows", "macos"].forEach((platform) => {
        assert.ok(
            workflow.includes(`${platform}:`)
            && workflow.includes(
                `uses: ./.github/workflows/${workflowPrefix}-${platform}.yml`
            ),
            relativePath + " must invoke its " + platform + " workflow"
        );
    });
});

assert.ok(
    fs.readdirSync(path.join(rootDir, ".github/workflows"))
        .filter((fileName) => fileName.endsWith(".yml"))
        .length === 8,
    "GitHub Actions must expose exactly the eight product workflows"
);
assert.ok(
    ![packageAction, ...productWorkflows].some((workflow) => {
        return workflow.includes("DIALOGFORGE_MAC_ARCH:");
    }),
    "GitHub Actions must select Intel through the explicit architecture argument"
);
assert.ok(
    packageProduct.includes('process.env.GITHUB_ACTIONS !== "true"')
    && packageProduct.includes(
        '"macOS Intel packaging is owned by GitHub Actions. "'
    ),
    "the package dispatcher must reject local macOS Intel builds"
);
assert.ok(
    packageProduct.includes("`--config.directories.output=${outputDir}`"),
    "electron-builder output paths must use the Windows-safe equals form"
);
[
    "`--config.linux.artifactName=${fileName}_${version}_intel.AppImage`",
    "`--config.nsis.artifactName=${fileName}_setup_${version}_intel.exe`",
    "`--config.portable.artifactName=${fileName}_${version}_intel.exe`"
].forEach((expected) => {
    assert.ok(
        packageProduct.includes(expected),
        "Intel package naming is missing: " + expected
    );
});
assert.ok(
    renameMacArtifacts.includes(
        'targetArch === "arm64" ? "silicon" : "intel"'
    ),
    "macOS packages must retain explicit silicon/intel suffixes"
);

console.log("Packaging publication and architecture policy verified.");
