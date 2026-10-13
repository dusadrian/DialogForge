"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const adapter = fs.readFileSync(
    path.join(
        rootDir,
        "src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter.ts"
    ),
    "utf8"
);
const shell = fs.readFileSync(
    path.join(rootDir, "src/shell-web/pages/shell.js"),
    "utf8"
);

const reads = fs.readFileSync(path.join(rootDir, "src/runtime/tabular-data/datasetViewerReadController.ts"), "utf8");
assert.ok(
    adapter.includes("createDatasetViewerReadController")
        && reads.includes("toDatasetViewerSchema")
        && reads.includes("toDatasetViewerContent")
        && reads.includes("runtime.readTabularSchema(name)")
        && reads.includes("options.readTabularPreview(request)")
        && reads.includes("runtime.readVariableMetadata(name)"),
    "Data Editor snapshots must be projected from shared runtime results"
);
assert.ok(
    !shell.includes("buildRDatasetEditorSnapshotCommand")
        && !shell.includes("parseRDatasetEditorSnapshot")
        && !shell.includes("createWebRDatasetEditorRuntimeBindings"),
    "browser shell must not construct or parse R Data Editor snapshots"
);

console.log("Runtime-session dataset snapshot routing verified.");
