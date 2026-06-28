"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");

const {
    createWebRPackageLibraryBootstrapPlan
} = require("../../shared/runtime/providers/webr/webRPackageLibraryPolicy");
const {
    normalizeWebRBootstrapPlan
} = require("../../shared/runtime/providers/webr/webRBootstrap");


const metadata = {
    files: [
        {
            filename: "admisc/DESCRIPTION",
            start: 0,
            end: 10
        }
    ]
};
const blob = new Uint8Array([1, 2, 3]);
const plan = createWebRPackageLibraryBootstrapPlan({
    packageLibrary: {
        mountpoint: "/dialogr-lib/",
        source: "deployment",
        metadata,
        blob
    },
    helperAssets: [
        {
            mount: {
                kind: "workerfs",
                source: "deployment",
                mountpoint: "/dialogr-runtime",
                options: {
                    blobs: [
                        {
                            name: "runtime.R",
                            data: new Uint8Array([4, 5, 6])
                        }
                    ]
                }
            },
            sourceFiles: [
                "/dialogr-runtime/runtime.R",
                "/dialogr-runtime/runtime.R"
            ]
        }
    ],
    startupCommands: [
        "options(dialogr.webr = TRUE)"
    ]
});

assert.strictEqual(plan.mounts.length, 2);
assert.strictEqual(plan.mounts[0].kind, "workerfs");
assert.strictEqual(plan.mounts[0].mountpoint, "/dialogr-lib");
assert.deepStrictEqual(plan.mounts[0].options.packages, [
    {
        metadata,
        blob
    }
]);
assert.deepStrictEqual(plan.sourceFiles, [
    "/dialogr-runtime/runtime.R"
]);
assert.deepStrictEqual(plan.commands, [
    ".libPaths(unique(c(\"/dialogr-lib\", .libPaths())))",
    "options(dialogr.webr = TRUE)"
]);

const normalized = normalizeWebRBootstrapPlan({
    packageLibrary: {
        metadata,
        blob
    },
    sourceFiles: ["/extra.R"],
    commands: ["options(extra = TRUE)"]
});

assert.strictEqual(normalized.mounts[0].mountpoint, "/dialogr-library");
assert.deepStrictEqual(normalized.sourceFiles, ["/extra.R"]);
assert.deepStrictEqual(normalized.commands, [
    ".libPaths(unique(c(\"/dialogr-library\", .libPaths())))",
    "options(extra = TRUE)"
]);

console.log("WebR package/library bootstrap policy verified.");
