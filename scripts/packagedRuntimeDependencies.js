"use strict";

const nativeIrohRuntimeDependencies = {
    darwin: [
        "@number0/iroh-darwin-universal",
        ...(process.arch === "arm64" ? ["@number0/iroh-darwin-arm64"] : [])
    ],
    linux: process.arch === "arm64"
        ? [
            "@number0/iroh-linux-arm64-gnu",
            "@number0/iroh-linux-arm64-musl"
        ]
        : [
            "@number0/iroh-linux-x64-gnu",
            "@number0/iroh-linux-x64-musl"
        ],
    win32: process.arch === "arm64"
        ? ["@number0/iroh-win32-arm64-msvc"]
        : ["@number0/iroh-win32-x64-msvc"]
};

const packagedRuntimeDependencies = [
    "@fontsource/fira-code",
    "@fontsource/jetbrains-mono",
    "@fontsource/source-code-pro",
    "@jaames/iro",
    "@number0/iroh",
    ...(nativeIrohRuntimeDependencies[process.platform] || []),
    "argparse",
    "builder-util-runtime",
    "debug",
    "dompurify",
    "electron-updater",
    "fs-extra",
    "graceful-fs",
    "js-yaml",
    "jsonfile",
    "lazy-val",
    "lodash.escaperegexp",
    "lodash.isequal",
    "marked",
    "monaco-editor",
    "ms",
    "preact",
    "sax",
    "semver",
    "tiny-typed-emitter",
    "universalify",
    "sortablejs"
];


module.exports = {
    packagedRuntimeDependencies
};
