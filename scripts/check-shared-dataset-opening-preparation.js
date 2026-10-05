"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { prepareDatasetEditorOpening } = require(
    "../dist/src/dataset-editor/datasetEditorOpeningPreparation"
);

const main = async function() {
    for (const disposition of ["success", "rejected", "throws", "not-selected"]) {
        const order = [];
        const errors = [];
        let finishSelection;
        let rejectSelection;
        const selection = new Promise((resolve, reject) => {
            finishSelection = resolve;
            rejectSelection = reject;
        });
        const failure = Error("selection publication failed");
        prepareDatasetEditorOpening("dataset", {
            selectDataset(name) {
                assert.equal(name, "dataset");
                order.push("selection-started");
                if (disposition === "throws") {
                    throw failure;
                }
                return disposition === "not-selected" ? undefined : selection;
            },
            warmFirstScreens(name) {
                assert.equal(name, "dataset");
                order.push("warm-first-screens");
            },
            reportError(error) { errors.push(error); }
        });
        order.push("host-opens-surface");
        assert.deepEqual(order, ["selection-started", "warm-first-screens", "host-opens-surface"],
            "Opening preparation must not wait for selection publication.");
        if (disposition === "rejected") {
            rejectSelection(failure);
        } else {
            finishSelection();
        }
        await Promise.resolve();
        await Promise.resolve();
        assert.deepEqual(errors, disposition === "throws" || disposition === "rejected"
            ? [failure] : []);
    }
    for (const sourcePath of [
        "src/shell-electron/dataset-editor/datasetEditorComposition.ts",
        "src/shell-web/pages/shell.js"
    ]) {
        const source = fs.readFileSync(path.join(__dirname, "..", sourcePath), "utf8");
        assert.ok(source.includes("datasetEditorOpeningPreparation"));
        assert.ok(source.includes("prepareDatasetEditorOpening("));
    }
    const browserConfig = JSON.parse(fs.readFileSync(
        path.join(__dirname, "..", "tsconfig.shell-web.json"), "utf8"
    ));
    assert.ok(browserConfig.include.includes("src/dataset-editor/datasetEditorOpeningPreparation.ts"),
        "The JS shell import must have an explicit browser compiler input.");
    const browserDist = process.env.DIALOGFORGE_TEST_WEB_DIST
        || path.join(__dirname, "..", "dist");
    assert.ok(fs.existsSync(path.join(browserDist, "browser-esm", "src",
        "dataset-editor", "datasetEditorOpeningPreparation.js")),
        "The canonical opening file must be emitted for the browser shell.");
    console.log("Shared opening-preparation cases passed; rendered paired-host acceptance remains open.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
