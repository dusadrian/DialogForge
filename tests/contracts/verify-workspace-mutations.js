"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { getRuntimeProvider } = require("../../shared/runtime/providers/runtimeProviderRegistry");
const { createRuntimeSessionManager } = require("../../shared/runtime/session/runtimeSessionManager");
const { createImportRequest } = require("../../shared/runtime/tabular-data/importProtocol");
const { createWorkspaceObject } = require("../../shared/runtime/workspace/workspaceProtocol");
const verifyWorkspaceObjectViewerMetadata = function () {
    const object = createWorkspaceObject({
        name: "survey",
        kind: "data.frame",
        detail: "2 rows x 2 columns",
        hasViewer: true
    });
    assert.strictEqual(object.hasViewer, true);
};
const verifyPlaceholderRemoveAndClear = async function () {
    const manager = createRuntimeSessionManager(getRuntimeProvider("python"));
    await manager.start();
    await manager.importData(createImportRequest({
        source: "/tmp/imported.csv",
        format: "csv",
        targetName: "imported_table",
        overwrite: false
    }));
    assert.strictEqual(manager.getActiveDataset().status, "selected");
    assert.strictEqual(manager.getActiveDataset().objectName, "imported_table");
    const selected = await manager.setActiveDataset("imported_table");
    assert.strictEqual(selected.status, "selected");
    const sorted = await manager.sortRows({
        objectName: "imported_table",
        columnName: "value",
        direction: "descending"
    });
    assert.strictEqual(sorted.status, "updated");
    const renamedRow = await manager.updateRowName({
        objectName: "imported_table",
        rowIndex: 0,
        name: "top_case"
    });
    assert.strictEqual(renamedRow.status, "updated");
    const renamedWorkspace = await manager.renameWorkspaceObject({
        oldName: "imported_table",
        newName: "renamed_table",
        source: "contract-test"
    });
    assert.strictEqual(renamedWorkspace.status, "ready");
    assert.strictEqual(manager.getActiveDataset().objectName, "renamed_table");
    assert.strictEqual(renamedWorkspace.objects.some((object) => object.name === "imported_table"), false);
    assert.strictEqual(renamedWorkspace.objects.some((object) => object.name === "renamed_table"), true);
    const preview = await manager.readTabularPreview("renamed_table");
    assert.deepStrictEqual(preview.rows.map((row) => row.value), [1, 0]);
    assert.strictEqual(preview.rowNames[0], "top_case");
    const removed = await manager.removeWorkspaceObjects(["renamed_table"]);
    assert.strictEqual(removed.status, "ready");
    assert.strictEqual(removed.objects.some((object) => object.name === "imported_table"), false);
    assert.strictEqual(manager.getActiveDataset().status, "none");
    await manager.importData(createImportRequest({
        source: "/tmp/imported-again.csv",
        format: "csv",
        targetName: "imported_again",
        overwrite: false
    }));
    assert.strictEqual(manager.getActiveDataset().status, "selected");
    assert.strictEqual(manager.getActiveDataset().objectName, "imported_again");
    const cleared = await manager.clearWorkspace();
    assert.strictEqual(cleared.status, "ready");
    assert.strictEqual(cleared.objects.some((object) => object.name === "imported_again"), false);
    assert.strictEqual(cleared.objects.some((object) => object.name === "sample_frame"), true);
};
const verifyUnavailableAndInvalidStates = async function () {
    const manager = createRuntimeSessionManager(getRuntimeProvider("python"));
    const unavailable = await manager.removeWorkspaceObjects(["x"]);
    assert.strictEqual(unavailable.status, "unavailable");
    await manager.start();
    const invalid = await manager.removeWorkspaceObjects([]);
    assert.strictEqual(invalid.status, "invalid");
    const invalidRename = await manager.renameWorkspaceObject({
        oldName: "",
        newName: "x",
        source: "contract-test"
    });
    assert.strictEqual(invalidRename.status, "invalid");
    const notFoundRename = await manager.renameWorkspaceObject({
        oldName: "missing_object",
        newName: "renamed_missing",
        source: "contract-test"
    });
    assert.strictEqual(notFoundRename.status, "not-found");
    await manager.importData(createImportRequest({
        source: "/tmp/conflict.csv",
        format: "csv",
        targetName: "conflict_table",
        overwrite: false
    }));
    const conflictRename = await manager.renameWorkspaceObject({
        oldName: "conflict_table",
        newName: "sample_frame",
        source: "contract-test"
    });
    assert.strictEqual(conflictRename.status, "conflict");
    const readOnlyRemove = await manager.removeWorkspaceObjects(["sample_frame"]);
    assert.strictEqual(readOnlyRemove.status, "unsupported");
    assert.strictEqual(readOnlyRemove.objects.some((object) => object.name === "sample_frame"), true);
    const invalidRowName = await manager.updateRowName({
        objectName: "sample_frame",
        rowIndex: 99,
        name: "missing"
    });
    assert.strictEqual(invalidRowName.status, "invalid-row");
};
const run = async function () {
    verifyWorkspaceObjectViewerMetadata();
    await verifyPlaceholderRemoveAndClear();
    await verifyUnavailableAndInvalidStates();
    console.log("Workspace mutation contract verified.");
};
void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
