"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");


const rootDir = process.cwd();
const read = function(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
};
const binariesWorkflow = read(".github/workflows/build-binaries.yml");
const buildWorkflow = read(".github/workflows/build.yml");
const packageProduct = read("build/scripts/package-product.ts");
const packageJson = JSON.parse(read("package.json"));


assert.ok(
    binariesWorkflow.includes("prepare-release:")
    && binariesWorkflow.includes("needs: prepare-release"),
    "binary builds must prepare the target Release before parallel uploads"
);
assert.ok(
    binariesWorkflow.includes("gh release upload"),
    "platform builds must upload files directly to the target Release"
);
assert.ok(
    !binariesWorkflow.includes("actions/upload-artifact")
    && !binariesWorkflow.includes("actions/download-artifact")
    && !binariesWorkflow.includes("publish-release-assets:"),
    "binary builds must not relay files through GitHub Actions artifacts"
);
[
    "files=(build/output/*.AppImage)",
    "files=(build/output/*.exe)",
    "files=(build/output/*.dmg)"
].forEach((expected) => {
    assert.ok(
        binariesWorkflow.includes(expected),
        "binary Release upload is missing: " + expected
    );
});
assert.ok(
    !binariesWorkflow.includes("build/output/*.zip"),
    "Windows Release uploads must not include portable ZIP archives"
);
assert.equal(
    packageJson.build.win.target,
    "nsis",
    "Windows packaging must remain installer-only"
);
assert.deepEqual(
    packageJson.build.mac.target[0].arch,
    ["arm64"],
    "local macOS packaging must declare Apple Silicon only"
);
[
    binariesWorkflow,
    buildWorkflow
].forEach((workflow) => {
    assert.ok(
        workflow.includes("inputs.product == 'dialogr' && 'RODA/DialogR'")
        && workflow.includes(
            "inputs.product == 'dialogqca' && 'RODA/DialogQCA'"
        ),
        "GitHub Actions must resolve maintained products without repository input"
    );
    assert.ok(
        workflow.includes("repository: ${{ env.SELECTED_PRODUCT_REPOSITORY }}")
        && workflow.includes("PRODUCT_PATH: ${{ env.SELECTED_PRODUCT_PATH }}"),
        "GitHub Actions must check out and build the resolved product location"
    );
    assert.ok(
        workflow.includes("runner: macos-15-intel")
        && workflow.includes("arch_args: --arch x64"),
        "GitHub Actions must own an explicit macOS Intel lane"
    );
    assert.ok(
        !workflow.includes("DIALOGFORGE_MAC_ARCH:"),
        "GitHub Actions must select Intel through the explicit architecture argument"
    );
});
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

console.log("Packaging publication and architecture policy verified.");
