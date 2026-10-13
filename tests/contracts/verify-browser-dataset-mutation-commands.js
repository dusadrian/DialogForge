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

const owners = {
    Cell: ["createCellUpdateRequest", "options.runtimeSessionManager.writeCell"],
    Column: ["createColumnInsertRequest", "createColumnRemoveRequest", "createColumnRenameRequest",
        "options.runtimeSessionManager.renameColumn", "options.runtimeSessionManager.insertColumn",
        "options.runtimeSessionManager.removeColumn"],
    Row: ["createRowInsertRequest", "createRowNameUpdateRequest", "createRowRemoveRequest", "createRowSortRequest",
        "runtime.insertRow", "runtime.removeRow", "runtime.sortRows", "runtime.updateRowName"]
};
for (const [kind, markers] of Object.entries(owners)) {
    const owner = `datasetViewer${kind}Mutation`;
    assert.ok(adapter.includes(`createDatasetViewer${kind}Mutation`),
        `Session adapter must bind the canonical ${kind} owner`);
    const source = fs.readFileSync(path.join(rootDir, `src/runtime/tabular-data/${owner}.ts`), "utf8");
    for (const marker of markers) {
        assert.ok(source.includes(marker), `Shared ${kind} owner is missing ${marker}`);
    }
}

assert.ok(
    !shell.includes("createRDatasetCellValueCommand")
        && !shell.includes("createRDatasetVariableNameCommand")
        && !shell.includes("createRDatasetVariableAttributeCommand")
        && !shell.includes("createRDatasetValueLabelsCommand"),
    "browser shell must not build R mutation commands"
);

console.log("Runtime-session dataset mutation routing verified.");
