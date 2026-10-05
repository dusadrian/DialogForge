"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Arch } = require("builder-util");
const { assertNativeRHelperArtifacts } = require("./native-r-helper-artifacts");
const { readArtifactFileHashes, fileSha256 } = require("./r-helper-artifact-files");
const { assertMacHelperSigningOnly } = require("./mac-r-helper-code-signature");
const productRuntimeArtifactRoot = require("./product-runtime-artifact-root");

module.exports = async function finalizeProductRuntime(context) {
    const sourceRoot = path.resolve(process.env.DIALOGFORGE_SOURCE_ROOT || path.join(__dirname, ".."));
    const runtimeRoot = productRuntimeArtifactRoot(context);
    const arch = typeof context.arch === "string" ? context.arch : Arch[context.arch];
    const manifest = assertNativeRHelperArtifacts(sourceRoot, runtimeRoot,
        context.electronPlatformName, arch,
        context.electronPlatformName === "darwin" ? assertMacHelperSigningOnly : undefined);
    const targets = manifest.targets.map(function(target) {
        const directory = target.runtimePlatform + "-" + target.runtimeVersion;
        return {
            ...target,
            deliveredFiles: readArtifactFileHashes(path.join(runtimeRoot, "r-runtime/native", directory, manifest.packageName))
        };
    });
    // Keep the final-byte receipt outside the signed app; writing inside its
    // sealed resources after signing would invalidate the app signature.
    fs.writeFileSync(path.join(context.outDir, "r-runtime-delivery-" + context.electronPlatformName + "-" + arch + ".json"),
        JSON.stringify({
            format: 1, packageName: manifest.packageName, packageVersion: manifest.packageVersion,
            manifestSha256: fileSha256(path.join(runtimeRoot, "r-runtime/native/manifest.json")),
            signingTransformationChecked: context.electronPlatformName === "darwin", targets
        }, null, 4) + "\n");
    console.log("Final packaged runtime helper matches its qualified pins after signing.");
};
