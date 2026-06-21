"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { compositionPanelsApi } = require("../../shared/base-app/features/composition-panels/compositionPanels");
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
console.log("Composition panel helpers verified.");
