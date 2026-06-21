"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { compositionPanelsApi } = require("../../shared/base-app/features/composition-panels/compositionPanels");
const rootDir = process.cwd();
const compositionPanelsSource = fs.readFileSync(path.join(
    rootDir,
    "shared/base-app/features/composition-panels/compositionPanels.ts"
), "utf8");
const commandHistorySource = fs.readFileSync(path.join(
    rootDir,
    "shared/base-app/features/menu-commands/mainCommandHistoryController.ts"
), "utf8");
const mainCompositionRoot = fs.readFileSync(path.join(
    rootDir,
    "shared/base-app/features/main-window/mainCompositionRoot.ts"
), "utf8");
const mainPage = fs.readFileSync(path.join(
    rootDir,
    "shared/base-app/pages/main.html"
), "utf8");
const dialogBuilderPage = fs.readFileSync(path.join(
    rootDir,
    "shared/base-app/pages/dialogBuilder.html"
), "utf8");
class FakeElement {
    constructor(tagName) {
        this.className = "";
        this.textContent = "";
        this.type = "";
        this.disabled = false;
        this.children = [];
        this.tagName = tagName;
    }
    appendChild(child) {
        this.children.push(child);
        return child;
    }
    addEventListener(_eventName, _listener) {
        return;
    }
}
const empty = function (element) {
    element.textContent = "";
    element.children = [];
};
const appendField = function (parent, label, value) {
    const field = new FakeElement("div");
    field.textContent = `${label}: ${String(value || "")}`;
    parent.appendChild(field);
};
const setStatusClass = function (element, enabled) {
    element.className = enabled ? "enabled" : "disabled";
};
const productCommandPanel = new FakeElement("div");
compositionPanelsApi.renderProductCommandResult(productCommandPanel, {
    status: "ready",
    providerId: "r",
    productId: "StatsProduct",
    command: "StatsProduct.packages.updateRequired",
    message: "Prepared update command for 2 package(s).",
    executedAt: "2026-06-04T00:00:00.000Z",
    transcriptEvents: [
        {
            type: "submitted",
            commandKind: "product.command",
            source: "contract",
            text: "StatsProduct.packages.updateRequired",
            createdAt: "2026-06-04T00:00:00.000Z"
        },
        {
            type: "output",
            commandKind: "product.command",
            source: "contract",
            text: "StatsProduct.packages.updateRequired",
            message: "install.packages(c('admisc', 'declared'))",
            createdAt: "2026-06-04T00:00:00.000Z"
        },
        {
            type: "completed",
            commandKind: "product.command",
            source: "contract",
            text: "StatsProduct.packages.updateRequired",
            message: "Product command completed.",
            createdAt: "2026-06-04T00:00:00.000Z"
        }
    ]
}, {
    appendField,
    empty,
    setStatusClass
});
assert.strictEqual(productCommandPanel.children.length, 5);
assert.strictEqual(productCommandPanel.children[0].textContent, "product command status: ready");
assert.strictEqual(productCommandPanel.children[1].textContent, "product command: StatsProduct.packages.updateRequired");
assert.strictEqual(productCommandPanel.children[2].textContent, "message: Prepared update command for 2 package(s).");
assert.strictEqual(productCommandPanel.children[3].textContent, "output: install.packages(c('admisc', 'declared'))");
assert.strictEqual(productCommandPanel.children[4].textContent, "completed: Product command completed.");
assert.ok(
    !compositionPanelsSource.includes('runButton.textContent = "Run dialog"')
    && !compositionPanelsSource.includes('appendField(body, "owner"'),
    "product dialogs must not render migration metadata in the main window"
);
assert.ok(
    !commandHistorySource.includes("DialogHost")
    && !mainCompositionRoot.includes('byId("dialogHost")')
    && !mainPage.includes('id="dialogHost"')
    && !mainPage.includes('id="dialogClose"')
    && !mainPage.includes(".sourceDialogPreview"),
    "the migrated application must not contain the inline diagnostic dialog panel"
);
assert.ok(
    dialogBuilderPage.includes("'app.asar',\n                'shared',")
    && !dialogBuilderPage.includes("'app.asar',\n                'dist',"),
    "packaged dialog windows must load their renderer from the app.asar root"
);
console.log("Composition panel helpers verified.");
