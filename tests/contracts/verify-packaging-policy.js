"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");


const rootDir = process.cwd();
const read = function(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
};
const packageAction = read(".github/actions/package-product/action.yml");
const packageProduct = read("scripts/package-product.js");
const generateCoreSdk = read("scripts/generate-core-sdk.js");
const watchProduct = read("scripts/watch-product.js");
const electronMain = read("scripts/electron-main.js");
const copyStatic = read("scripts/copy-static.js");
const macosNotarization = read("scripts/macos-notarization.js");
const packagedDependencies = read(
    "scripts/packagedRuntimeDependencies.js"
);
const renameMacArtifacts = read("scripts/rename-binaries-mac.js");
const packageJson = JSON.parse(read("package.json"));
const scriptSources = fs.readdirSync(path.join(rootDir, "scripts"))
    .filter((entry) => {
        return entry.endsWith(".js");
    })
    .map((entry) => {
        return {
            relativePath: path.join("scripts", entry),
            source: read(path.join("scripts", entry))
        };
    });
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


scriptSources.forEach((script) => {
    [
        "__createBinding",
        "__setModuleDefault",
        "__importStar",
        "__importDefault",
        "Object.defineProperty(exports"
    ].forEach((compiledHelper) => {
        assert.ok(
            !script.source.includes(compiledHelper),
            script.relativePath + " must be checked in as human-authored JavaScript"
        );
    });
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
[
    "dompurify",
    "marked",
    "monaco-editor",
    "preact",
    "sortablejs"
].forEach((packageName) => {
    assert.ok(
        packagedDependencies.includes(`"${packageName}"`),
        packageName + " must be declared as a packaged runtime dependency"
    );
});
assert.ok(
    copyStatic.includes("packagedRuntimeDependencies.forEach")
    && packageProduct.includes("assertPackagedRuntimeDependencies();"),
    "production dependencies must be staged and checked before packaging"
);
assert.ok(
    packageProduct.includes("validateI18nDirectory")
    && packageProduct.includes("validateDialogRegistry"),
    "product staging must validate contributor-authored locale and dialog source files"
);
assert.ok(
    packageJson.scripts.build.includes("node scripts/generate-core-sdk.js")
    && packageJson.scripts["sdk:core"] === "node scripts/generate-core-sdk.js"
    && generateCoreSdk.includes("@dialogforge/core")
    && generateCoreSdk.includes("PRODUCT_CONTRIBUTION_CONTRACT_VERSION")
    && generateCoreSdk.includes('path.join(rootDir, "node_modules", "@dialogforge", "core")')
    && copyStatic.includes("node_modules/@dialogforge/core/**/*"),
    "builds must stage the product-facing @dialogforge/core SDK contract"
);
assert.ok(
    packageJson.scripts["dev:product"] === "npm run build && node scripts/watch-product.js"
    && watchProduct.includes('"--stage-only"')
    && watchProduct.includes('"dist/scripts/electron-main.js"')
    && watchProduct.includes("readTreeSnapshot"),
    "product development mode must restage watched product files and restart Electron"
);
[
    "submit:DialogR",
    "submit:DialogQCA",
    "history",
    "staple:DialogR",
    "staple:DialogQCA"
].forEach((scriptName) => {
    assert.ok(
        packageJson.scripts[scriptName],
        "missing macOS notarization script: " + scriptName
    );
});
assert.ok(
    macosNotarization.includes('path.join(productRoot, "product.json")')
    && macosNotarization.includes('`_${version}_silicon.dmg`')
    && macosNotarization.includes('"--output-format",\n        "json"')
    && macosNotarization.includes("normalizedRight - normalizedLeft")
    && macosNotarization.includes("}).slice(0, 2);")
    && macosNotarization.includes("Submission ${String(index + 1)}:"),
    "macOS notarization must derive product DMGs and report the last two history entries"
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
assert.ok(
    packageAction.includes("uses: azure/login@v1")
    && packageAction.includes("uses: azure/artifact-signing-action@v1")
    && packageAction.includes("endpoint: https://plc.codesigning.azure.net/")
    && packageAction.includes("signing-account-name: dusadrian")
    && packageAction.includes("certificate-profile-name: electron-profile")
    && packageAction.includes("files-folder-filter: exe"),
    "Windows package builds must sign generated executable artifacts"
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
        && workflow.includes(`runs-on: ${runner}`),
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
    ".github/workflows/build-dialogr-windows.yml",
    ".github/workflows/build-dialogqca-windows.yml"
].forEach((relativePath) => {
    const workflow = read(relativePath);

    assert.ok(
        workflow.includes("id-token: write")
        && workflow.includes("azure_application_id: ${{ secrets.AZURE_APPLICATION_ID }}")
        && workflow.includes("azure_tenant_id: ${{ secrets.AZURE_TENANT_ID }}")
        && workflow.includes("azure_subscription_id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}")
        && workflow.includes("environment: signing"),
        relativePath + " must make Azure signing credentials available to Windows packaging"
    );
});
[
    ".github/workflows/build-dialogr.yml",
    ".github/workflows/build-dialogqca.yml"
].forEach((relativePath) => {
    const workflow = read(relativePath);

    assert.ok(
        workflow.includes("windows:")
        && workflow.includes("permissions:")
        && workflow.includes("id-token: write"),
        relativePath + " must grant OIDC to the called Windows signing workflow"
    );
});

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
assert.ok(
    packageProduct.includes('require.resolve("electron/package.json"')
    && packageProduct.includes("`--config.electronVersion=${electronVersion}`")
    && !packageProduct.includes("--config.electronVersion=40.6.1"),
    "product packaging must use the installed Electron runtime version"
);
assert.ok(
    packageProduct.includes(
        "process.env.DIALOGFORGE_PRODUCT_PATH = path.join(__dirname"
    )
    && electronMain.includes(
        'String(process.env.DIALOGFORGE_PRODUCT_PATH || "").trim()'
    ),
    "packaged products must select their staged product without relying on argv layout"
);
assert.ok(
    packageProduct.includes(
        "`--config.extraMetadata.productName=${productName}`"
    ),
    "packaged products must expose the product name to Electron at runtime"
);
assert.ok(
    packageProduct.includes("readProductDescription")
    && packageProduct.includes("Missing description in ${manifestPath}.")
    && packageProduct.includes(
        "`--config.extraMetadata.description=${productDescription}`"
    )
    && !packageProduct.includes("`--config.description=${productDescription}`"),
    "packaged products must use the selected product description"
);
assert.ok(
    !packageProduct.includes("windowsAzureSigningConfig")
    && !packageProduct.includes("AZURE_TRUSTED_SIGNING_ENDPOINT")
    && !packageProduct.includes("--config.win.azureSignOptions"),
    "Windows signing must be handled by the workflow after electron-builder packaging"
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
