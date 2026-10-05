"use strict";

const path = require("node:path");
const { Arch } = require("builder-util");
const { assertNativeRHelperArtifacts } = require("./native-r-helper-artifacts");
const prepareLinuxElectronSandbox = require("./prepare-linux-electron-sandbox");
const productRuntimeArtifactRoot = require("./product-runtime-artifact-root");

module.exports = async function prepareProductRuntime(context) {
    const sourceRoot = path.resolve(process.env.DIALOGFORGE_SOURCE_ROOT || path.join(__dirname, ".."));
    const runtimeRoot = productRuntimeArtifactRoot(context);
    const arch = typeof context.arch === "string" ? context.arch : Arch[context.arch];
    // Check the real packaged files before signing or producing installers.
    // A build configuration excluding mandatory helpers cannot pass this gate.
    assertNativeRHelperArtifacts(sourceRoot, runtimeRoot, context.electronPlatformName, arch);
    await prepareLinuxElectronSandbox(context);
};
