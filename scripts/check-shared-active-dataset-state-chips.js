"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createActiveDatasetStateChipReader } = require("../dist/src/base-app/features/workspace-pane/activeDatasetStateChips");

const main = async function() {
    for (const host of ["r", "webr"]) {
        let active = "data";
        let scope = "runtime-1";
        const pending = [];
        const published = [];
        const reader = createActiveDatasetStateChipReader({
            getActiveDatasetName: () => active,
            getSessionScope: () => scope,
            read: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
            publish: (snapshot) => published.push(snapshot)
        });
        const first = reader.refresh("data");
        const second = reader.refresh("data");
        pending[1].resolve([{ id: "new", label: "new" }]);
        await second;
        pending[0].resolve([{ id: "old", label: "old" }]);
        await first;
        assert.equal(published.length, 1, host);
        assert.equal(published[0].chips[0].id, "new", "Older same-dataset replies must not replace newer state.");
        await reader.refresh("different");
        assert.equal(pending.length, 2, "Do not query or clear chips for a nonactive dataset.");
        assert.equal(published.length, 1);

        const oldDataset = reader.refresh("data");
        active = "other";
        pending[2].resolve([]);
        await oldDataset;
        assert.equal(published.length, 1);
        const oldRuntime = reader.refresh("other");
        scope = "runtime-2";
        pending[3].resolve([]);
        await oldRuntime;
        assert.equal(published.length, 1);

        const beforeClear = reader.refresh("other");
        active = "";
        await reader.refresh("");
        assert.deepEqual(published.at(-1), { dataset: "", chips: [] });
        pending[4].resolve([{ id: "late" }]);
        await beforeClear;
        assert.equal(published.length, 2);

        active = "data";
        const failure = reader.refresh("data");
        pending[5].reject(new Error("read failed"));
        await assert.rejects(failure, /read failed/);
        const retry = reader.refresh("data");
        pending[6].resolve(null);
        await retry;
        assert.deepEqual(published.at(-1), { dataset: "data", chips: [] });

        let selection = { owner: host, sequence: 1 };
        let finishSelectionRead;
        const selectionPublished = [];
        const scopedReader = createActiveDatasetStateChipReader({
            getActiveDatasetName: () => "data",
            getSessionScope: () => "same-session",
            getSelectionRevision: () => selection,
            read: () => new Promise((resolve) => { finishSelectionRead = resolve; }),
            publish: (snapshot) => selectionPublished.push(snapshot)
        });
        const oldSelection = scopedReader.refresh("data");
        selection.sequence += 2;
        finishSelectionRead([{ id: "before-away-and-back" }]);
        await oldSelection;
        assert.deepEqual(selectionPublished, [], "Same-name reselection must reject an old receipt, including mutated receipt objects.");
        const replacedOwner = scopedReader.refresh("data");
        selection = { owner: "replacement", sequence: selection.sequence };
        finishSelectionRead([{ id: "old-owner" }]);
        await replacedOwner;
        assert.deepEqual(selectionPublished, [], "Unknown replacement ownership cannot accept old chip data.");

        let failRetiredRead;
        const retiredErrorReader = createActiveDatasetStateChipReader({
            getActiveDatasetName: () => "data",
            getSessionScope: () => scope,
            read: () => new Promise((_resolve, reject) => { failRetiredRead = reject; }),
            publish: () => { throw new Error("Retired failure must not publish"); }
        });
        const retiredFailure = retiredErrorReader.refresh("data");
        scope = "replacement-session";
        failRetiredRead(new Error("retired failure"));
        await retiredFailure;
    }

    for (const file of [
        "src/base-app/features/main-window/mainCompositionRoot.ts",
        "src/shell-web/pages/shell.js",
        "scripts/electron-main.js"
    ]) {
        const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
        assert.ok(source.includes("createActiveDatasetStateChipReader({"),
            "Both hosts must consume the same active state-chip owner.");
    }
    console.log("Shared active state-chip delivery cases passed; toolbar and product workflow acceptance remains open.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
