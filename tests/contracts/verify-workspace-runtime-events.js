"use strict";

const assert = require("assert");

const {
    createWorkspaceRuntimeEventController
} = require("../../shared/base-app/features/workspace-pane/workspaceRuntimeEventController");

const createWorkspaceEvent = function(index) {
    return {
        id: `event_${index}`,
        type: "workspace.update",
        providerId: "r",
        createdAt: `2026-06-20T00:00:${String(index).padStart(2, "0")}Z`,
        detail: `event ${index}`,
        payload: {
            added: [
                {
                    name: `dataset_${index}`,
                    kind: "data.frame",
                    detail: "2 rows"
                }
            ],
            updated: [],
            removed: [],
            message: "updated"
        }
    };
};

let workspaceSnapshot = {
    status: "ready",
    providerId: "r",
    objects: [],
    message: "",
    refreshedAt: ""
};
const renderedSnapshots = [];
const activeDatasets = [];

const controller = createWorkspaceRuntimeEventController({
    getWorkspaceSnapshot: () => workspaceSnapshot,
    getRuntimeProviderId: () => "r",
    renderWorkspace: (snapshot) => {
        workspaceSnapshot = snapshot;
        renderedSnapshots.push(snapshot);
    },
    setActiveDataset: async (objectName) => {
        activeDatasets.push(objectName);
    }
});

for (let index = 0; index < 161; index += 1) {
    controller.applySnapshot({
        status: "ready",
        providerId: "r",
        events: [createWorkspaceEvent(index)],
        message: "",
        refreshedAt: ""
    });
}

assert.strictEqual(renderedSnapshots.length, 161);

controller.applySnapshot({
    status: "ready",
    providerId: "r",
    events: [createWorkspaceEvent(160)],
    message: "",
    refreshedAt: ""
});

assert.strictEqual(
    renderedSnapshots.length,
    161,
    "recent duplicate workspace events should still be deduped"
);

controller.applySnapshot({
    status: "ready",
    providerId: "r",
    events: [createWorkspaceEvent(0)],
    message: "",
    refreshedAt: ""
});

assert.strictEqual(
    renderedSnapshots.length,
    162,
    "old workspace event keys should be evicted from the bounded dedupe cache"
);
assert.ok(activeDatasets.includes("dataset_160"));

console.log("Workspace runtime event dedupe bounds verified.");
