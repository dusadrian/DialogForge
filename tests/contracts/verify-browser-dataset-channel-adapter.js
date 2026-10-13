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
const bridge = fs.readFileSync(
    path.join(rootDir, "src/shell-web/browserPreloadChannelBridge.ts"),
    "utf8"
);
const tsconfig = fs.readFileSync(
    path.join(rootDir, "tsconfig.shell-web.json"),
    "utf8"
);

[
    "readSchema",
    "readContent",
    "readFilterMask",
    "readVariables",
    "readVariableBatch",
    "updateCell",
    "updateColumnName",
    "updateRowName",
    "insertRow",
    "removeRow",
    "insertColumn",
    "removeColumn",
    "sortRows",
    "writeCells",
    "updateVariable"
].forEach((marker) => {
    assert.ok(
        adapter.includes(marker),
        `runtime-session dataset adapter must expose ${marker}`
    );
});

const reads = fs.readFileSync(path.join(rootDir, "src/runtime/tabular-data/datasetViewerReadController.ts"), "utf8");
const cells = fs.readFileSync(path.join(rootDir, "src/runtime/tabular-data/datasetViewerCellMutation.ts"), "utf8");
assert.ok(
    adapter.includes("createDatasetViewerReadController")
        && adapter.includes("createDatasetViewerCellMutation")
        && adapter.includes("RuntimeSessionManager")
        && reads.includes("runtime.readTabularSchema")
        && adapter.includes("runtime.readTabularPreview")
        && reads.includes("runtime.readVariableMetadata")
        && cells.includes("options.runtimeSessionManager.writeCell"),
    "dataset operations must delegate to RuntimeSessionManager"
);
assert.ok(
    shell.includes("createRuntimeSessionDatasetChannelAdapter")
        && shell.includes(
            "/browser-esm/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter.js"
        )
        && !shell.includes("createWebRDatasetChannelAdapter")
        && bridge.includes("options.datasetChannels().readSchema(input.name)")
        && bridge.includes("options.datasetChannels().updateVariable(input)"),
    "browser preload channels must use the runtime-session dataset adapter"
);
assert.ok(
    tsconfig.includes(
        "src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter.ts"
    )
        && !tsconfig.includes("webRDatasetChannelAdapter.ts")
        && !tsconfig.includes("webRDatasetEditorRuntimeBindings.ts"),
    "browser ESM build must contain only the runtime-session dataset adapter"
);

console.log("Runtime-session dataset channel adapter verified.");
