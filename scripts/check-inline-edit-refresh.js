"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");


// Actual Chromium DOM using the canonical renderer and edit bindings. Runtime
// delivery is covered separately by the paired rendered R acceptance.
const main = async function() {
    const productPath = path.resolve(process.argv[2] || "../DialogR");
    const webDist = path.join(productPath, "dist/web");
    process.env.DIALOGFORGE_SOURCE_ROOT = path.resolve(__dirname, "..");
    process.env.DIALOGFORGE_DIST_DIR = webDist;
    process.env.DIALOGFORGE_WEB_PRODUCT_PATH = productPath;
    const { createWebProductDevServer } = require(
        path.join(webDist, "scripts/web-product-dev-server.js")
    );
    const server = createWebProductDevServer({ productPath });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    let browser;

    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.route("**/inline-edit-refresh-fixture", route => route.fulfill({
            contentType: "text/html",
            body: '<div id="data"></div><button id="outside">Outside</button>'
        }));
        await page.goto(`http://127.0.0.1:${server.address().port}/inline-edit-refresh-fixture`);
        const result = await page.evaluate(async () => {
            const { createDatasetTableRenderer } = await import(
                "/browser-esm/src/dataset-editor/renderer/datasetTableRenderer.js"
            );
            const { bindDataGridEditActions } = await import(
                "/browser-esm/src/dataset-editor/renderer/dataGridEditBindings.js"
            );
            const host = document.querySelector("#data");
            let edit = { row: 1, column: "value" };
            let failed = false;
            let rowStart = 1;
            const updates = [];
            let rows = [[{ raw: "1", display: "1" }], [{ raw: "2", display: "2" }]];
            const escapeHtml = value => {
                const node = document.createElement("span");
                node.textContent = String(value);
                return node.innerHTML;
            };
            const renderer = createDatasetTableRenderer({
                rowHeight: 24, headerHeight: 24, minimumRowHeaderWidth: 40,
                getDataHost: () => host,
                getSchema: () => ({ rowCount: 2 }),
                getDataLoadFailed: () => failed,
                getDataColumns: () => [{ name: "value", type: "numeric" }],
                getDataColumnWidths: () => [120],
                getDataRowNames: () => ["1", "2"],
                getDataRows: () => rows,
                getFilteredRows: () => [],
                getLoadedRowStart: () => rowStart,
                getLoadedColumnStart: () => 1,
                getSelectedDataColumn: () => "",
                getSelectedDataRow: () => 0,
                getActiveDataCell: () => edit,
                getActiveDataEdit: () => edit,
                getActiveColumnHeaderEdit: () => null,
                getActiveRowNameEdit: () => null,
                translate: value => value,
                escapeHtml,
                renderDataStatus: message => { host.textContent = message; },
                bindDataInteractions: () => bindDataGridEditActions({
                    host,
                    getDatasetName: () => "refresh_data",
                    clearCellEdit: () => { edit = null; },
                    updateCell: async (_name, row, column, value) => {
                        updates.push({ row, column, value });
                        return { raw: value, display: value };
                    },
                    replaceLoadedCell: (row, _column, cell) => { rows[row - 1] = [cell]; },
                    render: () => renderer.renderData(),
                    showNotice: message => { throw Error(message); },
                    translate: value => value
                })
            });
            const require = (condition, message) => {
                if (!condition) throw Error(message);
            };
            const open = () => {
                edit = { row: 1, column: "value" };
                renderer.renderData();
                const input = host.querySelector("input");
                input.focus();
                input.value = "10";
                input.setSelectionRange(1, 2);
                return input;
            };
            const settle = () => new Promise(resolve => setTimeout(resolve, 0));
            const input = open();
            rows[1] = [{ raw: "3", display: "3" }];
            for (let index = 0; index < 3; index += 1) renderer.renderData();
            require(host.querySelector("input") === input, "Refresh replaced the draft node");
            require(input.value === "10" && input.selectionStart === 1 && input.selectionEnd === 2,
                "Refresh changed draft or caret");
            require(document.activeElement === input, "Refresh lost owning input focus");
            require(host.querySelector('[data-data-row="2"][data-data-cell]').textContent === "3",
                "Surrounding cell was not refreshed");
            require(updates.length === 0, "Refresh committed the draft");
            input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
            await settle();
            require(updates.length === 1 && updates[0].value === "10", "Enter did not commit exactly once");
            open();
            document.querySelector("#outside").focus();
            await settle();
            require(updates.length === 2, "Connected blur did not commit exactly once");
            const cancelled = open();
            cancelled.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
            await settle();
            require(updates.length === 2 && !host.querySelector("input"), "Cancel committed a draft");
            const retired = open();
            edit = null;
            renderer.renderData();
            retired.dispatchEvent(new Event("blur"));
            await settle();
            require(updates.length === 2, "Retired node blur committed a draft");
            const offscreen = open();
            rowStart = 2;
            rows = [rows[1]];
            renderer.renderData();
            offscreen.dispatchEvent(new Event("blur"));
            require(!host.querySelector("input") && updates.length === 2,
                "Offscreen draft was reattached or committed");
            rowStart = 1;
            rows = [[{ raw: "10", display: "10" }], [{ raw: "3", display: "3" }]];
            const unavailable = open();
            failed = true;
            renderer.renderData();
            unavailable.dispatchEvent(new Event("blur"));
            require(host.textContent === "Could not load dataset content" && updates.length === 2,
                "Failed read retained or committed an unavailable draft");
            return { commits: updates.length, refreshes: 3, draft: true, caret: true,
                focus: true, surroundingCell: true, cancel: true, retirement: true,
                offscreen: true, failedRead: true };
        });
        assert.equal(result.commits, 2);
        console.log(JSON.stringify(result));
    } finally {
        if (browser) await browser.close();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
