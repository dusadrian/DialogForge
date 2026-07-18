"use strict";

const nativeIrohRuntimeDependencies = function(platform, arch) {
    if (platform === "darwin") {
        return [
            "@number0/iroh-darwin-universal",
            ...(arch === "arm64" ? ["@number0/iroh-darwin-arm64"] : [])
        ];
    }

    if (platform === "linux") {
        return arch === "arm64" ? [
            "@number0/iroh-linux-arm64-gnu",
            "@number0/iroh-linux-arm64-musl"
        ] : [
            "@number0/iroh-linux-x64-gnu",
            "@number0/iroh-linux-x64-musl"
        ];
    }

    if (platform === "win32") {
        return arch === "arm64"
            ? ["@number0/iroh-win32-arm64-msvc"]
            : ["@number0/iroh-win32-x64-msvc"];
    }

    return [];
};

const sharedPackagedRuntimeDependencies = [
    "@fontsource/fira-code",
    "@fontsource/jetbrains-mono",
    "@fontsource/source-code-pro",
    "@irojs/iro-core",
    "@jaames/iro",
    "@number0/iroh",
    "argparse",
    "ansi-regex",
    "ansi-styles",
    "builder-util-runtime",
    "camelcase",
    "color-convert",
    "color-name",
    "debug",
    "decamelize",
    "diceware-wordlist-en-eff",
    "dijkstrajs",
    "dompurify",
    "emoji-regex",
    "electron-updater",
    "fs-extra",
    "graceful-fs",
    "get-caller-file",
    "is-fullwidth-code-point",
    "js-yaml",
    "jsonfile",
    "lazy-val",
    "lodash.escaperegexp",
    "lodash.isequal",
    "marked",
    "monaco-editor",
    "ms",
    "find-up",
    "locate-path",
    "p-locate",
    "p-try",
    "path-exists",
    "preact",
    "pngjs",
    "qrcode",
    "require-directory",
    "require-main-filename",
    "sax",
    "semver",
    "set-blocking",
    "string-width",
    "strip-ansi",
    "tiny-typed-emitter",
    "universalify",
    "sortablejs",
    "which-module"
];

const packagedRuntimeDependenciesFor = function(platform, arch) {
    return [
        ...sharedPackagedRuntimeDependencies,
        ...nativeIrohRuntimeDependencies(platform, arch)
    ];
};

const packagedRuntimeDependencies = packagedRuntimeDependenciesFor(
    process.platform,
    process.arch
);


module.exports = {
    packagedRuntimeDependencies,
    packagedRuntimeDependenciesFor
};
