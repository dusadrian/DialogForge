"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { runtimePanelsApi } = require("../../shared/base-app/features/runtime-panels/runtimePanels");
class FakeElement {
    constructor(tagName) {
        this.className = "";
        this.textContent = "";
        this.type = "";
        this.disabled = false;
        this.children = [];
        this.listeners = {};
        this.tagName = tagName;
    }
    appendChild(child) {
        this.children.push(child);
        return child;
    }
    addEventListener(eventName, listener) {
        const listeners = this.listeners[eventName] || [];
        listeners.push(listener);
        this.listeners[eventName] = listeners;
    }
    click() {
        (this.listeners.click || []).forEach((listener) => {
            listener();
        });
    }
    dblclick() {
        (this.listeners.dblclick || []).forEach((listener) => {
            listener();
        });
    }
}
const documentRef = {
    createElement: function (tagName) {
        return new FakeElement(tagName);
    }
};
const empty = function (element) {
    element.textContent = "";
    element.children = [];
};
const appendField = function (parent, label, value) {
    const field = new FakeElement("div");
    field.textContent = `${label}: ${String(value || "")}`;
    parent.appendChild(field);
};
const list = new FakeElement("ul");
runtimePanelsApi.renderTranscript(documentRef, list, [
    {
        type: "submitted",
        commandKind: "commands.visible",
        source: "contract",
        text: "1 + 1",
        createdAt: "2026-06-02T00:00:00.000Z"
    },
    {
        type: "output",
        commandKind: "commands.visible",
        source: "contract",
        text: "1 + 1",
        message: "[1] 2",
        createdAt: "2026-06-02T00:00:00.000Z"
    },
    {
        type: "completed",
        commandKind: "commands.visible",
        source: "contract",
        text: "1 + 1",
        message: "Executed by r runtime-control session.",
        createdAt: "2026-06-02T00:00:00.000Z"
    },
    {
        type: "output",
        commandKind: "commands.visible",
        source: "contract",
        text: "silent_value <- 42",
        message: "R command completed without output.",
        createdAt: "2026-06-02T00:00:00.000Z"
    }
], {
    appendField,
    empty
});
assert.strictEqual(list.children.length, 2);
assert.strictEqual(list.children[0].className, "submitted");
assert.strictEqual(list.children[0].textContent, "> 1 + 1");
assert.strictEqual(list.children[1].className, "output");
assert.strictEqual(list.children[1].textContent, "[1] 2");
const runtimeEventStatus = new FakeElement("div");
const runtimeEventList = new FakeElement("ul");
const openedViewerUrls = [];
runtimePanelsApi.renderRuntimeEvents(documentRef, runtimeEventStatus, runtimeEventList, {
    status: "ready",
    providerId: "r",
    events: [
        {
            type: "plot",
            providerId: "r",
            objectName: "plot-signature",
            detail: "Plot available.",
            payload: {
                status: "available",
                viewerUrl: "http://127.0.0.1:1234/live"
            },
            createdAt: "2026-06-04T00:00:00.000Z"
        }
    ],
    message: "1 event",
    refreshedAt: "2026-06-04T00:00:00.000Z"
}, {
    appendField,
    empty
}, {
    openViewerUrl: function (url) {
        openedViewerUrls.push(url);
    }
});
assert.strictEqual(runtimeEventList.children.length, 1);
assert.strictEqual(runtimeEventList.children[0].children[0].textContent, "type: plot");
assert.strictEqual(runtimeEventList.children[0].children[3].textContent, "status: available");
assert.strictEqual(runtimeEventList.children[0].children[4].textContent, "viewer: http://127.0.0.1:1234/live");
assert.strictEqual(runtimeEventList.children[0].children[5].textContent, "Open viewer");
runtimeEventList.children[0].children[5].click();
assert.deepStrictEqual(openedViewerUrls, ["http://127.0.0.1:1234/live"]);
const workspaceStatus = new FakeElement("div");
const workspaceList = new FakeElement("ul");
const workspaceCalls = [];
const collapsedGroups = new Set();
runtimePanelsApi.renderWorkspace(documentRef, workspaceStatus, workspaceList, {
    status: "ready",
    providerId: "r",
    message: "2 objects",
    objects: [
        {
            name: "mtcars",
            kind: "table",
            detail: "32 rows x 11 columns",
            hasViewer: true,
            capabilities: ["tabular.read", "tabular.write", "workspace.remove"],
            provenance: {
                source: "runtime",
                format: "r-object"
            }
        },
        {
            name: "helper",
            kind: "function",
            detail: "function(x)",
            hasViewer: false,
            capabilities: [],
            provenance: {
                source: "runtime",
                format: "r-object"
            }
        }
    ]
}, "mtcars", {
    setActiveDataset: function (objectName) {
        workspaceCalls.push("active:" + objectName);
    },
    readTabularPreview: function (objectName) {
        workspaceCalls.push("preview:" + objectName);
    },
    inspectObject: function (objectName) {
        workspaceCalls.push("inspect:" + objectName);
    },
    removeObject: function (objectName) {
        workspaceCalls.push("remove:" + objectName);
    },
    isGroupCollapsed: function (groupLabel) {
        return collapsedGroups.has(groupLabel);
    },
    toggleGroup: function (groupLabel) {
        if (collapsedGroups.has(groupLabel)) {
            collapsedGroups.delete(groupLabel);
        }
        else {
            collapsedGroups.add(groupLabel);
        }
    }
}, {
    appendField,
    empty
});
assert.strictEqual(workspaceStatus.textContent, "r - ready - 2 objects");
assert.strictEqual(workspaceList.children.length, 2);
assert.strictEqual(workspaceList.children[0].className, "workspaceGroup");
assert.strictEqual(workspaceList.children[0].children[0].textContent, "v Datasets (1)");
workspaceList.children[0].children[0].click();
assert.deepStrictEqual(Array.from(collapsedGroups), ["Datasets"]);
assert.strictEqual(workspaceList.children[0].children[1].className, "workspaceGroupItems");
assert.strictEqual(workspaceList.children[0].children[1].children[0].className, "workspaceObject active");
assert.strictEqual(workspaceList.children[0].children[1].children[0].children[0].children[0].children[0].textContent, "mtcars");
assert.strictEqual(workspaceList.children[0].children[1].children[0].children[0].children[0].children[1].textContent, "32 rows x 11 columns");
assert.strictEqual(workspaceList.children[0].children[1].children[0].children[0].children[1].children[1].textContent, "viewer");
assert.strictEqual(workspaceList.children[0].children[1].children[0].children[1].children[0].textContent, "Make active");
assert.strictEqual(workspaceList.children[0].children[1].children[0].children[1].children[0].disabled, false);
workspaceList.children[0].children[1].children[0].children[1].children[0].click();
assert.deepStrictEqual(workspaceCalls, ["active:mtcars"]);
assert.strictEqual(workspaceList.children[0].children[1].children[0].children[1].children[1].textContent, "Open");
assert.strictEqual(workspaceList.children[0].children[1].children[0].children[1].children[1].disabled, false);
workspaceList.children[0].children[1].children[0].children[1].children[1].click();
assert.deepStrictEqual(workspaceCalls, ["active:mtcars", "active:mtcars", "preview:mtcars"]);
workspaceList.children[0].children[1].children[0].dblclick();
assert.deepStrictEqual(workspaceCalls, ["active:mtcars", "active:mtcars", "preview:mtcars", "active:mtcars", "preview:mtcars"]);
assert.strictEqual(workspaceList.children[0].children[1].children[0].children[1].children[4].textContent, "Remove");
assert.strictEqual(workspaceList.children[0].children[1].children[0].children[1].children[4].disabled, false);
assert.strictEqual(workspaceList.children[1].children[0].textContent, "v Functions (1)");
assert.strictEqual(workspaceList.children[1].children[1].children[0].children[1].children[0].disabled, true);
assert.strictEqual(workspaceList.children[1].children[1].children[0].children[1].children[4].textContent, "Remove");
assert.strictEqual(workspaceList.children[1].children[1].children[0].children[1].children[4].disabled, true);
console.log("Runtime panel helpers verified.");
